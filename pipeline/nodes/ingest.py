"""
Node 1: Ingest real-time weather and flood data.

Primary source: IMD Official API (api.imd.gov.in)
  - District mapping fetched live from IMD at startup (no hardcoded IDs)
  - District-wise Rainfall (actual + normal + departure)
  - District-wise Warnings (5-day official IMD warnings)
  - District-wise Nowcast (real-time storm categories)
Fallback: Open-Meteo + GloFAS if IMD API is unreachable.
"""

import httpx
import os
import asyncio
from dotenv import load_dotenv
load_dotenv()

IMD_KEY     = os.getenv("IMD_API_KEY", "")
IMD_BASE    = "https://api.imd.gov.in/api/v1"
IMD_HEADERS = {"x-api-key": IMD_KEY}

# Target districts — only names, everything else resolved from IMD API
TARGET_DISTRICTS = [
    "Ludhiana", "Patiala", "Barmer", "Jaisalmer", "Patna", "Varanasi"
]

# Module-level cache — populated once per session from IMD API
_DISTRICT_MAP: dict | None = None   # { "Ludhiana": {"id": "327", "lat": 30.9, "lon": 75.85, ...} }

# IMD warning codes
FLOOD_WARNING_CODES = {2, 16, 17}   # Heavy Rain, Very Heavy Rain, Extremely Heavy Rain
HEAT_WARNING_CODES  = {9, 10, 11}   # Heat Wave, Hot Day, Warm Night

# River width lookup via Open-Meteo river discharge + Manning calibration
# This is computed dynamically from GloFAS discharge — see _estimate_river_width()
# No hardcoded widths.


async def _build_district_map(client: httpx.AsyncClient) -> dict:
    """
    Fetch the full IMD district list from:
      GET /api/v1/districtrainfall  (no id param → returns all districts)
      GET /api/v1/cityforecast_mapping  (has lat/lon per district)

    Returns { district_name: { id, lat, lon, state } }
    """
    global _DISTRICT_MAP
    if _DISTRICT_MAP is not None:
        return _DISTRICT_MAP

    district_map = {}

    # Step 1: Fetch full district rainfall list — gives district IDs and names
    try:
        r = await client.get(f"{IMD_BASE}/districtrainfall", headers=IMD_HEADERS, timeout=15)
        if r.status_code == 200:
            data = r.json()
            # Response is a list of district records
            records = data if isinstance(data, list) else data.get("data", data.get("records", []))
            for row in records:
                name = (
                    row.get("District_Name") or
                    row.get("district_name") or
                    row.get("DistrictName") or ""
                ).strip().title()
                did = str(
                    row.get("id") or row.get("District_ID") or
                    row.get("district_id") or row.get("ID") or ""
                ).strip()
                state = (
                    row.get("State_Name") or row.get("state_name") or
                    row.get("StateName") or ""
                ).strip().title()
                if name and did:
                    district_map[name] = {"id": did, "state": state, "lat": None, "lon": None}
            print(f"[INGEST] ✅ Loaded {len(district_map)} districts from IMD districtrainfall")
        else:
            print(f"[INGEST] ⚠️  districtrainfall returned {r.status_code}")
    except Exception as e:
        print(f"[INGEST] ❌ Failed to fetch IMD district list: {e}")

    # Step 2: Fetch city/district lat-lon mapping
    try:
        r = await client.get(f"{IMD_BASE}/cityforecast_mapping", headers=IMD_HEADERS, timeout=15)
        if r.status_code == 200:
            mapping = r.json()
            entries = mapping if isinstance(mapping, list) else mapping.get("data", mapping.get("records", []))
            for row in entries:
                name = (
                    row.get("District_Name") or row.get("district_name") or
                    row.get("City_Name") or row.get("city_name") or ""
                ).strip().title()
                lat = row.get("Latitude") or row.get("latitude") or row.get("lat")
                lon = row.get("Longitude") or row.get("longitude") or row.get("lon")
                if name and lat and lon and name in district_map:
                    district_map[name]["lat"] = float(lat)
                    district_map[name]["lon"] = float(lon)
            print(f"[INGEST] ✅ Enriched district map with lat/lon from IMD cityforecast_mapping")
        else:
            print(f"[INGEST] ⚠️  cityforecast_mapping returned {r.status_code}")
    except Exception as e:
        print(f"[INGEST] ⚠️  cityforecast_mapping failed: {e}")

    # Step 3: For any target district still missing lat/lon, use Nominatim geocoding (free, no key)
    missing = [n for n in TARGET_DISTRICTS if n in district_map and (
        not district_map[n].get("lat") or not district_map[n].get("lon")
    )]
    if missing:
        print(f"[INGEST] Geocoding {len(missing)} districts via Nominatim: {missing}")
        for name in missing:
            try:
                geo = await client.get(
                    f"https://nominatim.openstreetmap.org/search"
                    f"?q={name}+India&format=json&limit=1",
                    headers={"User-Agent": "AquaAlert/1.0"},
                    timeout=8
                )
                results = geo.json()
                if results:
                    district_map[name]["lat"] = float(results[0]["lat"])
                    district_map[name]["lon"] = float(results[0]["lon"])
                    print(f"[INGEST] 📍 Geocoded {name}: {results[0]['lat']}, {results[0]['lon']}")
            except Exception as e:
                print(f"[INGEST] ⚠️  Geocoding failed for {name}: {e}")

    # Step 4: For target districts not in IMD list at all — try Nominatim for lat/lon only
    for name in TARGET_DISTRICTS:
        if name not in district_map:
            print(f"[INGEST] ⚠️  {name} not found in IMD district list — will geocode and use Open-Meteo fallback")
            district_map[name] = {"id": None, "state": "", "lat": None, "lon": None}
            try:
                geo = await client.get(
                    f"https://nominatim.openstreetmap.org/search"
                    f"?q={name}+India&format=json&limit=1",
                    headers={"User-Agent": "AquaAlert/1.0"},
                    timeout=8
                )
                results = geo.json()
                if results:
                    district_map[name]["lat"] = float(results[0]["lat"])
                    district_map[name]["lon"] = float(results[0]["lon"])
            except Exception:
                pass

    _DISTRICT_MAP = district_map
    return _DISTRICT_MAP


async def _estimate_river_width(client: httpx.AsyncClient, lat: float, lon: float) -> float:
    """
    Estimate river width dynamically from GloFAS discharge using a Manning-calibrated formula.
    Width (m) ≈ 3.5 × Q^0.5  (regime channel equation, Lacey 1930)
    This avoids all hardcoded river widths.
    Returns estimated width in metres, minimum 5m.
    """
    try:
        fr = await client.get(
            f"https://flood-api.open-meteo.com/v1/flood"
            f"?latitude={lat}&longitude={lon}"
            f"&daily=river_discharge&forecast_days=1",
            timeout=10
        )
        flood     = fr.json()
        discharge = flood.get("daily", {}).get("river_discharge", [None])[0]
        if discharge and discharge > 0:
            # Lacey regime channel: W = 3.5 * Q^0.5
            width = round(3.5 * (discharge ** 0.5), 1)
            return max(width, 5.0)
    except Exception:
        pass
    return 50.0   # fallback if GloFAS is down


async def _fetch_imd_district(client: httpx.AsyncClient, district_id: str, district_name: str) -> dict:
    """Fetch from 3 IMD endpoints for one district."""
    rainfall_data, warning_data, nowcast_data = {}, {}, {}

    try:
        r = await client.get(f"{IMD_BASE}/districtrainfall?id={district_id}", headers=IMD_HEADERS)
        rainfall_data = r.json() if r.status_code == 200 else {}
    except Exception as e:
        print(f"[INGEST][IMD] districtrainfall failed for {district_name}: {e}")

    try:
        r = await client.get(f"{IMD_BASE}/districtwarning?id={district_id}", headers=IMD_HEADERS)
        warning_data = r.json() if r.status_code == 200 else {}
    except Exception as e:
        print(f"[INGEST][IMD] districtwarning failed for {district_name}: {e}")

    try:
        r = await client.get(f"{IMD_BASE}/districtnowcast?id={district_id}", headers=IMD_HEADERS)
        nowcast_data = r.json() if r.status_code == 200 else {}
    except Exception as e:
        print(f"[INGEST][IMD] districtnowcast failed for {district_name}: {e}")

    return {"rainfall": rainfall_data, "warning": warning_data, "nowcast": nowcast_data}


def _parse_imd_data(imd: dict, district_name: str, state: str, lat: float, lon: float, river_width: float) -> dict:
    """Parse IMD API response into AquaAlert standard record format."""
    rf = imd.get("rainfall", {})
    wn = imd.get("warning",  {})
    nc = imd.get("nowcast",  {})

    try:
        rainfall = float(rf.get("Daily Actual", 0) or 0)
    except (ValueError, TypeError):
        rainfall = 0.0

    try:
        daily_normal = float(rf.get("Daily Normal", 0) or 0)
    except (ValueError, TypeError):
        daily_normal = None

    departure_pct = rf.get("Daily Departure Per", None)
    imd_category  = rf.get("Daily Category", "ND")

    day1_warnings = []
    raw_day1 = wn.get("Day_1", "1")
    if raw_day1:
        try:
            day1_warnings = [int(x.strip()) for x in str(raw_day1).split(",") if x.strip()]
        except ValueError:
            day1_warnings = [1]

    warning_color     = wn.get("Day1_Color", 4)
    has_flood_warning = bool(set(day1_warnings) & FLOOD_WARNING_CODES)
    has_heat_warning  = bool(set(day1_warnings) & HEAT_WARNING_CODES)

    nowcast_message  = nc.get("message", "")
    nowcast_category = max(
        (int(nc.get(f"Cat{i}", 0) or 0) for i in range(1, 20) if nc.get(f"Cat{i}")),
        default=1
    )

    if has_flood_warning or nowcast_category >= 12:
        alert_type = "FLOOD"
    elif has_heat_warning:
        alert_type = "DROUGHT"
    elif imd_category in ("LD", "NR") and not has_flood_warning:
        alert_type = "DROUGHT"
    else:
        alert_type = "FLOOD"

    return {
        "district":            district_name,
        "state":               state,
        "lat":                 lat,
        "lon":                 lon,
        "river_width_m":       river_width,
        "rainfall_mm":         round(rainfall, 1),
        "daily_normal_mm":     daily_normal,
        "imd_departure_pct":   departure_pct,
        "imd_category":        imd_category,
        "day1_warnings":       day1_warnings,
        "warning_color":       warning_color,
        "has_flood_warning":   has_flood_warning,
        "has_heat_warning":    has_heat_warning,
        "nowcast_category":    nowcast_category,
        "nowcast_message":     nowcast_message,
        "alert_type":          alert_type,
        "source":              "imd",
        "river_level_m":       None,
        "river_discharge_m3s": None,
        "river_source":        None,
        "soil_moisture_pct":   None,
        "temperature_c":       None,
    }


async def _fetch_openmeteo(client: httpx.AsyncClient, lat: float, lon: float, river_width: float) -> dict:
    """Fetch supplementary data: soil moisture, temperature, river level from GloFAS."""
    result = {
        "soil_moisture_pct":   30.0,
        "temperature_c":       30.0,
        "river_level_m":       0.0,
        "river_discharge_m3s": None,
        "river_source":        "estimated",
        "rainfall_mm_om":      0.0,
    }

    try:
        wr = await client.get(
            f"https://api.open-meteo.com/v1/forecast"
            f"?latitude={lat}&longitude={lon}"
            f"&daily=precipitation_sum,temperature_2m_max"
            f"&current=soil_moisture_0_to_1cm"
            f"&timezone=Asia/Kolkata&forecast_days=1",
            timeout=10
        )
        weather = wr.json()
        result.update({
            "soil_moisture_pct": round(min((weather.get("current", {}).get("soil_moisture_0_to_1cm", 0.3) or 0.3) * 100, 100), 1),
            "temperature_c":     round(weather.get("daily", {}).get("temperature_2m_max", [30])[0] or 30, 1),
            "rainfall_mm_om":    round(weather.get("daily", {}).get("precipitation_sum", [0])[0] or 0, 1),
        })
    except Exception as e:
        print(f"[INGEST][OM] Weather failed: {e}")

    try:
        fr = await client.get(
            f"https://flood-api.open-meteo.com/v1/flood"
            f"?latitude={lat}&longitude={lon}"
            f"&daily=river_discharge&forecast_days=1",
            timeout=10
        )
        discharge = fr.json().get("daily", {}).get("river_discharge", [None])[0]
        if discharge and discharge > 0:
            result.update({
                "river_level_m":       round((discharge / river_width) ** 0.6, 2),
                "river_discharge_m3s": round(discharge, 1),
                "river_source":        "glofas",
            })
        else:
            result["river_level_m"] = round(result["rainfall_mm_om"] / 20, 2)
    except Exception as e:
        print(f"[INGEST][GloFAS] Failed: {e}")

    return result


async def ingest_node(state: dict) -> dict:
    results = []

    async with httpx.AsyncClient(timeout=20) as client:

        # ── Step 1: Build district map from IMD API (cached after first call) ──
        district_map = await _build_district_map(client)

        for name in TARGET_DISTRICTS:
            info = district_map.get(name, {})
            district_id = info.get("id")
            state_name  = info.get("state", "")
            lat         = info.get("lat")
            lon         = info.get("lon")

            if not lat or not lon:
                print(f"[INGEST] ❌ No lat/lon for {name} — skipping")
                continue

            # ── Step 2: Estimate river width dynamically from GloFAS ──────
            river_width = await _estimate_river_width(client, lat, lon)
            print(f"[INGEST] 🌊 {name} estimated river width: {river_width}m")

            record = None

            # ── Step 3: Primary — IMD official API ───────────────────────
            if district_id and IMD_KEY:
                try:
                    imd_raw = await _fetch_imd_district(client, district_id, name)
                    record  = _parse_imd_data(imd_raw, name, state_name, lat, lon, river_width)
                    print(f"[INGEST][IMD] ✅ {name}: {record['rainfall_mm']}mm | {record['imd_category']} | warnings={record['day1_warnings']}")
                except Exception as e:
                    print(f"[INGEST][IMD] ❌ {name}: {e} — falling back")
                    record = None

            # ── Step 4: Fallback — Open-Meteo only ───────────────────────
            if record is None:
                try:
                    om = await _fetch_openmeteo(client, lat, lon, river_width)
                    record = {
                        "district":            name,
                        "state":               state_name,
                        "lat":                 lat,
                        "lon":                 lon,
                        "river_width_m":       river_width,
                        "rainfall_mm":         om["rainfall_mm_om"],
                        "daily_normal_mm":     None,
                        "imd_departure_pct":   None,
                        "imd_category":        None,
                        "day1_warnings":       [],
                        "warning_color":       4,
                        "has_flood_warning":   False,
                        "has_heat_warning":    False,
                        "nowcast_category":    1,
                        "nowcast_message":     "",
                        "alert_type":          "DROUGHT" if (om["rainfall_mm_om"] < 5 and om["temperature_c"] > 38) else "FLOOD",
                        "source":              "open-meteo-fallback",
                        "river_level_m":       om["river_level_m"],
                        "river_discharge_m3s": om["river_discharge_m3s"],
                        "river_source":        om["river_source"],
                        "soil_moisture_pct":   om["soil_moisture_pct"],
                        "temperature_c":       om["temperature_c"],
                    }
                    print(f"[INGEST][OM] ✅ {name}: {record['rainfall_mm']}mm (fallback)")
                except Exception as e:
                    print(f"[INGEST] ❌ All sources failed for {name}: {e} — skipping")
                    continue

            # ── Step 5: Supplement IMD record with Open-Meteo soil/temp/river ──
            if record.get("source") == "imd":
                om = await _fetch_openmeteo(client, lat, lon, river_width)
                record.update({
                    "soil_moisture_pct":      om["soil_moisture_pct"],
                    "temperature_c":          om["temperature_c"],
                    "river_level_m":          om["river_level_m"],
                    "river_discharge_m3s":    om["river_discharge_m3s"],
                    "river_source":           om["river_source"],
                    "rainfall_mm_crosscheck": om["rainfall_mm_om"],
                })

            results.append(record)

    print(f"[INGEST] Complete — {len(results)}/{len(TARGET_DISTRICTS)} districts ingested")
    return {**state, "raw_data": results}