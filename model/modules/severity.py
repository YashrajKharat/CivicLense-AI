"""
Severity & SLA Engine for CivicPulse AI.

Computes a multi-factor severity score (0-100) and deterministic municipal SLA:
- Base category severity (from taxonomy configuration)
- Spatial impact (object area ratio from object detector)
- Environmental / hazard multipliers (electrocution risk, deep water, traffic obstruction)
- Citizen questionnaire impact modifiers
- Deterministic SLA target hours and escalation priorities

CRITICAL SAFETY RULE:
AI models NEVER invent SLA deadlines. Deadlines are derived strictly from policy tables.
"""

from __future__ import annotations
from datetime import datetime, timedelta, timezone
try:
    from .taxonomy import TAXONOMY, get_category
except (ImportError, ValueError):
    from modules.taxonomy import TAXONOMY, get_category


class SeverityAndSLAEngine:
    """Computes calibrated severity and SLA turnaround targets."""

    def __init__(self, policy_overrides: Optional[Dict[str, Any]] = None):
        self.policy_overrides = policy_overrides or {}

    def compute_severity(
        self,
        category_code: str,
        category_confidence: float,
        object_area_ratio: float = 0.20,
        user_answers: Optional[Dict[str, Any]] = None,
        location_context: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Compute multi-factor severity score (0-100) and categorical level.
        """
        cat_info = get_category(category_code) or TAXONOMY["other"]
        base_severity = cat_info.get("base_severity", 40)

        # 1. Visual Spatial Area Adjustment (-10 to +15)
        area_adjustment = 0
        if object_area_ratio >= 0.40:
            area_adjustment = 15
        elif object_area_ratio >= 0.25:
            area_adjustment = 8
        elif object_area_ratio <= 0.08:
            area_adjustment = -8

        # 2. Questionnaire Impact Modifiers
        q_adjustment = 0
        evidence_notes = []
        answers = user_answers or {}

        # Hazardous conditions
        if answers.get("accident_occurred") is True:
            q_adjustment += 25
            evidence_notes.append("Accident reported at location.")
        if answers.get("sparking") is True or answers.get("live_sparking") is True:
            q_adjustment += 30
            evidence_notes.append("Active electrical sparking reported.")
        if answers.get("blocking_traffic") is True or answers.get("obstructing_traffic") is True:
            q_adjustment += 15
            evidence_notes.append("Severe vehicular traffic obstruction reported.")
        if answers.get("water_entering_buildings") is True:
            q_adjustment += 25
            evidence_notes.append("Floodwater inundating residential or commercial premises.")
        if answers.get("near_school_or_hospital") is True:
            q_adjustment += 15
            evidence_notes.append("High-vulnerability zone (school / hospital vicinity).")

        # 3. Location Context (Arterial vs Local road)
        loc_adj = 0
        if location_context and location_context.get("is_major_road"):
            loc_adj += 10
            evidence_notes.append("Location is an arterial roadway.")

        raw_score = base_severity + area_adjustment + q_adjustment + loc_adj
        final_score = int(max(10, min(99, raw_score)))

        # Categorical Severity Level
        if final_score >= 85:
            level = "CRITICAL"
        elif final_score >= 70:
            level = "HIGH"
        elif final_score >= 40:
            level = "MEDIUM"
        else:
            level = "LOW"

        # Confidence is calibrated from category confidence and visual area
        severity_conf = round(min(0.95, max(0.60, category_confidence * 0.90)), 2)

        return {
            "score": final_score,
            "level": level,
            "confidence": severity_conf,
            "base_severity": base_severity,
            "factors": {
                "area_adjustment": area_adjustment,
                "questionnaire_adjustment": q_adjustment,
                "location_adjustment": loc_adj,
            },
            "evidence_notes": evidence_notes,
        }

    def compute_sla(
        self,
        category_code: str,
        severity_level: str,
        created_at: Optional[datetime] = None,
    ) -> Dict[str, Any]:
        """
        Determine legally answerable SLA turnaround hours and priority.
        """
        cat_info = get_category(category_code) or TAXONOMY["other"]
        base_hours = cat_info.get("base_sla_hours", 24)

        # Scale SLA hours based on severity level
        if severity_level == "CRITICAL":
            target_hours = max(4, int(base_hours * 0.35))
            priority = "CRITICAL"
        elif severity_level == "HIGH":
            target_hours = max(8, int(base_hours * 0.65))
            priority = "HIGH"
        elif severity_level == "MEDIUM":
            target_hours = base_hours
            priority = "MEDIUM"
        else:
            target_hours = int(base_hours * 1.5)
            priority = "LOW"

        # Apply specific safety mandates
        if category_code in ("open_manhole", "exposed_wire", "damaged_pole"):
            target_hours = min(target_hours, 4)
            priority = "CRITICAL"
        elif category_code in ("dead_animal", "flooding", "fallen_tree"):
            target_hours = min(target_hours, 6)

        base_time = created_at or datetime.now(timezone.utc)
        deadline = base_time + timedelta(hours=target_hours)

        return {
            "priority": priority,
            "target_hours": target_hours,
            "sla_deadline": deadline.isoformat(),
        }
