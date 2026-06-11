def impact_node(state: dict) -> dict:
    """
    Node 4: Enrich flagged records with risk level, population impact, and cascade score.
    """
    flagged = state.get("flagged_data", [])

    POPULATION = {
        "Ludhiana": 3_500_000, "Patiala": 1_900_000, "Barmer": 1_200_000,
        "Jaisalmer": 670_000,  "Patna": 2_200_000,   "Varanasi": 1_600_000,
    }

    enriched = []
    for r in flagged:
        score = r["risk_score"]

        if score >= 0.85:
            risk_level = "CRITICAL"
        elif score >= 0.65:
            risk_level = "HIGH"
        elif score >= 0.50:
            risk_level = "MODERATE"
        else:
            risk_level = "LOW"

        pop = POPULATION.get(r["district"], 500_000)

        # Cascade: if FLOOD + soil > 80 → infrastructure at risk
        cascade_risk = score + 0.05 if (r["alert_type"] == "FLOOD" and r["soil_moisture_pct"] > 80) else score
        cascade_risk = round(min(cascade_risk, 1.0), 3)

        enriched.append({
            **r,
            "risk_level":     risk_level,
            "cascade_score":  cascade_risk,
            "population":     pop,
            "impact_estimate": int(pop * score * 0.12),  # rough 12% affected at full risk
        })

    return {**state, "enriched_data": enriched}