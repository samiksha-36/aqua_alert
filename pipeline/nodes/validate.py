"""
Node 2: Clean data, flag anomalies, compute risk scores.

Risk score weights follow IMD/NDMA published classifications:
  - Rainfall >150mm/day = IMD "Extremely Heavy" (IMD Technical Note No. 1, 2021) → 0.45
  - Rainfall >80mm/day  = IMD "Very Heavy"                                        → 0.25
  - River danger level  = district-specific from CWC/WRIS (via retrieve_context)
  - Soil moisture >85%  = saturation threshold (FAO Irrigation Manual, 2012)      → 0.15

IMD warning codes (from ingest node) also directly boost risk score:
  - Official IMD Red/Orange warning → overrides calculated score to minimum 0.75/0.55
  - This ensures IMD's own judgment takes precedence over our derived score.

Dispatch threshold: read from PIPELINE_DISPATCH_THRESHOLD env var (default 0.40).
  Set this in pipeline/.env to tune sensitivity without code changes.
"""

import os
from dotenv import load_dotenv
load_dotenv()

# Tunable via env — no hardcoded threshold in logic
DISPATCH_THRESHOLD = float(os.getenv("PIPELINE_DISPATCH_THRESHOLD", "0.40"))

# IMD warning color → minimum risk score override
# Source: IMD Color-Coded Warning System, NDMA 2016
IMD_COLOR_FLOOR = {
    1: 0.85,   # Red    — Take Action (extreme event)
    2: 0.65,   # Orange — Be Prepared (severe event)
    3: 0.45,   # Yellow — Be Updated (moderate event)
    4: 0.0,    # Green  — No warning
}

# IMD rainfall categories → risk contribution
# Source: IMD Technical Note No. 1, 2021
# These are published fixed thresholds — not dynamic
RAINFALL_THRESHOLDS = [
    (204.4, 0.45),   # Extremely Heavy ≥ 204.4mm
    (115.6, 0.40),   # Very Heavy ≥ 115.6mm
    (64.5,  0.30),   # Heavy ≥ 64.5mm
    (35.5,  0.20),   # Moderately Heavy ≥ 35.5mm
    (15.6,  0.10),   # Moderate ≥ 15.6mm
]


def _rainfall_risk(rainfall_mm: float) -> float:
    for threshold, weight in RAINFALL_THRESHOLDS:
        if rainfall_mm >= threshold:
            return weight
    return 0.0


def _river_risk(river_level_m: float, danger_level_m: float | None) -> float:
    """
    Use district-specific danger level from CWC/WRIS (passed via record).
    Falls back to IMD generalised thresholds only if no district data available.
    """
    if danger_level_m and danger_level_m > 0:
        ratio = river_level_m / danger_level_m
        if ratio >= 1.0:    return 0.40   # At or above danger level
        elif ratio >= 0.85: return 0.30   # 85–100% of danger level
        elif ratio >= 0.70: return 0.20   # 70–85% of danger level
        elif ratio >= 0.50: return 0.10   # 50–70% of danger level
        return 0.0
    else:
        # Generalised CWC thresholds (no district-specific data)
        if river_level_m > 8:   return 0.30
        elif river_level_m > 6: return 0.15
        return 0.0


def validate_node(state: dict) -> dict:
    raw   = state.get("raw_data", [])
    clean = []

    for record in raw:
        r = record.copy()

        # ── Clamp to physical limits ─────────────────────────────────────
        r["rainfall_mm"]       = max(0.0, min(float(r.get("rainfall_mm")       or 0), 500.0))
        r["river_level_m"]     = max(0.0, min(float(r.get("river_level_m")     or 0), 30.0))
        r["soil_moisture_pct"] = max(0.0, min(float(r.get("soil_moisture_pct") or 0), 100.0))
        r["temperature_c"]     = max(-10.0, min(float(r.get("temperature_c")   or 30), 55.0))

        risk_score = 0.0
        alert_type = r.get("alert_type", "FLOOD")   # trust ingest node's IMD-based alert_type
        score_components = []

        # ── 1. Rainfall risk (IMD classification) ────────────────────────
        rain_risk = _rainfall_risk(r["rainfall_mm"])
        risk_score += rain_risk
        if rain_risk > 0:
            score_components.append(f"rainfall={r['rainfall_mm']}mm(+{rain_risk})")

        # ── 2. River level risk (district-specific CWC/WRIS threshold) ───
        # danger_level_m comes from retrieve_context if available, else None here
        # validate runs BEFORE retrieve_context, so we use generalised thresholds now
        # retrieve_context will refine this later with district-specific data
        river_risk = _river_risk(r["river_level_m"], danger_level_m=None)
        risk_score += river_risk
        if river_risk > 0:
            score_components.append(f"river={r['river_level_m']}m(+{river_risk})")

        # ── 3. Soil saturation (FAO saturation threshold) ─────────────────
        if r["soil_moisture_pct"] > 85:
            risk_score += 0.15
            score_components.append(f"soil={r['soil_moisture_pct']}%(+0.15)")

        # ── 4. IMD official warning override ─────────────────────────────
        # If IMD's own system issued a warning, respect their judgment
        warning_color = r.get("warning_color", 4)
        color_floor   = IMD_COLOR_FLOOR.get(int(warning_color), 0.0)
        if color_floor > risk_score:
            score_components.append(f"IMD_color={warning_color}→floor={color_floor}")
            risk_score = color_floor

        # Boost if IMD explicitly flagged flood/heat warnings from ingest
        if r.get("has_flood_warning"):
            risk_score = max(risk_score, 0.65)
            score_components.append("IMD_flood_warning(floor=0.65)")
            alert_type = "FLOOD"

        if r.get("has_heat_warning") and alert_type != "FLOOD":
            risk_score = max(risk_score, 0.55)
            score_components.append("IMD_heat_warning(floor=0.55)")
            alert_type = "DROUGHT"

        # Nowcast category boost (IMD real-time storm severity)
        nowcast_cat = int(r.get("nowcast_category") or 1)
        if nowcast_cat >= 15:
            risk_score = max(risk_score, 0.80)
            score_components.append(f"nowcast_cat={nowcast_cat}(floor=0.80)")
        elif nowcast_cat >= 10:
            risk_score = max(risk_score, 0.60)
            score_components.append(f"nowcast_cat={nowcast_cat}(floor=0.60)")

        # ── 5. Drought detection ──────────────────────────────────────────
        # IMD: <5mm + temp >38°C = heat-drought signal
        if r["rainfall_mm"] < 5 and r["temperature_c"] > 38:
            risk_score = max(risk_score, 0.55)
            alert_type = "DROUGHT"
            score_components.append(f"drought(rain={r['rainfall_mm']}mm,temp={r['temperature_c']}°C,floor=0.55)")

        # ── 6. Groundwater stress ─────────────────────────────────────────
        if r["soil_moisture_pct"] < 10:
            risk_score = max(risk_score, 0.50)
            alert_type = "GROUNDWATER" if alert_type != "DROUGHT" else "DROUGHT"
            score_components.append(f"groundwater_stress(soil={r['soil_moisture_pct']}%,floor=0.50)")

        r["risk_score"]        = round(min(risk_score, 1.0), 3)
        r["alert_type"]        = alert_type
        r["score_breakdown"]   = ", ".join(score_components) if score_components else "below_all_thresholds"
        clean.append(r)

    flagged = [r for r in clean if r["risk_score"] >= DISPATCH_THRESHOLD]
    print(f"[VALIDATE] {len(clean)} records → {len(flagged)} flagged (threshold={DISPATCH_THRESHOLD})")
    for r in flagged:
        print(f"  ↳ {r['district']}: score={r['risk_score']} | {r['alert_type']} | {r['score_breakdown']}")

    return {**state, "validated_data": clean, "flagged_data": flagged}