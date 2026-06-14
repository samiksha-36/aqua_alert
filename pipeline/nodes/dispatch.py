import os
import httpx

import os

def _get_email_recipients():
    env_val = os.getenv("ALERT_EMAIL_RECIPIENTS", "")
    if env_val:
        return [e.strip() for e in env_val.split(",") if e.strip()]
    return ["samikshakhaire05@gmail.com", "kaushishsaksham@gmail.com"]

async def dispatch_node(state: dict) -> dict:
    """
    Node 7: POST each generated alert to the Node.js backend.
    Backend handles email + WhatsApp reporter ping.
    """
    alerts = state.get("alerts_ready", [])
    backend_url = os.getenv("BACKEND_URL", "http://localhost:5000")
    dispatched  = []
    failed      = []

    async with httpx.AsyncClient(timeout=15) as client:
        for alert in alerts:
            payload = {
                "district":          alert["district"],
                "state":             alert["state"],
                "alertType":         alert["alert_type"],
                "riskLevel":         alert["risk_level"],
                "initialConfidence": alert["cascade_score"],
                "alertText":         alert["alert_text"],
                "triggerData": {
                    "rainfall_mm":       alert["rainfall_mm"],
                    "river_level_m":     alert["river_level_m"],
                    "soil_moisture_pct": alert["soil_moisture_pct"],
                    "temperature_c":     alert["temperature_c"],
                },
                "emailRecipients": _get_email_recipients(),
            }
            try:
                r = await client.post(f"{backend_url}/api/alerts", json=payload)
                result = r.json()
                if result.get("success"):
                    print(f"[DISPATCH] ✅ {alert['district']} → {result['alertId']}")
                    dispatched.append(result["alertId"])
                else:
                    print(f"[DISPATCH] ❌ {alert['district']}: {result.get('error')}")
                    failed.append(alert["district"])
            except Exception as e:
                print(f"[DISPATCH] Exception for {alert['district']}: {e}")
                failed.append(alert["district"])

    return {**state, "dispatched": dispatched, "failed": failed}