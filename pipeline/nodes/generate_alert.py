import os
import asyncio
import httpx

GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent"

async def generate_alert_node(state: dict) -> dict:
    """
    Node 5: Call Gemini to produce trilingual alert text for each flagged record.
    """
    enriched = state.get("enriched_data", [])
    api_key  = os.getenv("GEMINI_API_KEY")

    results = []

    async with httpx.AsyncClient(timeout=30) as client:
        tasks = [_generate_one(client, r, api_key) for r in enriched]
        results = await asyncio.gather(*tasks, return_exceptions=True)

    alerts_ready = []
    for i, result in enumerate(results):
        if isinstance(result, Exception):
            print(f"[GEMINI] Failed for {enriched[i]['district']}: {result} — using fallback")
            alerts_ready.append({**enriched[i], "alert_text": _fallback(enriched[i])})
        else:
            alerts_ready.append(result)

    return {**state, "alerts_ready": alerts_ready}


async def _generate_one(client, record, api_key):
    prompt = f"""
You are AquaAlert, an AI water crisis early warning system for rural India.

Generate a flood/drought alert for officials and community workers.
Respond ONLY with a valid JSON object. No markdown. No explanation.

District: {record['district']}, {record['state']}
Alert Type: {record['alert_type']}
Risk Level: {record['risk_level']}
Rainfall: {record['rainfall_mm']}mm
River Level: {record['river_level_m']}m
Soil Moisture: {record['soil_moisture_pct']}%
Temperature: {record['temperature_c']}°C
Risk Score: {record['risk_score']}
Estimated Affected: {record['impact_estimate']:,} people
Historical Context: {record.get('historical_context', 'No historical data available.')}
Rainfall Anomaly: {record.get('anomaly_pct', 0):+.0f}% vs monthly normal

Return exactly this JSON:
{{
  "en": "2-3 sentence alert in English for government officials",
  "hi": "2-3 sentence alert in Hindi (Devanagari) for ASHA workers and Panchayat",
  "regional": "1-2 sentence alert in Punjabi or Marwari based on state (Punjabi for Punjab, Marwari for Rajasthan)"
}}
"""

    response = await client.post(
        f"{GEMINI_URL}?key={api_key}",
        json={"contents": [{"parts": [{"text": prompt}]}]},
    )
    data = response.json()

    raw_text = data["candidates"][0]["content"]["parts"][0]["text"].strip()

    # Strip markdown code fences if present
    if raw_text.startswith("```"):
        raw_text = raw_text.split("\n", 1)[1]
        raw_text = raw_text.rsplit("```", 1)[0]

    import json
    alert_text = json.loads(raw_text.strip())
    return {**record, "alert_text": alert_text}


def _fallback(record):
    t = record["alert_type"]
    d = record["district"]
    r = record["rainfall_mm"]
    s = record["state"]
    return {
        "en": f"{t.capitalize()} warning for {d}, {s}. Rainfall: {r}mm. Immediate precaution advised.",
        "hi": f"{d}, {s} में {t} की चेतावनी। {r}mm वर्षा दर्ज। तत्काल सावधानी बरतें।",
        "regional": f"{d} ਵਿੱਚ ਖ਼ਤਰੇ ਦੀ ਚੇਤਾਵਨੀ।",
    }