"""
CivicPulse AI — Model Microservice & REST API.

Provides:
- POST /api/ai/analyze-report       Full modular pipeline analysis (Sections 19, 20, 21)
- GET  /api/ai/categories           Taxonomy, 10 domains, 39 categories, SLA & severity
- GET  /api/ai/questionnaire/<cat>  Category-tailored dynamic questionnaire
- POST /api/ai/duplicate-check      Standalone embedding comparison & duplicate risk
- POST /api/ai/recalculate-severity Recalculate severity & SLA based on citizen questionnaire
- GET  /api/ai/model-status         Model registry, versions, performance metrics
- POST /classify                    Legacy endpoint for backwards compatibility with Node backend
- GET  /health                      System readiness & health
"""

from __future__ import annotations
import base64
import json
import logging
from pathlib import Path
from typing import Optional

from flask import Flask, jsonify, request

try:
    from flask_cors import CORS
    has_cors = True
except ImportError:
    has_cors = False

import config
from pipeline import CivicPulsePipeline
from modules.taxonomy import get_all_categories, get_category, DOMAINS
from modules.questionnaire import QuestionnaireEngine
from modules.severity import SeverityAndSLAEngine

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
log = logging.getLogger("civic_server")

app = Flask(__name__)
if has_cors:
    CORS(app)
else:
    @app.after_request
    def after_request(response):
        response.headers.add("Access-Control-Allow-Origin", "*")
        response.headers.add("Access-Control-Allow-Headers", "Content-Type,Authorization")
        response.headers.add("Access-Control-Allow-Methods", "GET,PUT,POST,DELETE,OPTIONS")
        return response
app.config["MAX_CONTENT_LENGTH"] = 16 * 1024 * 1024  # 16 MB max payload

ALLOWED_MIMETYPES = {"image/jpeg", "image/png", "image/webp", "image/bmp", "image/jpg"}

# Instantiate the master pipeline
log.info("Initializing CivicPulse AI Pipeline...")
pipeline = CivicPulsePipeline()
questionnaire_engine = QuestionnaireEngine()
severity_engine = SeverityAndSLAEngine()


# ---------------------------------------------------------------------------
# Public Health & Discovery
# ---------------------------------------------------------------------------

@app.get("/")
def index():
    return jsonify({
        "service": "CivicPulse AI Modular Grievance Analysis Platform",
        "version": pipeline.model_versions["pipeline_version"],
        "status": "ONLINE & READY",
        "endpoints": {
            "analyze_report": "POST /api/ai/analyze-report",
            "categories": "GET /api/ai/categories",
            "questionnaire": "GET /api/ai/questionnaire/<category>",
            "duplicate_check": "POST /api/ai/duplicate-check",
            "recalculate_severity": "POST /api/ai/recalculate-severity",
            "model_status": "GET /api/ai/model-status",
            "health": "GET /health"
        }
    })


@app.get("/health")
def health():
    return jsonify({
        "status": "ok",
        "binary_model": config.BINARY_MODEL_PATH.exists(),
        "models": pipeline.model_versions,
        "non_civic_threshold": config.NON_CIVIC_THRESHOLD,
    })


@app.get("/api/ai/model-status")
def model_status():
    """Returns model versions, registry, thresholds, and performance metrics."""
    registry_file = Path(__file__).resolve().parent / "registry" / "model_registry.json"
    registry_data = {}
    if registry_file.exists():
        try:
            with open(registry_file, "r") as f:
                registry_data = json.load(f)
        except Exception:
            pass

    return jsonify({
        "status": "healthy",
        "pipeline_version": pipeline.model_versions["pipeline_version"],
        "models": pipeline.model_versions,
        "registry": registry_data,
        "runtime": {
            "non_civic_threshold": config.NON_CIVIC_THRESHOLD,
            "uncertain_band": config.UNCERTAIN_BAND,
            "active_categories": len(get_all_categories()),
            "active_domains": len(DOMAINS),
        }
    })


# ---------------------------------------------------------------------------
# Core Analysis Endpoint (Section 19, 20, 21 JSON)
# ---------------------------------------------------------------------------

@app.post("/api/ai/analyze-report")
def analyze_report():
    """
    Analyzes an uploaded photograph and returns the complete structured CivicPulse report.
    Accepts multipart/form-data with:
      - image: File
      - latitude: float (optional)
      - longitude: float (optional)
      - description: str (optional)
      - user_answers: JSON string (optional)
    Or JSON with {"image_base64": "..."}.
    """
    raw_bytes = None
    lat = None
    lng = None
    user_desc = None
    user_answers = None

    if "image" in request.files:
        f = request.files["image"]
        raw_bytes = f.read()
        
        # Read form parameters
        if "latitude" in request.form and request.form["latitude"]:
            try:
                lat = float(request.form["latitude"])
            except ValueError:
                pass
        if "longitude" in request.form and request.form["longitude"]:
            try:
                lng = float(request.form["longitude"])
            except ValueError:
                pass
        user_desc = request.form.get("description")
        
        raw_answers = request.form.get("user_answers")
        if raw_answers:
            try:
                user_answers = json.loads(raw_answers)
            except Exception:
                pass

    elif request.is_json:
        data = request.get_json(silent=True) or {}
        b64 = data.get("image_base64", "")
        if b64:
            if "," in b64[:64]:
                b64 = b64.split(",", 1)[1]
            try:
                raw_bytes = base64.b64decode(b64)
            except Exception:
                return jsonify({"error": "image_base64 is not valid base64"}), 400
        
        lat = data.get("latitude")
        lng = data.get("longitude")
        user_desc = data.get("description")
        user_answers = data.get("user_answers")

    if not raw_bytes:
        return jsonify({"error": "No image supplied. Provide 'image' file or 'image_base64'."}), 400

    try:
        result = pipeline.process_image(
            image_input=raw_bytes,
            latitude=lat,
            longitude=lng,
            user_description=user_desc,
            user_answers=user_answers,
        )
        return jsonify(result), 200
    except Exception as exc:
        log.exception("Error executing CivicPulse analysis pipeline: %s", exc)
        return jsonify({"error": "Analysis pipeline execution failed", "detail": str(exc)}), 500


# ---------------------------------------------------------------------------
# Taxonomy & Questionnaire Endpoints
# ---------------------------------------------------------------------------

@app.get("/api/ai/categories")
def list_categories():
    """Returns the full 3-level taxonomy of active civic categories."""
    return jsonify({
        "domains": DOMAINS,
        "total_categories": len(get_all_categories()),
        "categories": get_all_categories(),
    })


@app.get("/api/ai/questionnaire/<category_code>")
def get_questionnaire(category_code: str):
    """Returns dynamic follow-up questions tailored to a specific category."""
    questions = questionnaire_engine.get_questions_for_category(category_code)
    cat_info = get_category(category_code)
    return jsonify({
        "category_code": category_code,
        "category_name": cat_info["name"] if cat_info else category_code,
        "questions": questions,
    })


# ---------------------------------------------------------------------------
# Duplicate & Severity Recalculation Endpoints
# ---------------------------------------------------------------------------

@app.post("/api/ai/duplicate-check")
def duplicate_check():
    """Compares image or embedding against existing reports for duplicate risk."""
    raw_bytes = None
    lat = None
    lng = None
    category = "other"

    if "image" in request.files:
        raw_bytes = request.files["image"].read()
        cat_val = request.form.get("category_code")
        if cat_val:
            category = cat_val
        try:
            lat = float(request.form.get("latitude"))
            lng = float(request.form.get("longitude"))
        except (TypeError, ValueError):
            pass

    if not raw_bytes:
        return jsonify({"error": "Provide an image file to check for duplicates."}), 400

    from PIL import Image
    import io
    image = Image.open(io.BytesIO(raw_bytes))
    emb = pipeline.classifier.extract_embedding(image)
    phash = pipeline.authenticity_analyzer._compute_phash(image)

    dup_res = pipeline.duplicate_detector.check_duplicate(
        embedding=emb,
        phash=phash,
        category_code=category,
        latitude=lat,
        longitude=lng,
    )
    return jsonify(dup_res)


@app.post("/api/ai/recalculate-severity")
def recalculate_severity():
    """
    Recalculates severity and SLA deadline based on citizen questionnaire answers.
    Expects JSON: { "category_code": "...", "user_answers": { ... }, "object_area_ratio": 0.25 }
    """
    data = request.get_json(silent=True) or {}
    category_code = data.get("category_code", "pothole")
    user_answers = data.get("user_answers", {})
    object_area_ratio = float(data.get("object_area_ratio", 0.20))
    cat_conf = float(data.get("category_confidence", 0.85))

    sev = severity_engine.compute_severity(
        category_code=category_code,
        category_confidence=cat_conf,
        object_area_ratio=object_area_ratio,
        user_answers=user_answers,
    )
    sla = severity_engine.compute_sla(
        category_code=category_code,
        severity_level=sev["level"],
    )

    return jsonify({
        "severity": sev,
        "sla": sla,
    })


# ---------------------------------------------------------------------------
# Legacy Endpoint for Backwards Compatibility
# ---------------------------------------------------------------------------

@app.post("/classify")
def legacy_classify():
    """Maintains backward compatibility with older Node backend callers."""
    raw = None
    if "image" in request.files:
        f = request.files["image"]
        raw = f.read()
    elif request.is_json:
        b64 = (request.get_json(silent=True) or {}).get("image_base64", "")
        if b64:
            if "," in b64[:64]:
                b64 = b64.split(",", 1)[1]
            try:
                raw = base64.b64decode(b64)
            except Exception:
                return jsonify({"error": "image_base64 is not valid base64"}), 400

    if not raw:
        return jsonify({"error": "no image supplied"}), 400

    try:
        analysis = pipeline.process_image(raw)
        
        # Map to legacy structure expected by local.js
        is_civic = (analysis["civic_classification"]["decision"] == "CIVIC")
        if not is_civic:
            return jsonify({
                "classification": "Non-Civic Issue",
                "is_civic": False,
                "detected_category": "Personal / Non-Civic Scene",
                "ai_confidence": round(analysis["civic_classification"]["confidence"] * 100, 1),
                "ai_explanation": analysis.get("message", "The uploaded photo depicts a personal scene or non-civic subject."),
                "recommended_actions": [
                    "Auto-reject grievance as invalid public complaint",
                    "Notify citizen that the photo does not qualify for civic maintenance"
                ],
                "assigned_department": "Invalid Public Grievance",
                "priority_level": "None"
            })
        
        classification = analysis["classification"]
        sev = analysis["severity"]
        sla = analysis["sla"]

        return jsonify({
            "classification": "Civic Issue",
            "is_civic": True,
            "category": classification["category"].lower().replace(" ", "_"),
            "category_label": classification["category"],
            "detected_category": classification["category"],
            "ai_confidence": round(analysis["civic_classification"]["confidence"] * 100, 1),
            "category_confidence": round(classification["confidence"] * 100, 1),
            "ai_explanation": analysis["description"],
            "recommended_actions": [f"Assign to {classification['department']}", f"Verify turnaround within {sla['target_hours']}h SLA"],
            "assigned_department": classification["department"],
            "priority_level": sev["level"].capitalize(),
            "severity_score": sev["score"],
            "authenticity_score": analysis["authenticity"]["score"],
            "authenticity_status": analysis["authenticity"]["status"],
            "duplicate_risk": analysis["duplicate"]["risk_score"],
            "questions": analysis.get("questions", []),
            "evidence": analysis.get("evidence", []),
            "warnings": analysis.get("warnings", []),
            "analysis_id": analysis["analysis_id"]
        })
    except Exception as exc:
        log.exception("Classification error: %s", exc)
        return jsonify({"error": "Classification error", "detail": str(exc)}), 500


if __name__ == "__main__":
    try:
        from waitress import serve
        log.info("Starting CivicPulse AI REST API on http://0.0.0.0:8000 (Waitress WSGI)...")
        serve(app, host="0.0.0.0", port=8000, threads=4)
    except ImportError:
        log.info("Starting CivicPulse AI REST API on http://0.0.0.0:8000 (Flask dev server)...")
        app.run(host="0.0.0.0", port=8000)
