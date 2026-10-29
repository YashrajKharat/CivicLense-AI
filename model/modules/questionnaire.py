"""
Dynamic Category Questionnaire Module for CivicPulse AI.

Generates category-tailored follow-up questions for the reporting citizen.
Disambiguates invisible, qualitative, and legal conditions:
- Traffic obstruction & accident history
- Water depth and building inundation
- Structural permanence & permission for street vending
- Utility outage duration for non-visual issues

CRITICAL SAFETY RULE:
The system never presumes facts that cannot be verified by vision.
For example, vendor legality, water chemical contamination, and dry pipe pressure
are explicitly marked as requiring field inquiry and questionnaire answers.
"""

from __future__ import annotations
from typing import Dict, Any, List


QUESTION_REGISTRY: Dict[str, List[Dict[str, Any]]] = {
    "pothole": [
        {
            "id": "obstructing_traffic",
            "question": "Is the pothole obstructing traffic or forcing vehicles to swerve?",
            "type": "boolean",
            "required": True,
        },
        {
            "id": "approx_size",
            "question": "Approximately how large is the damaged area?",
            "type": "choice",
            "options": ["Small (< 1 foot wide)", "Medium (1 to 3 feet wide)", "Large crater (> 3 feet wide)"],
            "required": False,
        },
        {
            "id": "water_accumulating",
            "question": "Is water accumulating or concealing the pothole crater?",
            "type": "boolean",
            "required": False,
        },
        {
            "id": "accident_occurred",
            "question": "Has a vehicle accident, fall, or injury occurred here?",
            "type": "boolean",
            "required": False,
        },
        {
            "id": "is_major_road",
            "question": "Is this located on a main arterial road or highway?",
            "type": "boolean",
            "required": False,
        },
    ],
    "exposed_wire": [
        {
            "id": "pedestrian_level",
            "question": "Is the exposed wire hanging within reach of pedestrians?",
            "type": "boolean",
            "required": True,
        },
        {
            "id": "sparking",
            "question": "Is there active electrical sparking, smoking, or buzzing?",
            "type": "boolean",
            "required": True,
        },
        {
            "id": "near_school_or_hospital",
            "question": "Is this in the immediate vicinity of a school, hospital, or playground?",
            "type": "boolean",
            "required": False,
        },
        {
            "id": "damaged_insulation",
            "question": "Is the external cable insulation visibly torn or stripped?",
            "type": "boolean",
            "required": False,
        },
    ],
    "open_manhole": [
        {
            "id": "barricaded",
            "question": "Are there any warning barricades or signs placed around the open manhole?",
            "type": "boolean",
            "required": True,
        },
        {
            "id": "on_carriageway",
            "question": "Is the opening located directly on a traffic lane or on the footpath?",
            "type": "choice",
            "options": ["Main vehicular lane", "Pedestrian sidewalk", "Road shoulder / divider"],
            "required": True,
        },
        {
            "id": "water_overflowing",
            "question": "Is sewage or drain water overflowing from the chamber?",
            "type": "boolean",
            "required": False,
        },
    ],
    "garbage_overflow": [
        {
            "id": "spilling_on_road",
            "question": "Is the uncollected garbage spilling onto the roadway or sidewalk?",
            "type": "boolean",
            "required": True,
        },
        {
            "id": "blocking_traffic",
            "question": "Is the waste pile blocking pedestrian passage or vehicular movement?",
            "type": "boolean",
            "required": False,
        },
        {
            "id": "foul_odor",
            "question": "Is there a strong foul odor or waste burning smoke?",
            "type": "boolean",
            "required": False,
        },
        {
            "id": "near_drain",
            "question": "Is the waste threatening to clog an adjacent stormwater drain?",
            "type": "boolean",
            "required": False,
        },
    ],
    "flooding": [
        {
            "id": "blocking_traffic",
            "question": "Is vehicular traffic stopped or severely restricted by the water?",
            "type": "boolean",
            "required": True,
        },
        {
            "id": "water_depth",
            "question": "Approximately how deep is the stagnant water?",
            "type": "choice",
            "options": ["Ankle depth (< 6 inches)", "Knee depth (6 to 18 inches)", "Waist depth (> 18 inches)"],
            "required": True,
        },
        {
            "id": "water_entering_buildings",
            "question": "Is flood water entering ground-floor residential homes or commercial shops?",
            "type": "boolean",
            "required": True,
        },
        {
            "id": "submerged_utilities",
            "question": "Are electrical feeder boxes or transformer posts partially submerged?",
            "type": "boolean",
            "required": False,
        },
    ],
    "broken_streetlight": [
        {
            "id": "entire_stretch_dark",
            "question": "Is only this single fixture broken, or is the entire road stretch unlit?",
            "type": "choice",
            "options": ["Single streetlight fixture", "Multiple consecutive lights", "Entire street unlit"],
            "required": True,
        },
        {
            "id": "exposed_pole_wires",
            "question": "Are wires hanging out of the pole inspection door at the base?",
            "type": "boolean",
            "required": False,
        },
    ],
    "illegal_hawking": [
        {
            "id": "stall_type",
            "question": "What type of stall or vending setup is present?",
            "type": "choice",
            "options": ["Mobile handcart", "Permanent wooden/tarpaulin shed", "Ground mat / blanket"],
            "required": True,
        },
        {
            "id": "footpath_blocked",
            "question": "Is the pedestrian sidewalk completely blocked, forcing people onto the roadway?",
            "type": "boolean",
            "required": True,
        },
        {
            "id": "license_status",
            "question": "Does the vendor have a displayed municipal hawking pitch authorization?",
            "type": "choice",
            "options": ["Valid certificate displayed", "No certificate displayed", "Uncertain"],
            "required": False,
        },
    ],
    "no_water_supply": [
        {
            "id": "disruption_duration",
            "question": "How long has municipal water supply been completely interrupted?",
            "type": "choice",
            "options": ["Under 12 hours", "12 to 24 hours", "2 to 3 days", "Over 3 days"],
            "required": True,
        },
        {
            "id": "neighborhood_affected",
            "question": "Are neighboring buildings and society compounds also facing zero supply?",
            "type": "boolean",
            "required": True,
        },
    ],
    "contaminated_water": [
        {
            "id": "visual_turbidity",
            "question": "Is the supplied tap water visibly discolored, turbid, or containing sediment?",
            "type": "boolean",
            "required": True,
        },
        {
            "id": "foul_odor",
            "question": "Does the water carry a sewage or chemical odor?",
            "type": "boolean",
            "required": True,
        },
        {
            "id": "health_impact",
            "question": "Has any resident experienced gastrointestinal illness or waterborne symptoms?",
            "type": "boolean",
            "required": False,
        },
    ],
    "pan_stains": [
        {
            "id": "public_property",
            "question": "Is the spitting/staining located on public property, a municipal staircase, or bridge pillar?",
            "type": "boolean",
            "required": True,
        },
        {
            "id": "recurring_spot",
            "question": "Is this a chronic, recurring spitting or nuisance location?",
            "type": "boolean",
            "required": False,
        },
    ],
    "defaced_wall": [
        {
            "id": "unauthorized_posters",
            "question": "Does the defacement include illegal commercial posters or spray-painted graffiti?",
            "type": "choice",
            "options": ["Illegal posters / banners", "Graffiti / spray paint", "Wall stains"],
            "required": True,
        },
    ],
}

DEFAULT_QUESTIONS: List[Dict[str, Any]] = [
    {
        "id": "obstructing_public",
        "question": "Is this problem causing an immediate safety hazard or obstructing pedestrian passage?",
        "type": "boolean",
        "required": True,
    },
    {
        "id": "duration_observed",
        "question": "How long has this condition been persisting?",
        "type": "choice",
        "options": ["First noticed today", "2 to 3 days", "Over a week", "Long-standing recurring issue"],
        "required": False,
    },
]

class QuestionnaireEngine:
    """Provides dynamic, category-specific questionnaires."""

    def get_questions_for_category(self, category_code: str) -> List[Dict[str, Any]]:
        """Retrieve tailored questions for the classified civic category."""
        clean_code = category_code.lower().strip()
        return QUESTION_REGISTRY.get(clean_code, DEFAULT_QUESTIONS)
