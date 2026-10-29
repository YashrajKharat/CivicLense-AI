"""
Civic complaint knowledge base.

Every category key here is a snake_case slug. The same slugs are used as the
folder names in your training dataset, as the labels the category model
predicts, and as the keys in this dictionary - so a category can never fall
out of sync between training and serving.
"""

CIVIC_KNOWLEDGE_BASE = {
    "illegal_dumping": {
        "label": "Illegal Dumping",
        "explanation": "The image shows waste and debris dumped beside a roadside or open plot. This creates sanitation concerns, attracts disease vectors, and obstructs drainage runoff.",
        "actions": [
            "Inspect the reported location",
            "Remove the accumulated waste",
            "Clean and disinfect the surrounding area",
            "Check whether the adjacent drain is blocked",
        ],
        "department": "Municipal Corporation / Sanitation Dept.",
        "priority": "High",
    },
    "garbage_overflow": {
        "label": "Garbage Overflow",
        "explanation": "The image shows overflowing garbage bins and uncollected solid waste spilling onto the public pathway. This causes severe foul odour and public health hazards.",
        "actions": [
            "Dispatch waste collection compactor vehicle",
            "Clear the overflowing container and sweep the sidewalk",
            "Disinfect the area with lime / bleaching powder",
            "Assess bin capacity and adjust pickup frequency",
        ],
        "department": "Municipal Corporation / Solid Waste Management",
        "priority": "High",
    },
    "pothole": {
        "label": "Pothole",
        "explanation": "The image shows a deep pothole and fractured asphalt on the public roadway. This poses an immediate collision and accident risk for two-wheelers and vehicles.",
        "actions": [
            "Place high-visibility safety cones at the site",
            "Excavate loose asphalt and clear water from the crater",
            "Fill with hot/cold mix asphalt and compact thoroughly",
            "Inspect adjacent pavement for underlying drainage issues",
        ],
        "department": "Public Works Department (PWD) / Road Maintenance",
        "priority": "High",
    },
    "road_crack": {
        "label": "Road Crack",
        "explanation": "The image shows prominent alligator cracks and fissures in the asphalt road. Surface water seepage will rapidly deteriorate this into dangerous potholes.",
        "actions": [
            "Clean crack fissures with a high-pressure air blower",
            "Inject hot bituminous crack sealant to block water infiltration",
            "Apply a micro-surfacing layer over the distressed section",
            "Schedule preventive resurfacing in the municipal works plan",
        ],
        "department": "Public Works Department (PWD) / Road Maintenance",
        "priority": "Medium",
    },
    "open_manhole": {
        "label": "Open Manhole",
        "explanation": "The image shows an open or uncovered manhole chamber on a public street or sidewalk. This represents a critical falling, drowning, and vehicular accident hazard.",
        "actions": [
            "Deploy emergency barricades around the opening immediately",
            "Inspect the chamber interior and verify line flow",
            "Install a new reinforced heavy-duty manhole cover",
            "Secure the locking frame to prevent displacement",
        ],
        "department": "Water Supply & Sewerage Board / Drainage Dept.",
        "priority": "Critical",
    },
    "blocked_drain": {
        "label": "Blocked Drain",
        "explanation": "The image shows a public storm drain clogged with silt, plastic waste, and floating debris. This causes water stagnation and road flooding during rainfall.",
        "actions": [
            "Deploy a drainage maintenance and de-silting crew",
            "Extract accumulated silt and solid waste blocks",
            "Flush the drain line to ensure continuous flow",
            "Inspect and reinstall protective iron drain grates",
        ],
        "department": "Municipal Corporation / Stormwater Drainage Dept.",
        "priority": "High",
    },
    "broken_streetlight": {
        "label": "Broken Streetlight",
        "explanation": "The image shows a damaged, broken, or non-functional public streetlight. Inadequate street lighting compromises nighttime pedestrian safety and public security.",
        "actions": [
            "Inspect pole wiring and the internal junction box",
            "Replace the defective LED luminaire and glass shield",
            "Verify timer switch / photocell circuit operation",
            "Confirm nighttime road illumination is restored",
        ],
        "department": "Municipal Corporation / Street Lighting Division",
        "priority": "Medium",
    },
    "broken_pipeline": {
        "label": "Broken Pipeline",
        "explanation": "The image shows a ruptured municipal water supply pipeline with pressurised leakage. This leads to clean water wastage, low area pressure, and road sub-base erosion.",
        "actions": [
            "Isolate the nearest control valve to arrest water flow",
            "Excavate around the damaged pipe section",
            "Install a high-pressure repair clamp or replace the section",
            "Backfill the trench and resurface the damaged roadway",
        ],
        "department": "Municipal Water Works & Pipeline Distribution Dept.",
        "priority": "Critical",
    },
    "water_leakage": {
        "label": "Water Leakage",
        "explanation": "The image shows continuous water seepage pooling on the public thoroughfare. Stagnant water damages road asphalt and breeds disease-carrying mosquitoes.",
        "actions": [
            "Identify the source and pinpoint the leaking pipe joint",
            "Repair defective fittings or the customer service connection",
            "Channel pooled water into stormwater drainage",
            "Inspect road asphalt for water-induced weakness",
        ],
        "department": "Municipal Water Supply Department",
        "priority": "High",
    },
    "damp_or_seepage": {
        "label": "Damp / Seepage",
        "explanation": "The image shows persistent damp patches, wall seepage, or efflorescence on a structure. Prolonged moisture weakens plaster and reinforcement and encourages mould growth.",
        "actions": [
            "Trace the moisture source (overhead tank, drain line, or rainwater)",
            "Repair the failing waterproofing or sanitary line",
            "Re-plaster and apply waterproof coating to the affected surface",
            "Re-inspect after one rainfall cycle",
        ],
        "department": "Municipal Corporation / Building Maintenance",
        "priority": "Medium",
    },
    "flooding": {
        "label": "Water Logging / Flooding",
        "explanation": "The image shows a road or public area submerged under standing water. This halts traffic, risks vehicle damage, and can conceal open drains beneath the surface.",
        "actions": [
            "Deploy dewatering pumps to the affected stretch",
            "Clear the nearest stormwater inlets and outfall drains",
            "Barricade submerged manholes and low-lying stretches",
            "Log the location for the pre-monsoon desilting plan",
        ],
        "department": "Municipal Corporation / Disaster Management Cell",
        "priority": "Critical",
    },
    "contaminated_water": {
        "label": "Contaminated Water Supply",
        "explanation": "The image shows discoloured, turbid, or visibly contaminated water from a public supply. This is an immediate waterborne disease risk to the surrounding population.",
        "actions": [
            "Collect a sample for immediate laboratory testing",
            "Trace cross-contamination between sewer and supply lines",
            "Issue a boil-water advisory to the affected locality",
            "Flush and chlorinate the distribution line",
        ],
        "department": "Municipal Water Supply / Public Health Dept.",
        "priority": "Critical",
    },
    "damaged_electrical_pole": {
        "label": "Damaged Electrical Pole",
        "explanation": "The image shows an electrical utility pole tilted or fractured with drooping power cables. There is imminent danger of structural collapse and electrocution.",
        "actions": [
            "Cordon off the perimeter and de-energise the affected feeder",
            "Support and remove the damaged utility pole",
            "Erect a new pre-stressed concrete or steel pole",
            "Re-tension cables and safely restore power supply",
        ],
        "department": "State Electricity Distribution Company (DISCOM)",
        "priority": "Critical",
    },
    "exposed_wire": {
        "label": "Exposed Electrical Wire",
        "explanation": "The image shows live or uninsulated electrical wiring hanging within public reach. High risk of life-threatening electric shock or short-circuit fire.",
        "actions": [
            "De-energise the circuit at the nearest junction box",
            "Re-insulate conductors using high-voltage insulation",
            "Enclose cables within protective conduit piping",
            "Install a tamper-proof lock on the distribution box",
        ],
        "department": "Electricity Board / Power Maintenance Division",
        "priority": "Critical",
    },
    "broken_footpath": {
        "label": "Broken Footpath",
        "explanation": "The image shows broken pavement slabs, missing curb stones, and uneven walkway blocks. This forces pedestrians onto traffic lanes and increases accident risk.",
        "actions": [
            "Demolish and clear fractured sidewalk slabs",
            "Re-level the sand bedding and compact the foundation",
            "Install new anti-skid interlocking concrete pavers",
            "Ensure accessibility ramps at road crossings",
        ],
        "department": "Municipal Corporation / Civil Engineering (Footpaths)",
        "priority": "Medium",
    },
    "fallen_tree": {
        "label": "Fallen Tree",
        "explanation": "The image shows a fallen tree or heavy branch blocking a public roadway or pedestrian lane. This obstructs traffic flow and emergency access.",
        "actions": [
            "Deploy a tree clearance unit with motorised chainsaws",
            "Cut the fallen trunk and branches into manageable logs",
            "Clear timber and green waste from the thoroughfare",
            "Examine surrounding trees for precarious overhanging boughs",
        ],
        "department": "Municipal Horticulture & Disaster Response Team",
        "priority": "Critical",
    },
    "construction_debris": {
        "label": "Construction Debris",
        "explanation": "The image shows construction rubble, broken concrete, and plaster debris dumped on a public road. This narrows the carriageway and causes airborne dust.",
        "actions": [
            "Dispatch an earthmover (JCB) and dump truck to remove rubble",
            "Transport debris to the designated C&D recycling plant",
            "Sweep and wash the road surface to remove loose gravel",
            "Issue a penalty notice to the offending contractor if identified",
        ],
        "department": "Municipal Corporation / C&D Waste Management",
        "priority": "Medium",
    },
    "dead_animal": {
        "label": "Dead Animal",
        "explanation": "The image shows an animal carcass lying on the public roadway. This poses an urgent biological hazard, foul odour, disease spread, and pest infestation.",
        "actions": [
            "Dispatch a veterinary sanitation vehicle with protective gear",
            "Safely collect the carcass for hygienic disposal",
            "Disinfect the road surface with sodium hypochlorite solution",
            "Ensure the area is thoroughly cleaned and sanitised",
        ],
        "department": "Municipal Health & Sanitation Dept.",
        "priority": "Critical",
    },
    "damaged_traffic_signal": {
        "label": "Damaged Traffic Signal",
        "explanation": "The image shows an inoperative, fractured, or unlit traffic signal. Intersection confusion poses an immediate risk of multi-vehicle collisions.",
        "actions": [
            "Dispatch an emergency traffic signal technician",
            "Deploy a manual traffic warden while the signal is offline",
            "Replace the damaged signal head / LED optical assembly",
            "Reboot and synchronise the signal controller",
        ],
        "department": "Traffic Police / Municipal Traffic Engineering Cell",
        "priority": "Critical",
    },
    "illegal_parking": {
        "label": "Illegal Parking",
        "explanation": "The image shows unauthorised vehicles parked in a no-parking area, blocking pedestrian access and emergency lanes.",
        "actions": [
            "Dispatch a traffic towing crane to clear the obstruction",
            "Issue a digital traffic violation citation to the owner",
            "Erect permanent 'No Parking' signage at the location",
            "Maintain unobstructed lane access for emergency services",
        ],
        "department": "Traffic Police Department",
        "priority": "Medium",
    },
    "unhygienic_food_stall": {
        "label": "Unhygienic Food Stall",
        "explanation": "The image shows a food stall with stagnant wash water, exposed food items, and unhygienic waste disposal beside a roadway.",
        "actions": [
            "Inspect the health licence and food safety compliance",
            "Order immediate closure or relocation of the unsanitary stall",
            "Clear stagnant wastewater and food refuse from the street side",
            "Issue a formal food safety compliance directive",
        ],
        "department": "Food Safety & Public Health Department",
        "priority": "Medium",
    },
    "damaged_park_equipment": {
        "label": "Damaged Park Equipment",
        "explanation": "The image shows damaged swings, broken play equipment, or rusted gym apparatus in a public park. Risk of physical injury to children.",
        "actions": [
            "Place danger warning tape around the broken equipment",
            "Dismantle damaged swings or fractured metallic components",
            "Weld or replace the defective playground apparatus",
            "Apply a non-toxic anti-rust protective coating",
        ],
        "department": "Municipal Horticulture & Parks Department",
        "priority": "Medium",
    },
    "stray_animal_concern": {
        "label": "Stray Animal Concern",
        "explanation": "The image shows stray or unsupervised animals in a public roadway or pedestrian area, posing safety, bite, or traffic collision hazards.",
        "actions": [
            "Dispatch veterinary animal control squad to the location",
            "Check animal health, immunization, and sterilization tag",
            "Safely relocate to designated municipal animal shelter if required",
            "Ensure clear and safe pedestrian movement in the vicinity",
        ],
        "department": "Municipal Corporation / Public Health & Veterinary Dept.",
        "priority": "Medium",
    },
    "public_toilet_unusable": {
        "label": "Public Toilet Unusable",
        "explanation": "The image shows a municipal public toilet or community sanitation facility that is damaged, unhygienic, or lacking water supply.",
        "actions": [
            "Dispatch emergency sanitation cleaning crew immediately",
            "Repair plumbing fixtures, taps, flushes, or water supply lines",
            "Thoroughly disinfect and sanitize the facility stalls",
            "Restore regular water pressure and cleanliness standards",
        ],
        "department": "Municipal Corporation / Solid Waste & Sanitation Dept.",
        "priority": "High",
    },
    "footpath_encroachment": {
        "label": "Footpath Encroachment",
        "explanation": "The image shows unauthorized hawkers, commercial stalls, or construction barriers blocking the pedestrian sidewalk and forcing pedestrians onto roads.",
        "actions": [
            "Deploy municipal encroachment removal squad",
            "Clear unauthorized goods, temporary structures, and obstacles",
            "Restore pedestrian sidewalk accessibility and safety",
            "Issue formal municipal penalty notice to unauthorized occupants",
        ],
        "department": "Municipal Corporation / Encroachment Removal Dept.",
        "priority": "Medium",
    },
}

# ---------------------------------------------------------------------------
# Confusable groups
#
# These are the classes that genuinely look alike in a photograph. When the
# model's top two guesses fall inside the same group and it cannot separate
# them confidently, we report the group instead of inventing a specific
# answer. A ticket routed to "Water-related issue" that a clerk refines is far
# more useful than one confidently mislabelled "water_leakage" at 41%.
# ---------------------------------------------------------------------------

CONFUSABLE_GROUPS = {
    "water_related_issue": {
        "members": [
            "water_leakage",
            "damp_or_seepage",
            "flooding",
            "contaminated_water",
            "broken_pipeline",
        ],
        "label": "Water-related Issue",
        "explanation": "The image shows a water-related civic problem - leakage, seepage, water logging, or supply contamination. The exact sub-type needs confirmation by the field officer.",
        "actions": [
            "Send a water department field officer to confirm the sub-type",
            "Trace the water source and check the nearest supply line",
            "Drain or channel standing water away from the roadway",
            "Record the precise sub-category after site inspection",
        ],
        "department": "Municipal Water Supply Department",
        "priority": "High",
    },
    "road_surface_damage": {
        "members": ["pothole", "road_crack", "broken_footpath"],
        "label": "Road Surface Damage",
        "explanation": "The image shows damage to a road or footpath surface. The severity grade needs confirmation on site before the repair method is chosen.",
        "actions": [
            "Send a road inspector to grade the severity",
            "Barricade the damaged stretch if it is a traffic hazard",
            "Select the repair method (patching, sealing, or re-laying)",
            "Record measurements for the works estimate",
        ],
        "department": "Public Works Department (PWD) / Road Maintenance",
        "priority": "High",
    },
    "waste_accumulation": {
        "members": ["illegal_dumping", "garbage_overflow", "construction_debris"],
        "label": "Waste Accumulation",
        "explanation": "The image shows accumulated waste in a public space. The waste type determines whether a compactor, a JCB, or a C&D truck is dispatched.",
        "actions": [
            "Send a sanitation supervisor to identify the waste type",
            "Dispatch the appropriate clearance vehicle",
            "Clean and disinfect the site after removal",
            "Check whether the location needs a recurring pickup",
        ],
        "department": "Municipal Corporation / Solid Waste Management",
        "priority": "High",
    },
    "electrical_hazard": {
        "members": ["damaged_electrical_pole", "exposed_wire", "broken_streetlight"],
        "label": "Electrical Hazard",
        "explanation": "The image shows an electrical installation that is damaged or unsafe. Treat as live until a lineman confirms otherwise.",
        "actions": [
            "Cordon off the area and treat all conductors as live",
            "Dispatch a DISCOM lineman for assessment",
            "De-energise the feeder if there is any public contact risk",
            "Record the pole / feeder number for the repair order",
        ],
        "department": "State Electricity Distribution Company (DISCOM)",
        "priority": "Critical",
    },
}

# Reverse index: category slug -> group slug
_MEMBER_TO_GROUP = {
    member: group
    for group, meta in CONFUSABLE_GROUPS.items()
    for member in meta["members"]
}

UNCLASSIFIED = {
    "label": "Unclassified Civic Issue",
    "explanation": "A civic issue was detected in the image, but the system could not confidently determine which category it belongs to. It has been routed for manual triage rather than guessed at.",
    "actions": [
        "Assign to the municipal triage desk for manual categorisation",
        "Ask the citizen for one additional photo or a short description",
        "Confirm the location from the attached GPS metadata",
        "Re-route to the correct department once categorised",
    ],
    "department": "Municipal Corporation / Central Grievance Cell",
    "priority": "Medium",
}

NON_CIVIC = {
    "label": "Non-Civic Issue",
    "explanation": "The uploaded photo does not show a municipal infrastructure defect, road damage, or public sanitation issue. It appears to be a personal, indoor, or otherwise private scene.",
    "actions": [
        "Hold the grievance as an invalid public complaint",
        "Notify the citizen that the photo does not qualify for civic maintenance",
        "Request a photo of the actual public road or infrastructure",
    ],
    "department": "N/A (Invalid Public Grievance)",
    "priority": "None",
}

CATEGORIES = sorted(CIVIC_KNOWLEDGE_BASE.keys())


def group_of(category: str):
    """Return the confusable-group slug for a category, or None."""
    return _MEMBER_TO_GROUP.get(category)


def describe(category: str) -> dict:
    """Look up a category or group slug and return its complaint template."""
    if category in CIVIC_KNOWLEDGE_BASE:
        return CIVIC_KNOWLEDGE_BASE[category]
    if category in CONFUSABLE_GROUPS:
        return CONFUSABLE_GROUPS[category]
    if category == "non_civic":
        return NON_CIVIC
    return UNCLASSIFIED
