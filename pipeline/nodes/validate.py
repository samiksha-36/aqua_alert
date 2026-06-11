def validate_node(state: dict) -> dict:
    """
    Node 2: Clean data, flag anomalies, filter records worth alerting on.
    """
    raw   = state.get("raw_data", [])
    clean = []

    for record in raw:
        r = record.copy()

        # Clamp values to physical ranges
        r["rainfall_mm"]       = max(0, min(r["rainfall_mm"], 500))
        r["river_level_m"]     = max(0, min(r["river_level_m"], 20))
        r["soil_moisture_pct"] = max(0, min(r["soil_moisture_pct"], 100))
        r["temperature_c"]     = max(-10, min(r["temperature_c"], 55))

        # Score each district for risk
        risk_score = 0.0
        alert_type = "FLOOD"

        if r["rainfall_mm"] > 150:
            risk_score += 0.45
        elif r["rainfall_mm"] > 80:
            risk_score += 0.25

        if r["river_level_m"] > 8:
            risk_score += 0.30
        elif r["river_level_m"] > 6:
            risk_score += 0.15

        if r["soil_moisture_pct"] > 85:
            risk_score += 0.15

        # Drought / groundwater scoring
        if r["rainfall_mm"] < 5 and r["temperature_c"] > 38:
            risk_score = max(risk_score, 0.55)
            alert_type = "DROUGHT"

        if r["soil_moisture_pct"] < 10:
            risk_score = max(risk_score, 0.50)
            alert_type = "GROUNDWATER" if alert_type != "DROUGHT" else "DROUGHT"

        r["risk_score"] = round(min(risk_score, 1.0), 3)
        r["alert_type"] = alert_type
        clean.append(r)

    # Only process records that meet minimum risk threshold
    flagged = [r for r in clean if r["risk_score"] >= 0.40]
    print(f"[VALIDATE] {len(clean)} records → {len(flagged)} flagged for alerting")

    return {**state, "validated_data": clean, "flagged_data": flagged}