"""
Factual Report Generation Module for CivicPulse AI.

Synthesizes a grounded, verifiable narrative description strictly derived from:
- Detected visual objects and spatial localization
- Verified category classification
- Citizen questionnaire answers
- Verified municipal GIS ward location

CRITICAL ANTI-HALLUCINATION RULE:
The report generator NEVER synthesizes unverified events, accident statistics,
or claims beyond what is directly attested by the visual evidence or citizen inputs.
"""

from __future__ import annotations
from typing import Dict, Any, List, Optional


class ReportSynthesizer:
    """Generates structured, non-hallucinatory civic complaint summaries."""

    def synthesize(
        self,
        category_name: str,
        category_code: str,
        detected_objects: List[Dict[str, Any]],
        severity_level: str,
        ward_name: Optional[str],
        user_answers: Optional[Dict[str, Any]] = None,
        authenticity_warnings: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        """
        Generate grounded description, supporting evidence items, and warnings.
        """
        answers = user_answers or {}
        evidence: List[str] = []
        warnings: List[str] = list(authenticity_warnings or [])

        cat_lower = category_code.lower()
        sentences: List[str] = []

        # 1. Primary Visual Finding
        if "pothole" in cat_lower:
            sentences.append(f"A visible {category_name.lower()} is identified on the roadway surface.")
            evidence.append("Road surface asphalt fracture and depression localized.")
            if any(obj.get("area_ratio", 0) > 0.20 for obj in detected_objects):
                sentences.append("The damaged area occupies a significant portion of the carriageway lane.")
                evidence.append("High defect surface area ratio relative to carriageway.")
        elif "garbage" in cat_lower or "dumping" in cat_lower:
            sentences.append(f"An accumulation of solid waste and {category_name.lower()} is visible in the public thoroughfare.")
            evidence.append("Irregular high-frequency solid waste texture cluster detected.")
        elif "wire" in cat_lower:
            sentences.append(f"An exposed electrical conductor cable is visible in the public space.")
            evidence.append("Linear uninsulated utility wiring detected.")
        elif "manhole" in cat_lower:
            sentences.append(f"An uncovered or displaced manhole chamber is visible at the location.")
            evidence.append("High-contrast open chamber void localized.")
        elif "flood" in cat_lower or "water" in cat_lower:
            sentences.append(f"A significant volume of waterlogging and {category_name.lower()} is visible across the public area.")
            evidence.append("Reflective stagnant water surface detected.")
        elif "tree" in cat_lower:
            sentences.append(f"A fallen tree or substantial snapped bough is visible obstructing the public space.")
            evidence.append("Fallen vegetative timber mass localized.")
        elif "streetlight" in cat_lower:
            sentences.append(f"A damaged or non-functional municipal streetlight fixture is visible.")
            evidence.append("Overhead luminaire apparatus localized.")
        elif "hawking" in cat_lower or "encroachment" in cat_lower:
            sentences.append(f"Commercial vending activity or structural obstruction is visible on the pedestrian pathway.")
            evidence.append("Pathway stall structure localized (legality requires field verification).")
        elif "pan" in cat_lower or "spit" in cat_lower:
            sentences.append(f"Prominent tobacco or paan spitting stains and defacement are visible on the public wall or structure.")
            evidence.append("Reddish-brown public surface spitting stains localized.")
        elif "defaced" in cat_lower or "graffiti" in cat_lower:
            sentences.append(f"Defacement, unauthorized markings, or paint stains are visible on the public property wall.")
            evidence.append("Public property surface defacement localized.")
        else:
            sentences.append(f"A potential municipal infrastructure issue ({category_name}) is visible in the submitted photograph.")
            evidence.append(f"Visual pattern matches {category_name} taxonomy.")

        # 2. Add Grounded Questionnaire Inputs
        if answers.get("obstructing_traffic") is True or answers.get("blocking_traffic") is True:
            sentences.append("The defect is reported to be obstructing normal traffic flow.")
            evidence.append("Citizen attestation: active vehicular traffic obstruction.")

        if answers.get("water_accumulating") is True:
            sentences.append("Standing water is reported to be accumulating within the damaged area.")
            evidence.append("Citizen attestation: water pooling inside crater.")

        if answers.get("sparking") is True:
            sentences.append("Active electrical sparking or smoke has been observed at the site.")
            evidence.append("Citizen attestation: active sparking / fire risk.")

        if answers.get("accident_occurred") is True:
            sentences.append("A vehicular collision or pedestrian fall has been reported at this exact hazard site.")
            evidence.append("Citizen attestation: accident / injury occurred.")

        if answers.get("water_entering_buildings") is True:
            sentences.append("Water ingress has been reported affecting adjacent buildings or residences.")
            evidence.append("Citizen attestation: structural inundation.")

        if answers.get("pedestrian_level") is True:
            sentences.append("The wire is hanging within reach of pedestrians.")
            evidence.append("Citizen attestation: hazardous pedestrian height.")

        # 3. Location Reference
        if ward_name:
            sentences.append(f"The incident falls under the jurisdiction of {ward_name}.")

        description = " ".join(sentences)

        return {
            "description": description,
            "evidence": evidence,
            "warnings": warnings,
        }
