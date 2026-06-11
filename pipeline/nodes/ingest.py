import httpx
import random
from typing import Any

# Global demo districts — real coords for Open-Meteo
DISTRICTS = [
    {"district": "Ludhiana",   "state": "Punjab",    "lat": 30.9, "lon": 75.85, "river_baseline": 5.0},
    {"district": "Patiala",    "state": "Punjab",    "lat": 30.33,"lon": 76.4,  "river_baseline": 4.5},
    {"district": "Barmer",     "state": "Rajasthan", "lat": 25.75,"lon": 71.4,  "river_baseline": 0.5},
    {"district": "Jaisalmer",  "state": "Rajasthan", "lat": 26.92,"lon": 70.9,  "river_baseline": 0.2},
    {"district": "Patna",      "state": "Bihar",     "lat": 25.59,"lon": 85.13, "river_baseline": 7.0},
    {"district": "Varanasi",   "state": "UP",        "lat": 25.31,"lon": 83.01, "river_baseline": 6.5},
]

async def ingest_node(state: dict) -> dict:
    """
    Node 1: Fetch live weather data from Open-Meteo for all districts.
    Falls back to synthetic data if API is unreachable.
    """
    results = []

    async with httpx.AsyncClient(timeout=10) as client:
        for d in DISTRICTS:
            try:
                url = (
                    f"https://api.open-meteo.com/v1/forecast"
                    f"?latitude={d['lat']}&longitude={d['lon']}"
                    f"&daily=precipitation_sum,temperature_2m_max,et0_fao_evapotranspiration"
                    f"&current=precipitation,soil_moisture_0_to_1cm"
                    f"&timezone=Asia/Kolkata&forecast_days=1"
                )
                r = await client.get(url)
                data = r.json()

                rainfall    = data.get("daily", {}).get("precipitation_sum", [0])[0] or 0
                temperature = data.get("daily", {}).get("temperature_2m_max", [30])[0] or 30
                soil_raw    = data.get("current", {}).get("soil_moisture_0_to_1cm", 0.3) or 0.3
                soil_pct    = round(min(soil_raw * 100, 100), 1)

                # Simulate river level (no public free API) — scaled from rainfall
                river_level = round(d["river_baseline"] + (rainfall / 20), 2)

                results.append({
                    "district":          d["district"],
                    "state":             d["state"],
                    "lat":               d["lat"],
                    "lon":               d["lon"],
                    "rainfall_mm":       round(rainfall, 1),
                    "river_level_m":     river_level,
                    "soil_moisture_pct": soil_pct,
                    "temperature_c":     round(temperature, 1),
                    "source":            "open-meteo",
                })

            except Exception as e:
                print(f"[INGEST] Open-Meteo failed for {d['district']}: {e} — using synthetic")
                results.append(_synthetic(d))

    return {**state, "raw_data": results}


def _synthetic(d: dict) -> dict:
    rainfall = random.uniform(0, 200)
    return {
        "district":          d["district"],
        "state":             d["state"],
        "lat":               d["lat"],
        "lon":               d["lon"],
        "rainfall_mm":       round(rainfall, 1),
        "river_level_m":     round(d["river_baseline"] + rainfall / 20, 2),
        "soil_moisture_pct": round(random.uniform(5, 95), 1),
        "temperature_c":     round(random.uniform(25, 45), 1),
        "source":            "synthetic",
    }