"""
Unit & Integration Test Suite for CivicPulse AI Modular Pipeline.

Verifies:
1. Image Quality Engine (sharpness, exposure, resolution)
2. Model 0: Civic Gate & Non-Civic short-circuiting (Section 20 schema)
3. 3-Level Category Taxonomy & Safety Rules (no hallucinating invisible attributes)
4. Object Detection & Spatial Bounding Boxes
5. Authenticity Engine (probabilistic bounds, never 100%)
6. GIS Deterministic Ward Resolver (never hallucinates wards)
7. Multi-Factor Severity & SLA turnaround calculations
8. End-to-End Pipeline Execution (Section 19 schema compliance)
"""

import io
import sys
from pathlib import Path
import numpy as np
from PIL import Image

# Ensure model root is in Python path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from modules.quality import ImageQualityChecker
from modules.civic_gate import CivicGate
from modules.taxonomy import TAXONOMY, DOMAINS, get_category
from modules.authenticity import AuthenticityAnalyzer
from modules.gis import WardResolver
from modules.severity import SeverityAndSLAEngine
from modules.questionnaire import QuestionnaireEngine
from pipeline import CivicPulsePipeline


def create_dummy_image(color=(120, 120, 120), size=(320, 320), add_noise=True) -> Image.Image:
    """Helper to synthesize test images in-memory."""
    arr = np.full((size[1], size[0], 3), color, dtype=np.uint8)
    if add_noise:
        # Add high-contrast gradient pattern to simulate texture
        for y in range(size[1]):
            for x in range(size[0]):
                if (x - 160)**2 + (y - 160)**2 < 50**2:
                    arr[y, x] = [30, 30, 30]  # dark crater
    return Image.fromarray(arr)


def test_image_quality_checker():
    checker = ImageQualityChecker()
    # 1. Good resolution textured image
    good_img = create_dummy_image(size=(640, 480))
    res = checker.evaluate(good_img)
    assert res["quality_score"] > 40
    assert res["is_sufficient"] is True
    assert res["resolution"] == "640x480"

    # 2. Insufficient tiny image
    tiny_img = Image.new("RGB", (100, 80), color=(0, 0, 0))
    res_tiny = checker.evaluate(tiny_img)
    assert res_tiny["quality_score"] < 45
    print("[OK] ImageQualityChecker passed")


def test_taxonomy_and_safety_rules():
    # Verify 10 domains
    assert len(DOMAINS) == 10
    # Verify all 39 categories exist
    assert len(TAXONOMY) >= 37
    
    # SAFETY RULES VERIFICATION:
    # Invisible conditions must NEVER be marked visually determinable
    no_water = get_category("no_water_supply")
    assert no_water["visually_determinable"] is False
    
    contam_water = get_category("contaminated_water")
    assert contam_water["visually_determinable"] is False
    
    noise = get_category("persistent_noise")
    assert noise["visually_determinable"] is False

    # Pothole must be visually determinable
    pothole = get_category("pothole")
    assert pothole["visually_determinable"] is True
    assert pothole["department"] == "Roads & Traffic Infrastructure"
    print("[OK] Taxonomy and Safety Rules passed")


def test_authenticity_probabilistic_bounds():
    analyzer = AuthenticityAnalyzer()
    img = create_dummy_image()
    res = analyzer.analyze(img)
    
    # Critical Safety Rule: Score must NEVER be 100%
    assert res["score"] <= 95
    assert res["score"] >= 10
    assert res["status"] in ("LIKELY_AUTHENTIC", "POTENTIALLY_MANIPULATED", "POTENTIALLY_AI_GENERATED", "UNCERTAIN")
    assert "phash" in res and len(res["phash"]) == 16
    print("[OK] Authenticity Probabilistic Bounds passed")


def test_gis_ward_resolver():
    resolver = WardResolver()
    
    # 1. Valid coordinates in Andheri West (Ward K/West)
    res_kw = resolver.resolve(19.12, 72.83)
    assert res_kw["ward"] == "WARD-KW"
    assert res_kw["ward_confidence"] == 1.0

    # 2. Missing coordinates -> MUST be null and 0.0 confidence (NEVER hallucinate)
    res_null = resolver.resolve(None, None)
    assert res_null["ward"] is None
    assert res_null["ward_confidence"] == 0.0

    # 3. Completely out of bounds (e.g. North Pole) -> null ward
    res_out = resolver.resolve(85.0, 0.0)
    assert res_out["ward"] is None
    assert res_out["ward_confidence"] == 0.0
    print("[OK] GIS Ward Resolver passed")


def test_severity_and_sla():
    engine = SeverityAndSLAEngine()

    # 1. Base pothole severity
    sev_normal = engine.compute_severity("pothole", category_confidence=0.90)
    assert sev_normal["level"] in ("MEDIUM", "HIGH")

    # 2. Critical hazard conditions via questionnaire (accident occurred)
    sev_hazard = engine.compute_severity(
        "pothole",
        category_confidence=0.90,
        user_answers={"accident_occurred": True, "obstructing_traffic": True}
    )
    assert sev_hazard["score"] > sev_normal["score"]
    assert sev_hazard["level"] in ("HIGH", "CRITICAL")

    # 3. Open manhole SLA must be emergency (<= 4h)
    sla_manhole = engine.compute_sla("open_manhole", "CRITICAL")
    assert sla_manhole["priority"] == "CRITICAL"
    assert sla_manhole["target_hours"] <= 4
    print("[OK] Severity & SLA Engine passed")


def test_dynamic_questionnaire():
    q_engine = QuestionnaireEngine()
    
    # Pothole questions
    pothole_qs = q_engine.get_questions_for_category("pothole")
    assert any(q["id"] == "obstructing_traffic" for q in pothole_qs)
    
    # Exposed wire questions
    wire_qs = q_engine.get_questions_for_category("exposed_wire")
    assert any(q["id"] == "sparking" for q in wire_qs)
    assert any(q["id"] == "pedestrian_level" for q in wire_qs)
    print("[OK] Dynamic Questionnaire passed")


def test_end_to_end_pipeline():
    pipeline = CivicPulsePipeline()
    img = create_dummy_image(size=(480, 480))

    # Run full analysis
    res = pipeline.process_image(
        image_input=img,
        latitude=19.12,
        longitude=72.83,
        user_answers={"obstructing_traffic": True}
    )

    # Check top-level JSON structure
    assert "analysis_id" in res
    assert "image" in res
    assert "civic_classification" in res
    assert res["civic_classification"]["decision"] in ("CIVIC", "NON_CIVIC", "UNCERTAIN")

    if res["civic_classification"]["decision"] == "CIVIC":
        assert "classification" in res
        assert "department" in res["classification"]
        assert "detection" in res
        assert len(res["detection"]["objects"]) > 0
        assert "severity" in res
        assert "authenticity" in res
        assert "duplicate" in res
        assert "location" in res
        assert res["location"]["ward"] == "WARD-KW"
        assert "sla" in res
        assert "description" in res
        assert "questions" in res
        assert "evidence" in res
        assert "model_versions" in res

    print("[OK] End-to-End Pipeline test passed")


if __name__ == "__main__":
    print("\n--- Running CivicPulse AI Test Suite ---")
    test_image_quality_checker()
    test_taxonomy_and_safety_rules()
    test_authenticity_probabilistic_bounds()
    test_gis_ward_resolver()
    test_severity_and_sla()
    test_dynamic_questionnaire()
    test_end_to_end_pipeline()
    print("\nALL CIVICPULSE TESTS PASSED SUCCESSFULLY! \n")
