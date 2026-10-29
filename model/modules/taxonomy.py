"""
CivicPulse Category Taxonomy and Domain Hierarchy.

Maintains the 3-level hierarchical taxonomy:
Level 1: CIVIC / NON_CIVIC
Level 2: 10 Civic Domains (Roads & Infrastructure, Solid Waste, Lighting, etc.)
Level 3: 39 Distinct Civic Categories

Provides:
- Base severity and SLA mappings
- Department assignment rules
- Flags for whether an issue is visually determinable vs requires field inquiry
"""

from __future__ import annotations
from typing import Dict, List, Optional, Any

DOMAINS = [
    "Roads & Infrastructure",
    "Solid Waste Management",
    "Street Lighting",
    "Traffic",
    "Water Supply",
    "Gardens & Open Spaces",
    "Public Health",
    "Encroachment",
    "Food Safety",
    "Other",
]

TAXONOMY: Dict[str, Dict[str, Any]] = {
    # ---------------- Roads & Infrastructure ----------------
    "pothole": {
        "code": "pothole",
        "name": "Pothole",
        "domain": "Roads & Infrastructure",
        "department": "Roads & Traffic Infrastructure",
        "base_severity": 65,
        "base_sla_hours": 24,
        "visually_determinable": True,
        "answerable_type": "Contractor",
        "subcategories": ["Large pothole", "Pothole cluster", "Road crater"],
    },
    "road_crack": {
        "code": "road_crack",
        "name": "Road crack",
        "domain": "Roads & Infrastructure",
        "department": "Roads & Traffic Infrastructure",
        "base_severity": 45,
        "base_sla_hours": 48,
        "visually_determinable": True,
        "answerable_type": "Department",
        "subcategories": ["Alligator cracking", "Longitudinal fissure"],
    },
    "broken_footpath": {
        "code": "broken_footpath",
        "name": "Broken footpath",
        "domain": "Roads & Infrastructure",
        "department": "Civil Works (Footpaths)",
        "base_severity": 50,
        "base_sla_hours": 48,
        "visually_determinable": True,
        "answerable_type": "Contractor",
        "subcategories": ["Missing paver blocks", "Broken curb stone", "Uneven sidewalk"],
    },
    "open_manhole": {
        "code": "open_manhole",
        "name": "Open manhole",
        "domain": "Roads & Infrastructure",
        "department": "Storm Water Drainage & Sewerage",
        "base_severity": 95,
        "base_sla_hours": 4,
        "visually_determinable": True,
        "answerable_type": "Department",
        "subcategories": ["Missing cover", "Displaced chamber lid", "Damaged grating"],
    },
    "road_obstruction": {
        "code": "road_obstruction",
        "name": "Road obstruction",
        "domain": "Roads & Infrastructure",
        "department": "Roads & Traffic Infrastructure",
        "base_severity": 70,
        "base_sla_hours": 12,
        "visually_determinable": True,
        "answerable_type": "Department",
        "subcategories": ["Fallen boulder", "Abandoned barricade", "Spilled cargo"],
    },

    # ---------------- Solid Waste Management ----------------
    "garbage_overflow": {
        "code": "garbage_overflow",
        "name": "Garbage overflow",
        "domain": "Solid Waste Management",
        "department": "Solid Waste Management",
        "base_severity": 60,
        "base_sla_hours": 12,
        "visually_determinable": True,
        "answerable_type": "Department",
        "subcategories": ["Overflowing communal bin", "Sidewalk litter pile"],
    },
    "illegal_dumping": {
        "code": "illegal_dumping",
        "name": "Illegal dumping",
        "domain": "Solid Waste Management",
        "department": "Solid Waste Management",
        "base_severity": 70,
        "base_sla_hours": 24,
        "visually_determinable": True,
        "answerable_type": "Department",
        "subcategories": ["Roadside bulk dumping", "Waste burning", "Waterbody dumping"],
    },
    "construction_debris": {
        "code": "construction_debris",
        "name": "Construction debris",
        "domain": "Solid Waste Management",
        "department": "C&D Waste Management Cell",
        "base_severity": 55,
        "base_sla_hours": 48,
        "visually_determinable": True,
        "answerable_type": "Contractor",
        "subcategories": ["Rubble on carriage way", "Excavated silt dumped on road"],
    },
    "dead_animal": {
        "code": "dead_animal",
        "name": "Dead animal",
        "domain": "Solid Waste Management",
        "department": "Veterinary Health & Sanitation",
        "base_severity": 85,
        "base_sla_hours": 6,
        "visually_determinable": True,
        "answerable_type": "Department",
        "subcategories": ["Carcass on thoroughfare", "Biological hazard"],
    },
    "defaced_wall": {
        "code": "defaced_wall",
        "name": "Defaced wall or property",
        "domain": "Solid Waste Management",
        "department": "Public Property Maintenance",
        "base_severity": 30,
        "base_sla_hours": 72,
        "visually_determinable": True,
        "answerable_type": "Department",
        "subcategories": ["Illegal poster", "Graffiti", "Property defacement"],
    },
    "pan_stains": {
        "code": "pan_stains",
        "name": "Spitting / paan stains",
        "domain": "Solid Waste Management",
        "department": "Solid Waste Management",
        "base_severity": 35,
        "base_sla_hours": 48,
        "visually_determinable": True,
        "answerable_type": "Department",
        "subcategories": ["Staircase spitting", "Pavement stains", "Wall spitting"],
    },

    # ---------------- Street Lighting ----------------
    "broken_streetlight": {
        "code": "broken_streetlight",
        "name": "Broken streetlight",
        "domain": "Street Lighting",
        "department": "Street Lighting & Electrical",
        "base_severity": 55,
        "base_sla_hours": 24,
        "visually_determinable": True,
        "answerable_type": "Contractor",
        "subcategories": ["Non-functional luminaire", "Broken fixture casing"],
    },
    "damaged_pole": {
        "code": "damaged_pole",
        "name": "Damaged electrical pole",
        "domain": "Street Lighting",
        "department": "Electricity Distribution (DISCOM)",
        "base_severity": 90,
        "base_sla_hours": 4,
        "visually_determinable": True,
        "answerable_type": "Department",
        "subcategories": ["Tilted utility pole", "Rusted base fracture"],
    },
    "exposed_wire": {
        "code": "exposed_wire",
        "name": "Exposed wire",
        "domain": "Street Lighting",
        "department": "Electricity Distribution (DISCOM)",
        "base_severity": 95,
        "base_sla_hours": 4,
        "visually_determinable": True,
        "answerable_type": "Department",
        "subcategories": ["Hanging high-voltage wire", "Open junction box"],
    },

    # ---------------- Traffic ----------------
    "damaged_traffic_signal": {
        "code": "damaged_traffic_signal",
        "name": "Damaged traffic signal",
        "domain": "Traffic",
        "department": "Traffic Police / Traffic Engineering",
        "base_severity": 85,
        "base_sla_hours": 8,
        "visually_determinable": True,
        "answerable_type": "Department",
        "subcategories": ["Inoperative signal head", "Broken signal post"],
    },
    "illegal_parking": {
        "code": "illegal_parking",
        "name": "Illegal parking",
        "domain": "Traffic",
        "department": "Traffic Police Department",
        "base_severity": 50,
        "base_sla_hours": 12,
        "visually_determinable": True,
        "answerable_type": "Department",
        "subcategories": ["Blocking driveway", "No-parking zone encroachment"],
    },
    "missing_road_sign": {
        "code": "missing_road_sign",
        "name": "Missing road sign",
        "domain": "Traffic",
        "department": "Traffic Police / Signage Cell",
        "base_severity": 40,
        "base_sla_hours": 72,
        "visually_determinable": True,
        "answerable_type": "Department",
        "subcategories": ["Damaged directional board", "Missing stop sign"],
    },

    # ---------------- Water Supply ----------------
    "broken_pipeline": {
        "code": "broken_pipeline",
        "name": "Broken pipeline",
        "domain": "Water Supply",
        "department": "Hydraulic Engineer / Water Works",
        "base_severity": 80,
        "base_sla_hours": 8,
        "visually_determinable": True,
        "answerable_type": "Department",
        "subcategories": ["Main pipeline burst", "Gushing water distribution line"],
    },
    "water_leakage": {
        "code": "water_leakage",
        "name": "Water leakage",
        "domain": "Water Supply",
        "department": "Hydraulic Engineer / Water Works",
        "base_severity": 60,
        "base_sla_hours": 24,
        "visually_determinable": True,
        "answerable_type": "Department",
        "subcategories": ["Meter valve leak", "Sub-surface pipeline seepage"],
    },
    "flooding": {
        "code": "flooding",
        "name": "Flooding",
        "domain": "Water Supply",
        "department": "Storm Water Drainage / Disaster Cell",
        "base_severity": 85,
        "base_sla_hours": 6,
        "visually_determinable": True,
        "answerable_type": "Department",
        "subcategories": ["Road waterlogging", "Subway inundation"],
    },
    "seepage_on_structure": {
        "code": "seepage_on_structure",
        "name": "Dam or seepage on structure",
        "domain": "Water Supply",
        "department": "Civil Infrastructure Maintenance",
        "base_severity": 65,
        "base_sla_hours": 48,
        "visually_determinable": True,
        "answerable_type": "Department",
        "subcategories": ["Bridge pillar seepage", "Flyover wall leakage"],
    },
    "contaminated_water": {
        "code": "contaminated_water",
        "name": "Contaminated water",
        "domain": "Water Supply",
        "department": "Hydraulic Engineer (Quality Control)",
        "base_severity": 90,
        "base_sla_hours": 8,
        "visually_determinable": False,  # Safety Rule: Cannot be certified purely by image
        "answerable_type": "Department",
        "subcategories": ["Turbid tap water", "Foul odor supply"],
    },
    "no_water_supply": {
        "code": "no_water_supply",
        "name": "No water supply",
        "domain": "Water Supply",
        "department": "Hydraulic Engineer / Water Works",
        "base_severity": 75,
        "base_sla_hours": 12,
        "visually_determinable": False,  # Safety Rule: Dry tap cannot prove line status
        "answerable_type": "Department",
        "subcategories": ["Zero supply pressure", "Unscheduled water cut"],
    },

    # ---------------- Gardens & Open Spaces ----------------
    "fallen_tree": {
        "code": "fallen_tree",
        "name": "Fallen tree",
        "domain": "Gardens & Open Spaces",
        "department": "Garden & Tree Authority",
        "base_severity": 85,
        "base_sla_hours": 4,
        "visually_determinable": True,
        "answerable_type": "Department",
        "subcategories": ["Trunk blocking roadway", "Snapped heavy branch"],
    },
    "dangerous_tree": {
        "code": "dangerous_tree",
        "name": "Dangerous or dead tree",
        "domain": "Gardens & Open Spaces",
        "department": "Garden & Tree Authority",
        "base_severity": 70,
        "base_sla_hours": 24,
        "visually_determinable": True,
        "answerable_type": "Department",
        "subcategories": ["Overhanging precarious branch", "Rotting root structure"],
    },
    "damaged_park_equipment": {
        "code": "damaged_park_equipment",
        "name": "Damaged park equipment",
        "domain": "Gardens & Open Spaces",
        "department": "Garden & Tree Authority",
        "base_severity": 45,
        "base_sla_hours": 72,
        "visually_determinable": True,
        "answerable_type": "Contractor",
        "subcategories": ["Broken children swing", "Damaged park bench"],
    },

    # ---------------- Public Health ----------------
    "stagnant_water": {
        "code": "stagnant_water",
        "name": "Stagnant water",
        "domain": "Public Health",
        "department": "Public Health & Pest Control",
        "base_severity": 65,
        "base_sla_hours": 24,
        "visually_determinable": True,
        "answerable_type": "Department",
        "subcategories": ["Roadside cesspool", "Construction site water pool"],
    },
    "mosquito_breeding": {
        "code": "mosquito_breeding",
        "name": "Mosquito breeding",
        "domain": "Public Health",
        "department": "Pest Control & Vector Borne Diseases",
        "base_severity": 70,
        "base_sla_hours": 24,
        "visually_determinable": True,
        "answerable_type": "Department",
        "subcategories": ["Larvae in outdoor container", "Overhead tank breeding"],
    },
    "public_toilet_unusable": {
        "code": "public_toilet_unusable",
        "name": "Public toilet unusable",
        "domain": "Public Health",
        "department": "Solid Waste Management (Sanitation)",
        "base_severity": 65,
        "base_sla_hours": 12,
        "visually_determinable": True,
        "answerable_type": "Contractor",
        "subcategories": ["Choked urinal", "No cleaning water", "Damaged door"],
    },
    "urination_spot": {
        "code": "urination_spot",
        "name": "Public urination spot",
        "domain": "Public Health",
        "department": "Solid Waste Management",
        "base_severity": 45,
        "base_sla_hours": 48,
        "visually_determinable": True,
        "answerable_type": "Department",
        "subcategories": ["Wall side nuisance", "Unsanitary public nook"],
    },
    "stray_animal_concern": {
        "code": "stray_animal_concern",
        "name": "Stray animal concern",
        "domain": "Public Health",
        "department": "Veterinary Health & Animal Control",
        "base_severity": 55,
        "base_sla_hours": 24,
        "visually_determinable": True,
        "answerable_type": "Department",
        "subcategories": ["Aggressive stray pack", "Injured street animal"],
    },
    "persistent_noise": {
        "code": "persistent_noise",
        "name": "Persistent noise nuisance",
        "domain": "Public Health",
        "department": "Police & Environmental Protection",
        "base_severity": 50,
        "base_sla_hours": 12,
        "visually_determinable": False,  # Safety Rule: Cannot prove audio noise from photo
        "answerable_type": "Department",
        "subcategories": ["Loudspeaker after hours", "Industrial generator hum"],
    },

    # ---------------- Encroachment ----------------
    "footpath_encroachment": {
        "code": "footpath_encroachment",
        "name": "Footpath encroachment",
        "domain": "Encroachment",
        "department": "Encroachment Removal Cell",
        "base_severity": 60,
        "base_sla_hours": 48,
        "visually_determinable": True,
        "answerable_type": "Premises",
        "subcategories": ["Commercial board on walkway", "Ramp obstructing footpath"],
    },
    "illegal_hawking": {
        "code": "illegal_hawking",
        "name": "Illegal hawking",
        "domain": "Encroachment",
        "department": "Encroachment Removal Cell",
        "base_severity": 55,
        "base_sla_hours": 24,
        "visually_determinable": True,  # Visible stall, but legality requires verification
        "answerable_type": "Premises",
        "subcategories": ["Unlicensed roadside stall", "Pedestrian walkway vendor"],
    },

    # ---------------- Food Safety ----------------
    "unhygienic_food_stall": {
        "code": "unhygienic_food_stall",
        "name": "Unhygienic food stall",
        "domain": "Food Safety",
        "department": "Food Safety & Public Health",
        "base_severity": 70,
        "base_sla_hours": 24,
        "visually_determinable": True,
        "answerable_type": "Premises",
        "subcategories": ["Uncovered food roadside", "Stagnant wash water basin"],
    },
    "improper_food_storage": {
        "code": "improper_food_storage",
        "name": "Improper food storage",
        "domain": "Food Safety",
        "department": "Food Safety & Public Health",
        "base_severity": 65,
        "base_sla_hours": 48,
        "visually_determinable": True,
        "answerable_type": "Premises",
        "subcategories": ["Open raw food display", "Pest exposure"],
    },

    # ---------------- Other ----------------
    "other": {
        "code": "other",
        "name": "Other",
        "domain": "Other",
        "department": "General Grievance Triage",
        "base_severity": 30,
        "base_sla_hours": 72,
        "visually_determinable": False,
        "answerable_type": "Department",
        "subcategories": ["Uncategorized civic complaint"],
    }
}

TAXONOMY_ALIASES = {
    "spitting": "pan_stains",
    "paan_stains": "pan_stains",
    "spitting_/_pan_stains": "pan_stains",
    "spitting_/_paan_stains": "pan_stains",
    "spitting_paan_stains": "pan_stains",
    "spitting___paan_stains": "pan_stains",
    "spitting___pan_stains": "pan_stains",
    "spitting_stains": "pan_stains",
    "paan_spitting": "pan_stains",
    "defaced": "defaced_wall",
    "defaced_wall_or_property": "defaced_wall",
    "defaced_property": "defaced_wall",
    "graffiti": "defaced_wall",
    "seepage_on_structure": "damp_or_seepage",
    "potholes": "pothole",
}

def get_all_categories() -> List[Dict[str, Any]]:
    return list(TAXONOMY.values())

def get_category(code: str) -> Optional[Dict[str, Any]]:
    if not code:
        return TAXONOMY.get("other")
    normalized = str(code).lower().strip().replace(" ", "_").replace("/", "_").replace("-", "_")
    canonical = TAXONOMY_ALIASES.get(normalized, normalized)
    return TAXONOMY.get(canonical) or TAXONOMY.get(normalized) or TAXONOMY.get("other")

def get_categories_by_domain(domain: str) -> List[Dict[str, Any]]:
    return [c for c in TAXONOMY.values() if c["domain"].lower() == domain.lower()]
