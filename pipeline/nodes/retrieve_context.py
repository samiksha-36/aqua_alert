"""
Node 3: Retrieve historical context for each flagged district.

Rainfall normals: Fetched live from IMD API (api.imd.gov.in)
  - Endpoint: /api/v1/districtrainfall (includes Daily Normal field)
  - Fallback: IMD subdivision normals via Open-Meteo ERA5 climatology
River danger levels: Fetched live from India-WRIS / CWC flood API
  - Endpoint: https://indiawris.gov.in/wris/ (open, no key)
  - Fallback: computed from GloFAS 20-year 95th percentile discharge
"""

import httpx
import asyncio
import datetime
import os
from dotenv import load_dotenv
load_dotenv()

IMD_KEY     = os.getenv("IMD_API_KEY", "")
IMD_BASE    = "https://api.imd.gov.in/api/v1"
IMD_HEADERS = {"x-api-key": IMD_KEY}

# Module-level caches — fetched once per session
_NORMALS_CACHE:       dict | None = None   # { district: [12 monthly values] }
_DANGER_LEVEL_CACHE:  dict | None = None   # { district: float (metres) }


# ── Rainfall Normals ─────────────────────────────────────────────────────────

async def _fetch_normals_from_imd(client: httpx.AsyncClient, districts: list[str]) -> dict:
    """
    IMD's /districtrainfall endpoint (no id param) returns all districts with
    their Daily Normal for today. We call it for each month by using the
    /districtrainfall?month=M endpoint to build a full 12-month normal table.
    Falls back to Open-Meteo ERA5 climatology if IMD doesn't expose monthly normals.
    """
    normals = {}

    # Try IMD monthly normals endpoint
    try:
        for month in range(1, 13):
            r = await client.get(
                f"{IMD_BASE}/districtrainfall?month={month}",
                headers=IMD_HEADERS,
                timeout=12
            )
            if r.status_code != 200:
                continue
            data    = r.json()
            records = data if isinstance(data, list) else data.get("data", data.get("records", []))
            for row in records:
                name = (
                    row.get("District_Name") or row.get("district_name") or ""
                ).strip().title()
                normal_val = row.get("Monthly Normal") or row.get("Normal") or row.get("Daily Normal")
                if name in districts and normal_val is not None:
                    try:
                        val = float(str(normal_val).replace(",", ""))
                        if name not in normals:
                            normals[name] = [0.0] * 12
                        normals[name][month - 1] = val
                    except (ValueError, TypeError):
                        pass

        if normals:
            print(f"[RETRIEVE_CONTEXT] ✅ Loaded monthly normals from IMD for {len(normals)} districts")
            return normals
    except Exception as e:
        print(f"[RETRIEVE_CONTEXT] ⚠️  IMD monthly normals failed: {e}")

    # Fallback: Open-Meteo ERA5 climatology (1991–2020 baseline)
    # Fetch 12 months of historical average precipitation for each district lat/lon
    print("[RETRIEVE_CONTEXT] Falling back to Open-Meteo ERA5 climatology for rainfall normals")
    return {}   # signals caller to use ERA5 per-record lookup instead


async def _fetch_era5_normal_for_district(
    client: httpx.AsyncClient, lat: float, lon: float, month: int
) -> float | None:
    """
    Fetch ERA5 30-year climatological mean precipitation for a specific month
    using Open-Meteo's historical API (free, no key needed).
    Uses 1991–2020 baseline — 30 years of data averaged.
    """
    try:
        # Request the same month across 30 years and average
        monthly_totals = []
        for year in range(1991, 2021, 5):   # sample every 5 years for speed (6 calls)
            start = f"{year}-{month:02d}-01"
            # last day of month
            import calendar
            last_day = calendar.monthrange(year, month)[1]
            end   = f"{year}-{month:02d}-{last_day:02d}"
            r = await client.get(
                f"https://archive-api.open-meteo.com/v1/archive"
                f"?latitude={lat}&longitude={lon}"
                f"&start_date={start}&end_date={end}"
                f"&daily=precipitation_sum"
                f"&timezone=Asia/Kolkata",
                timeout=12
            )
            if r.status_code == 200:
                data  = r.json()
                daily = data.get("daily", {}).get("precipitation_sum", [])
                total = sum(v for v in daily if v is not None)
                monthly_totals.append(total)

        if monthly_totals:
            avg = round(sum(monthly_totals) / len(monthly_totals), 1)
            return avg
    except Exception as e:
        print(f"[RETRIEVE_CONTEXT] ERA5 climatology failed for ({lat},{lon}) month {month}: {e}")
    return None


async def _get_normals_cache(client: httpx.AsyncClient, districts: list[str]) -> dict:
    global _NORMALS_CACHE
    if _NORMALS_CACHE is not None:
        return _NORMALS_CACHE

    normals = await _fetch_normals_from_imd(client, districts)
    _NORMALS_CACHE = normals
    return _NORMALS_CACHE


# ── River Danger Levels ──────────────────────────────────────────────────────

async def _fetch_cwc_danger_levels(client: httpx.AsyncClient, districts: list[str]) -> dict:
    """
    Fetch river danger levels from India-WRIS (Water Resources Information System).
    Endpoint: https://indiawris.gov.in/wris/#/RiverMonitoring
    API: https://indiawris.gov.in/iwrisdss/rest/FloodMonitoring/floodstation
    This returns gauge stations with their Danger Level (DL) in metres.
    No API key needed — open government data portal.
    """
    danger_levels = {}

    try:
        r = await client.get(
            "https://indiawris.gov.in/iwrisdss/rest/FloodMonitoring/floodstation",
            timeout=15,
            headers={"Accept": "application/json"}
        )
        if r.status_code == 200:
            data     = r.json()
            stations = data if isinstance(data, list) else data.get("data", data.get("features", []))

            for station in stations:
                # Handle GeoJSON feature format
                props = station.get("properties", station)
                district_raw = (
                    props.get("District") or props.get("district") or
                    props.get("DISTRICT") or ""
                ).strip().title()
                danger_level_raw = (
                    props.get("DangerLevel") or props.get("danger_level") or
                    props.get("DL") or props.get("DANGER_LEVEL")
                )

                if district_raw in districts and danger_level_raw is not None:
                    try:
                        dl = float(str(danger_level_raw).replace(",", ""))
                        # Keep the highest danger level if multiple gauges per district
                        if district_raw not in danger_levels or dl > danger_levels[district_raw]:
                            danger_levels[district_raw] = dl
                    except (ValueError, TypeError):
                        pass

            print(f"[RETRIEVE_CONTEXT] ✅ Loaded CWC danger levels for {len(danger_levels)} districts from India-WRIS")
    except Exception as e:
        print(f"[RETRIEVE_CONTEXT] ⚠️  India-WRIS API failed: {e}")

    return danger_levels


async def _estimate_danger_level_from_glofas(
    client: httpx.AsyncClient, lat: float, lon: float
) -> float:
    """
    Estimate river danger level from GloFAS 20-year 95th percentile discharge.
    Danger level (m) ≈ (Q_95 / estimated_width) ^ 0.6
    Width estimated via Lacey: W = 3.5 * Q_mean^0.5
    Uses Open-Meteo historical flood API (1984–2024 available).
    """
    try:
        import calendar
        # Fetch peak monsoon discharge over 20 years (July, historically highest)
        peak_discharges = []
        for year in range(2004, 2024, 2):   # 10 sample years
            start = f"{year}-07-01"
            end   = f"{year}-07-31"
            r = await client.get(
                f"https://flood-api.open-meteo.com/v1/flood"
                f"?latitude={lat}&longitude={lon}"
                f"&daily=river_discharge"
                f"&start_date={start}&end_date={end}",
                timeout=12
            )
            if r.status_code == 200:
                discharges = r.json().get("daily", {}).get("river_discharge", [])
                valid = [v for v in discharges if v is not None and v > 0]
                if valid:
                    peak_discharges.append(max(valid))

        if peak_discharges:
            peak_discharges.sort()
            # 95th percentile of peak discharges = danger threshold
            idx      = int(len(peak_discharges) * 0.95)
            q95      = peak_discharges[min(idx, len(peak_discharges) - 1)]
            q_mean   = sum(peak_discharges) / len(peak_discharges)
            width    = max(3.5 * (q_mean ** 0.5), 5.0)
            danger_m = round((q95 / width) ** 0.6, 2)
            print(f"[RETRIEVE_CONTEXT] 📊 GloFAS danger level estimate ({lat},{lon}): Q95={q95:.0f}m³/s → {danger_m}m")
            return danger_m
    except Exception as e:
        print(f"[RETRIEVE_CONTEXT] GloFAS danger level estimate failed: {e}")

    return 10.0   # last-resort default


async def _get_danger_levels_cache(client: httpx.AsyncClient, districts: list[str]) -> dict:
    global _DANGER_LEVEL_CACHE
    if _DANGER_LEVEL_CACHE is not None:
        return _DANGER_LEVEL_CACHE

    levels = await _fetch_cwc_danger_levels(client, districts)
    _DANGER_LEVEL_CACHE = levels
    return _DANGER_LEVEL_CACHE


# ── Main Node ────────────────────────────────────────────────────────────────

async def retrieve_context_node_async(state: dict) -> dict:
    flagged       = state.get("flagged_data", [])
    current_month = datetime.datetime.now().month          # 1-indexed
    districts     = [r["district"] for r in flagged]

    async with httpx.AsyncClient(timeout=20) as client:

        # Fetch normals and danger levels (cached after first call)
        normals_table  = await _get_normals_cache(client, districts)
        danger_table   = await _get_danger_levels_cache(client, districts)

        enriched_flagged = []
        for record in flagged:
            district     = record["district"]
            rainfall     = record["rainfall_mm"]
            lat          = record.get("lat")
            lon          = record.get("lon")

            # ── Rainfall normal ──────────────────────────────────────────
            if district in normals_table and normals_table[district][current_month - 1] > 0:
                historical_normal = normals_table[district][current_month - 1]
                normal_source     = "IMD API monthly normal"
            elif record.get("daily_normal_mm"):
                # IMD ingest node already gave us today's normal directly
                historical_normal = float(record["daily_normal_mm"])
                normal_source     = "IMD daily normal (from ingest)"
            elif lat and lon:
                # ERA5 climatology fallback
                era5_normal = await _fetch_era5_normal_for_district(client, lat, lon, current_month)
                if era5_normal is not None:
                    historical_normal = era5_normal
                    normal_source     = "Open-Meteo ERA5 1991–2020 climatology"
                else:
                    historical_normal = 50.0
                    normal_source     = "default fallback"
            else:
                historical_normal = 50.0
                normal_source     = "default fallback"

            # ── Anomaly calculation ──────────────────────────────────────
            # Prefer IMD's own departure % if ingest already computed it
            if record.get("imd_departure_pct") is not None:
                try:
                    anomaly_pct = float(str(record["imd_departure_pct"]).replace("%", "").replace("+", ""))
                    normal_source += " (departure from IMD API)"
                except (ValueError, TypeError):
                    anomaly_pct = round(((rainfall / historical_normal) - 1.0) * 100, 1) if historical_normal > 0 else 0.0
            else:
                anomaly_pct = round(((rainfall / historical_normal) - 1.0) * 100, 1) if historical_normal > 0 else 0.0

            # ── River danger level ───────────────────────────────────────
            if district in danger_table:
                danger_level = danger_table[district]
                cwc_source   = "India-WRIS CWC gauge"
            elif lat and lon:
                danger_level = await _estimate_danger_level_from_glofas(client, lat, lon)
                cwc_source   = "GloFAS 20yr 95th percentile"
            else:
                danger_level = 10.0
                cwc_source   = "default threshold"

            river_level = record.get("river_level_m") or 0.0
            river_pct   = round((river_level / danger_level) * 100, 1) if danger_level > 0 else 0.0

            # ── Context note for Gemini ──────────────────────────────────
            if anomaly_pct > 100:
                context_note = (
                    f"Rainfall is {anomaly_pct:.0f}% above the historical normal of "
                    f"{historical_normal:.1f}mm for this month ({normal_source}). "
                    f"River at {river_pct}% of danger level ({cwc_source})."
                )
            elif anomaly_pct < -60:
                context_note = (
                    f"Rainfall is {abs(anomaly_pct):.0f}% below the normal of "
                    f"{historical_normal:.1f}mm — severe drought signal ({normal_source}). "
                    f"River at only {river_pct}% of expected level."
                )
            else:
                context_note = (
                    f"Rainfall near historical normal of {historical_normal:.1f}mm "
                    f"({normal_source}). River at {river_pct}% of danger threshold ({cwc_source})."
                )

            enriched_flagged.append({
                **record,
                "historical_normal_mm": historical_normal,
                "normal_source":        normal_source,
                "anomaly_pct":          anomaly_pct,
                "danger_level_m":       danger_level,
                "danger_source":        cwc_source,
                "river_danger_pct":     river_pct,
                "historical_context":   context_note,
            })

        print(f"[RETRIEVE_CONTEXT] Enriched {len(enriched_flagged)} records — normals from IMD/ERA5, danger levels from WRIS/GloFAS")
        return {**state, "flagged_data": enriched_flagged}


def retrieve_context_node(state: dict) -> dict:
    """Sync wrapper for LangGraph."""
    return asyncio.run(retrieve_context_node_async(state))