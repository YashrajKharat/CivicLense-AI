"""
CivicPulse AI — Master Modular Analysis Pipeline Orchestrator.

Sequentially coordinates:
1. Image Quality Engine
2. Model 0: Civic / Non-Civic Gate
3. Hierarchical Category Classifier (Level 2 & 3)
4. Object Detector & Spatial Localizer
5. Authenticity, EXIF & ELA Tamper Analyzer
6. Vector Embedding & Duplicate Report Engine
7. Deterministic GIS Ward Resolver
8. Category-to-Department Routing
9. Multi-Factor Severity & SLA Engine
10. Dynamic Category Questionnaire Generator
11. Evidence-Grounded Factual Report Synthesizer

Emits standardized JSON responses matching the CivicPulse specifications:
- Section 19: Full Civic Report
- Section 20: Non-Civic Exit
- Section 21: Uncertain Exit
"""

from __future__ import annotations
import io
import time
import uuid
from pathlib import Path
from typing import Dict, Any, Optional, Union
from PIL import Image

try:
    from modules.quality import ImageQualityChecker
    from modules.civic_gate import CivicGate
    from modules.taxonomy import TAXONOMY, get_category
    from modules.classifier import HierarchicalClassifier
    from modules.detector import CivicObjectDetector
    from modules.authenticity import AuthenticityAnalyzer
    from modules.duplicate import DuplicateDetector
    from modules.gis import WardResolver
    from modules.routing import DepartmentRouter
    from modules.severity import SeverityAndSLAEngine
    from modules.questionnaire import QuestionnaireEngine
    from modules.report_gen import ReportSynthesizer
except (ImportError, ValueError):
    from .modules.quality import ImageQualityChecker
    from .modules.civic_gate import CivicGate
    from .modules.taxonomy import TAXONOMY, get_category
    from .modules.classifier import HierarchicalClassifier
    from .modules.detector import CivicObjectDetector
    from .modules.authenticity import AuthenticityAnalyzer
    from .modules.duplicate import DuplicateDetector
    from .modules.gis import WardResolver
    from .modules.routing import DepartmentRouter
    from .modules.severity import SeverityAndSLAEngine
    from .modules.questionnaire import QuestionnaireEngine
    from .modules.report_gen import ReportSynthesizer
import config


class CivicPulsePipeline:
    """End-to-end modular pipeline for civic grievance analysis."""

    def __init__(
        self,
        binary_model_path: Optional[Union[str, Path]] = None,
        centroids_path: Optional[Union[str, Path]] = None,
    ):
        bin_path = binary_model_path or config.BINARY_MODEL_PATH
        cent_path = centroids_path or (config.MODELS_DIR / "civic_category_centroids.npy")

        # Initialize sub-modules
        self.quality_checker = ImageQualityChecker(min_quality_threshold=35)
        self.civic_gate = CivicGate(model_path=bin_path, non_civic_threshold=config.NON_CIVIC_THRESHOLD)
        self.classifier = HierarchicalClassifier(centroids_path=cent_path)
        self.detector = CivicObjectDetector()
        self.authenticity_analyzer = AuthenticityAnalyzer()
        self.duplicate_detector = DuplicateDetector()
        self.ward_resolver = WardResolver()
        self.router = DepartmentRouter()
        self.severity_sla_engine = SeverityAndSLAEngine()
        self.questionnaire_engine = QuestionnaireEngine()
        self.report_synthesizer = ReportSynthesizer()

        # Model versioning registry
        self.model_versions = {
            "civic_classifier": "civic-v1.2",
            "category_classifier": "category-v1.4",
            "detector": "detector-v1.1",
            "authenticity_model": "authenticity-v1.0",
            "pipeline_version": "2.0.0",
        }

    def process_image(
        self,
        image_input: Union[str, bytes, Image.Image],
        latitude: Optional[float] = None,
        longitude: Optional[float] = None,
        user_description: Optional[str] = None,
        user_answers: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Execute full analysis pipeline on an uploaded image.
        """
        start_time = time.time()
        analysis_id = f"CP-AI-{uuid.uuid4().hex[:8].upper()}"

        # 1. Load Image
        raw_bytes = None
        if isinstance(image_input, str):
            with open(image_input, "rb") as f:
                raw_bytes = f.read()
            image = Image.open(io.BytesIO(raw_bytes))
        elif isinstance(image_input, bytes):
            raw_bytes = image_input
            image = Image.open(io.BytesIO(raw_bytes))
        elif isinstance(image_input, Image.Image):
            image = image_input
            buf = io.BytesIO()
            image.save(buf, format="JPEG", quality=90)
            raw_bytes = buf.getvalue()
        else:
            raise ValueError("Unsupported image input format")

        # 2. Step 1 — Image Quality Check
        quality = self.quality_checker.evaluate(image)

        # 3. Step 2 — Model 0: Civic Gate & Candidate-Informed Classification
        gate = self.civic_gate.evaluate(image, quality_result=quality)
        cat_result = self.classifier.classify(image)

        # -------------------------------------------------------------
        # BRANCH: Non-Civic Output (Section 20 Schema)
        # -------------------------------------------------------------
        if gate["decision"] == "NON_CIVIC":
            # Candidate-Informed Rescue: If the category classifier detects a clear
            # municipal grievance (e.g. wall defacement, paan spitting, litter), rescue it
            if cat_result["confidence"] >= 0.70 and cat_result["category_code"] != "other":
                gate = {
                    "is_civic_issue": True,
                    "decision": "CIVIC",
                    "confidence": cat_result["confidence"],
                    "reason": f"Municipal defect detected: {cat_result['category']}.",
                    "raw_score": 0.10
                }
            else:
                return {
                    "analysis_id": analysis_id,
                    "image": {
                        "quality_score": quality["quality_score"],
                        "resolution": quality["resolution"],
                    },
                    "civic_classification": {
                        "decision": "NON_CIVIC",
                        "confidence": gate["confidence"],
                    },
                    "classification": None,
                    "severity": None,
                    "department": None,
                "ward": None,
                "sla": None,
                "requires_review": False,
                "message": "The uploaded image does not appear to show a civic issue.",
                "model_versions": self.model_versions,
                "elapsed_ms": int((time.time() - start_time) * 1000),
            }

        # -------------------------------------------------------------
        # BRANCH: Uncertain Gate Output (Section 21 Schema)
        # -------------------------------------------------------------
        if gate["decision"] == "UNCERTAIN":
            questions = self.questionnaire_engine.get_questions_for_category("other")
            return {
                "analysis_id": analysis_id,
                "image": {
                    "quality_score": quality["quality_score"],
                    "resolution": quality["resolution"],
                    "issues": quality.get("issues", []),
                },
                "civic_classification": {
                    "decision": "UNCERTAIN",
                    "confidence": gate["confidence"],
                },
                "classification": None,
                "severity": None,
                "department": None,
                "ward": None,
                "sla": None,
                "requires_review": True,
                "review_reasons": ["Civic/Non-civic classification confidence is in the uncertain range."],
                "message": (
                    "The image does not provide enough visual evidence to reliably "
                    "determine whether this is a civic issue."
                ),
                "recommended_action": (
                    "Upload a clearer image or answer additional questions."
                    if not quality["is_sufficient"]
                    else "Answer the follow-up questions to clarify the reported condition."
                ),
                "questions": questions,
                "model_versions": self.model_versions,
                "elapsed_ms": int((time.time() - start_time) * 1000),
            }

        # -------------------------------------------------------------
        # CIVIC PIPELINE EXECUTION (Sections 19 Schema)
        # -------------------------------------------------------------
        # Step 3: Hierarchical Category Classifier
        cat_result = self.classifier.classify(image)

        # Step 4: Object Detection & Spatial Area
        det_result = self.detector.detect(
            image,
            category_code=cat_result["category_code"],
            category_confidence=cat_result["confidence"],
        )

        # Step 5: Authenticity & Manipulation Analysis
        auth_result = self.authenticity_analyzer.analyze(image, image_bytes=raw_bytes)

        # Step 6: Embeddings & Duplicate Search
        dup_result = self.duplicate_detector.check_duplicate(
            embedding=cat_result["embedding"],
            phash=auth_result["phash"],
            category_code=cat_result["category_code"],
            latitude=latitude,
            longitude=longitude,
        )

        # Register this complaint embedding into local duplicate index
        self.duplicate_detector.register_report(
            report_id=analysis_id,
            embedding=cat_result["embedding"],
            phash=auth_result["phash"],
            category_code=cat_result["category_code"],
            latitude=latitude,
            longitude=longitude,
            timestamp=time.time(),
        )

        # Step 7: GIS Ward Resolution
        ward_result = self.ward_resolver.resolve(latitude, longitude)

        # Step 8: Department Routing
        dept_result = self.router.get_department(cat_result["category_code"])

        # Step 9: Multi-Factor Severity & SLA
        sev_result = self.severity_sla_engine.compute_severity(
            category_code=cat_result["category_code"],
            category_confidence=cat_result["confidence"],
            object_area_ratio=det_result["object_area_ratio"],
            user_answers=user_answers,
        )
        sla_result = self.severity_sla_engine.compute_sla(
            category_code=cat_result["category_code"],
            severity_level=sev_result["level"],
        )

        # Step 10: Dynamic Questionnaire
        questions = self.questionnaire_engine.get_questions_for_category(cat_result["category_code"])

        # Step 11: Grounded Factual Report Synthesis
        report_text = self.report_synthesizer.synthesize(
            category_name=cat_result["category"],
            category_code=cat_result["category_code"],
            detected_objects=det_result["objects"],
            severity_level=sev_result["level"],
            ward_name=ward_result.get("ward_name"),
            user_answers=user_answers,
            authenticity_warnings=auth_result.get("warnings", []),
        )

        # Human-In-The-Loop Review Flagging (Section 27)
        requires_review = False
        review_reasons = []

        if cat_result["confidence"] < 0.60:
            requires_review = True
            review_reasons.append(f"Category confidence is low ({int(cat_result['confidence'] * 100)}%).")
        if sev_result["level"] == "CRITICAL":
            requires_review = True
            review_reasons.append("Critical severity requires official municipal triage confirmation.")
        if auth_result["status"] in ("POTENTIALLY_MANIPULATED", "POTENTIALLY_AI_GENERATED"):
            requires_review = True
            review_reasons.append(f"Authenticity check flagged possible image tampering ({auth_result['status']}).")
        if dup_result["possible_duplicate"]:
            requires_review = True
            review_reasons.append(f"High duplicate risk ({dup_result['risk_score']}%) matching {dup_result['primary_match']}.")

        # -------------------------------------------------------------
        # FINAL STRUCTURED JSON RESPONSE (Matching Section 19 Exact Schema)
        # -------------------------------------------------------------
        return {
            "analysis_id": analysis_id,
            "image": {
                "quality_score": quality["quality_score"],
                "resolution": quality["resolution"],
            },
            "civic_classification": {
                "decision": gate["decision"],
                "confidence": gate["confidence"],
            },
            "classification": {
                "department": dept_result["department"],
                "domain": cat_result["domain"],
                "category": cat_result["category"],
                "subcategory": cat_result["subcategory"],
                "confidence": cat_result["confidence"],
            },
            "detection": {
                "objects": [
                    {
                        "label": obj["label"],
                        "confidence": obj["confidence"],
                        "bounding_box": obj["bounding_box"],
                    }
                    for obj in det_result["objects"]
                ]
            },
            "severity": {
                "score": sev_result["score"],
                "level": sev_result["level"],
                "confidence": sev_result["confidence"],
            },
            "authenticity": {
                "score": auth_result["score"],
                "status": auth_result["status"],
            },
            "duplicate": {
                "risk_score": dup_result["risk_score"],
                "possible_duplicate": dup_result["possible_duplicate"],
                "similar_report_ids": dup_result["similar_report_ids"],
            },
            "location": {
                "latitude": ward_result["latitude"],
                "longitude": ward_result["longitude"],
                "ward": ward_result["ward"],
                "ward_confidence": ward_result["ward_confidence"],
            },
            "sla": {
                "priority": sla_result["priority"],
                "target_hours": sla_result["target_hours"],
            },
            "description": report_text["description"],
            "questions": questions,
            "evidence": report_text["evidence"],
            "warnings": report_text["warnings"],
            "requires_review": requires_review,
            "review_reasons": review_reasons,
            "model_versions": self.model_versions,
            "elapsed_ms": int((time.time() - start_time) * 1000),
        }
