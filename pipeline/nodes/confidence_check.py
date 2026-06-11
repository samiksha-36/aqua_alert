"""
Node 6: Confidence check — filter out low-quality alerts before dispatch.
Prevents alert fatigue by only dispatching alerts that clear the threshold.

Also enriches the cascade_score with anomaly data from retrieve_context.
"""

DISPATCH_THRESHOLD = 0.40  # alerts below this score are not dispatched

def confidence_check_node(state: dict) -> dict:
    """
    Filters alerts_ready to only those worth dispatching.
    Boosts confidence score if anomaly_pct is very high (historical deviation).
    """
    alerts = state.get("alerts_ready", [])
    passed = []
    dropped = []

    for alert in alerts:
        score = alert.get("cascade_score", alert.get("risk_score", 0))

        # Boost score if rainfall is historically anomalous (e.g. 300% above normal)
        anomaly = alert.get("anomaly_pct", 0)
        if anomaly > 200:
            score = min(1.0, score + 0.08)
        elif anomaly < -70:
            score = min(1.0, score + 0.06)

        alert["cascade_score"] = round(score, 3)

        if score >= DISPATCH_THRESHOLD:
            passed.append(alert)
        else:
            dropped.append(alert["district"])

    if dropped:
        print(f"[CONFIDENCE_CHECK] Dropped {len(dropped)} low-confidence alerts: {dropped}")
    print(f"[CONFIDENCE_CHECK] {len(passed)}/{len(alerts)} alerts cleared for dispatch")

    return {**state, "alerts_ready": passed}