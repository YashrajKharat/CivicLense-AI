"""
Department Routing & Jurisdictional Assignment Module for CivicPulse AI.

Maps civic issue categories to responsible municipal departments and answerable entities.
Admins can dynamically alter department routing without retraining ML vision models.
"""

from __future__ import annotations
try:
    from .taxonomy import TAXONOMY, get_category
except (ImportError, ValueError):
    from modules.taxonomy import TAXONOMY, get_category


class DepartmentRouter:
    """Deterministic routing from verified category to municipal authority."""

    def __init__(self, override_map: Optional[Dict[str, str]] = None):
        self.override_map = override_map or {}

    def get_department(self, category_code: str) -> Dict[str, str]:
        """
        Resolve department and answerable stakeholder type.
        """
        clean_code = category_code.lower().strip()
        cat_info = get_category(clean_code)

        if not cat_info:
            return {
                "department": "General Grievance Triage Desk",
                "answerable_type": "Department",
                "domain": "Other",
            }

        # Check for administrative runtime overrides
        dept = self.override_map.get(clean_code, cat_info["department"])

        return {
            "department": dept,
            "answerable_type": cat_info.get("answerable_type", "Department"),
            "domain": cat_info.get("domain", "Other"),
        }
