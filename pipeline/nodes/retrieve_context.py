"""
Node 3: Retrieve historical context for each flagged district.
Compares current readings against historical averages to produce
anomaly scores — this is what makes AquaAlert smarter than a
threshold alarm.

Uses in-memory historical baselines (no pgvector needed for demo).
Extend with Supabase pgvector for production.
"""

# Historical monthly rainfall baselines (mm) — sourced from IMD normals
# Format: district → [Jan, Feb, Mar, Apr, May, Jun, Jul, Aug, Sep, Oct, Nov, Dec]
RAINFALL_NORMALS = {
    "Ludhiana":  [14, 21, 29, 18, 23, 66, 213, 182, 93, 20, 6, 12],
    "Patiala":   [16, 23, 27, 16, 24, 72, 224, 196, 98, 19, 5, 11],
    "Barmer":    [4,  3,  2,  2,  7,  18, 72,  68,  22, 5,  2, 2],
    "Jaisalmer": [3,  3,  2,  1,  5,  14, 58,  53,  18, 4,  2, 2],
    "Patna":     [14, 18, 11, 10, 43, 148, 311, 289, 215, 71, 10, 8],
    "Varanasi":  [16, 16, 10, 5,  20, 105, 284, 268, 196, 52, 9,  7],
}

# River danger levels (m) by district
RIVER_DANGER_LEVELS = {
    "Ludhiana":  9.0,
    "Patiala":   8.0,
    "Patna":     14.5,
    "Varanasi":  13.0,
    "Barmer":    1.5,
    "Jaisalmer": 0.8,
}

import datetime

def retrieve_context_node(state: dict) -> dict:
    """
    Enriches flagged data with historical context:
    - anomaly_score: how much current rainfall deviates from historical normal
    - river_danger_pct: river level as % of danger threshold
    - historical_note: human-readable context string for Gemini prompt
    """
    flagged = state.get("flagged_data", [])
    current_month = datetime.datetime.now().month - 1  # 0-indexed

    enriched_flagged = []
    for record in flagged:
        district = record["district"]
        rainfall = record["rainfall_mm"]

        # Historical normal for this month
        normals = RAINFALL_NORMALS.get(district)
        historical_normal = normals[current_month] if normals else 50.0

        # Anomaly: how many times above/below the monthly normal
        if historical_normal > 0:
            anomaly_ratio = rainfall / historical_normal
        else:
            anomaly_ratio = 1.0

        anomaly_pct = round((anomaly_ratio - 1.0) * 100, 1)  # e.g. +340% above normal

        # River danger percentage
        danger_level = RIVER_DANGER_LEVELS.get(district, 10.0)
        river_pct = round((record["river_level_m"] / danger_level) * 100, 1)

        # Build context note for Gemini
        if anomaly_pct > 100:
            context_note = (
                f"Current rainfall is {anomaly_pct:.0f}% above the historical normal of "
                f"{historical_normal}mm for this month. River at {river_pct}% of danger level."
            )
        elif anomaly_pct < -60:
            context_note = (
                f"Rainfall is {abs(anomaly_pct):.0f}% below the historical normal of "
                f"{historical_normal}mm — severe drought signal. "
                f"River at only {river_pct}% of expected level."
            )
        else:
            context_note = (
                f"Rainfall near historical normal of {historical_normal}mm for this month. "
                f"River at {river_pct}% of danger threshold."
            )

        enriched_flagged.append({
            **record,
            "historical_normal_mm": historical_normal,
            "anomaly_pct":          anomaly_pct,
            "river_danger_pct":     river_pct,
            "historical_context":   context_note,
        })

    print(f"[RETRIEVE_CONTEXT] Enriched {len(enriched_flagged)} records with historical context")
    return {**state, "flagged_data": enriched_flagged}