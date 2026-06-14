import httpx
import random

DISTRICTS = [
    {"district": "Ludhiana",  "state": "Punjab",    "lat": 30.9,  "lon": 75.85, "river_width": 180},
    {"district": "Patiala",   "state": "Punjab",    "lat": 30.33, "lon": 76.4,  "river_width": 120},
    {"district": "Barmer",    "state": "Rajasthan", "lat": 25.75, "lon": 71.4,  "river_width": 30},
    {"district": "Jaisalmer", "state": "Rajasthan", "lat": 26.92, "lon": 70.9,  "river_width": 20},
    {"district": "Patna",     "state": "Bihar",     "lat": 25.59, "lon": 85.13, "river_width": 600},
    {"district": "Varanasi",  "state": "UP",        "lat": 25.31, "lon": 83.01, "river_width": 500},
]

async def ingest_node(state: dict) -> dict:
    results = []

    async with httpx.AsyncClient(timeout=15) as client:
        for d in DISTRICTS:
            try:
                # --- Call 1: Weather (rainfall, temperature, soil moisture) ---
                weather_url = (
                    f"https://api.open-meteo.com/v1/forecast"
                    f"?latitude={d['lat']}&longitude={d['lon']}"
                    f"&daily=precipitation_sum,temperature_2m_max"
                    f"&current=soil_moisture_0_to_1cm"
                    f"&timezone=Asia/Kolkata&forecast_days=1"
                )
                wr = await client.get(weather_url)
                weather = wr.json()

                rainfall    = weather.get("daily", {}).get("precipitation_sum", [0])[0] or 0
                temperature = weather.get("daily", {}).get("temperature_2m_max", [30])[0] or 30
                soil_raw    = weather.get("current", {}).get("soil_moisture_0_to_1cm", 0.3) or 0.3
                soil_pct    = round(min(soil_raw * 100, 100), 1)

                # --- Call 2: Flood API (real river discharge from GloFAS) ---
                flood_url = (
                    f"https://flood-api.open-meteo.com/v1/flood"
                    f"?latitude={d['lat']}&longitude={d['lon']}"
                    f"&daily=river_discharge"
                    f"&forecast_days=1"
                )
                fr = await client.get(flood_url)
                flood = fr.json()

                discharge = flood.get("daily", {}).get("river_discharge", [None])[0]

                # Convert discharge (m³/s) → approx river level (m)
                # Using Manning's proxy: level ≈ (Q / width) ^ 0.6
                if discharge and discharge > 0:
                    river_level = round((discharge / d["river_width"]) ** 0.6, 2)
                    river_source = "glofas"
                else:
                    river_level = round((rainfall / 20), 2)  # fallback only if flood API fails
                    river_source = "estimated"

                results.append({
                    "district":          d["district"],
                    "state":             d["state"],
                    "lat":               d["lat"],
                    "lon":               d["lon"],
                    "rainfall_mm":       round(rainfall, 1),
                    "river_level_m":     river_level,
                    "river_discharge_m3s": round(discharge, 1) if discharge else None,
                    "soil_moisture_pct": soil_pct,
                    "temperature_c":     round(temperature, 1),
                    "source":            "open-meteo",
                    "river_source":      river_source,
                })

            except Exception as e:
                print(f"[INGEST] Failed for {d['district']}: {e} — skipping (no synthetic fallback)")
                skipped = _synthetic(d)
                if skipped:
                    results.append(skipped)
                # else: district is silently skipped — no fake data dispatched

    return {**state, "raw_data": results}


def _synthetic(d: dict) -> dict:
    # DO NOT generate random data — skip this district and log it
    # Returning None signals to caller to filter this district out
    print(f"[INGEST] ⚠️  Skipping {d['district']} — Open-Meteo unavailable, no synthetic fallback.")
    return None