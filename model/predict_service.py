"""
CivicPulse AI - image classification service.

Two stages:

  Stage 1  binary gate      civic vs non-civic (models/civic_non_civic_model.keras)
  Stage 2  category         which of the 22 civic categories (models/category_model.keras)

Stage 2 is optional. If the category model has not been trained yet, the
service either asks the vision API (when configured) or returns an honest
"unclassified" result routed to the triage desk. It never guesses.

Public API (backwards compatible with the previous version):

    import predict_service
    result = predict_service.classify_image("photo.jpg")
    result["classification"]        "Civic Issue" | "Non-Civic Issue"
    result["is_civic"]              bool
    result["ai_confidence"]         float, percent
    result["ai_explanation"]        str
    result["recommended_actions"]   list[str]
    result["assigned_department"]   str
    result["priority_level"]        str

New fields:

    result["category"]              slug, e.g. "pothole" or "water_related_issue"
    result["category_label"]        human label
    result["category_confidence"]   float, percent
    result["top_categories"]        [{"category","label","confidence"}, ...]
    result["needs_human_review"]    bool
    result["stage2_source"]         "local_model" | "vision_api" | "none"
    result["warnings"]              list[str]
"""

from __future__ import annotations

import base64
import io
import json
import logging
import mimetypes
import os
import sys
from pathlib import Path
from typing import Union

import numpy as np

import config
from knowledge_base import (
    CATEGORIES,
    CONFUSABLE_GROUPS,
    describe,
    group_of,
)

log = logging.getLogger("civic_ai")

# TensorFlow is imported lazily so that importing this module (for example in a
# Django settings file) does not pay the multi-second TF import cost.
_tf = None
_binary_model = None
_category_model = None
_category_labels = None


def _tensorflow():
    global _tf
    if _tf is None:
        os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "2")
        import tensorflow as tf  # noqa: PLC0415

        _tf = tf
    return _tf


# ---------------------------------------------------------------------------
# Model loading
# ---------------------------------------------------------------------------


def get_binary_model():
    """Load the civic / non-civic model once and keep it in memory."""
    global _binary_model
    if _binary_model is None:
        if not config.BINARY_MODEL_PATH.exists():
            raise FileNotFoundError(
                f"Binary model not found at {config.BINARY_MODEL_PATH}"
            )
        _binary_model = _tensorflow().keras.models.load_model(
            str(config.BINARY_MODEL_PATH)
        )
    return _binary_model


def get_category_model():
    """
    Load the multi-class category model if it exists.

    Returns (model, labels) or (None, None) when it has not been trained yet.
    """
    global _category_model, _category_labels
    if _category_model is None:
        if not (
            config.CATEGORY_MODEL_PATH.exists() and config.CATEGORY_LABELS_PATH.exists()
        ):
            return None, None
        _category_model = _tensorflow().keras.models.load_model(
            str(config.CATEGORY_MODEL_PATH)
        )
        _category_labels = json.loads(
            config.CATEGORY_LABELS_PATH.read_text(encoding="utf-8")
        )["labels"]
    return _category_model, _category_labels


def warmup():
    """Load every available model up front - call this at server start."""
    get_binary_model()
    get_category_model()


# ---------------------------------------------------------------------------
# Preprocessing
# ---------------------------------------------------------------------------


def _load_image_array(image: Union[str, Path, bytes]) -> np.ndarray:
    """
    Accepts a file path or raw image bytes and returns a (1, 224, 224, 3)
    float32 array in the 0-255 range.

    Do NOT rescale here. Both models contain their own normalisation layers
    (x / 127.5 - 1). Dividing again would halve every pixel value and is a
    classic cause of a model that "works in the notebook but not in the app".
    """
    tf = _tensorflow()
    if isinstance(image, (bytes, bytearray)):
        from PIL import Image  # noqa: PLC0415

        pil = Image.open(io.BytesIO(image)).convert("RGB").resize(config.IMAGE_SIZE)
        arr = np.asarray(pil, dtype="float32")
    else:
        pil = tf.keras.utils.load_img(str(image), target_size=config.IMAGE_SIZE)
        arr = tf.keras.utils.img_to_array(pil)
    return np.expand_dims(arr, axis=0)


# ---------------------------------------------------------------------------
# Stage 2 - category resolution
# ---------------------------------------------------------------------------


def _resolve_category_local(img_array) -> dict | None:
    """Run the local multi-class model and apply the confusable-group logic."""
    model, labels = get_category_model()
    if model is None:
        return None

    probs = model.predict(img_array, verbose=0)[0].astype(float)
    order = np.argsort(probs)[::-1]
    top = [
        {
            "category": labels[i],
            "label": describe(labels[i]).get("label", labels[i]),
            "confidence": round(float(probs[i]) * 100, 2),
        }
        for i in order[:3]
    ]

    best, best_p = labels[order[0]], float(probs[order[0]])
    second, second_p = (
        (labels[order[1]], float(probs[order[1]])) if len(order) > 1 else (None, 0.0)
    )

    warnings = []

    # Case 1: confident enough, and clearly ahead of the runner-up.
    if best_p >= config.CATEGORY_MIN_CONFIDENCE and (best_p - second_p) >= config.CATEGORY_MARGIN:
        return {
            "category": best,
            "confidence": round(best_p * 100, 2),
            "top_categories": top,
            "needs_human_review": False,
            "source": "local_model",
            "warnings": warnings,
        }

    # Case 2: the top two are close AND belong to the same confusable family
    # (water_leakage vs flooding vs seepage, pothole vs road_crack, ...).
    # Report the family. This is the honest answer and it still routes the
    # ticket to the right department.
    g1, g2 = group_of(best), group_of(second) if second else None
    if g1 and g1 == g2:
        combined = sum(
            float(probs[labels.index(m)])
            for m in CONFUSABLE_GROUPS[g1]["members"]
            if m in labels
        )
        warnings.append(
            f"Top classes '{best}' and '{second}' are visually similar; "
            f"reported as the '{g1}' group instead of guessing."
        )
        return {
            "category": g1,
            "confidence": round(min(combined, 1.0) * 100, 2),
            "top_categories": top,
            "needs_human_review": True,
            "source": "local_model",
            "warnings": warnings,
        }

    # Case 3: borderline between two categories. Assign to the leading prediction
    # but flag for human review so the ticket is routed to the likely department.
    warnings.append(
        f"Top prediction '{best}' ({best_p * 100:.1f}%) is close to '{second}' ({second_p * 100:.1f}%). "
        f"Assigned to {best} with human review flag."
    )
    return {
        "category": best,
        "confidence": round(best_p * 100, 2),
        "top_categories": top,
        "needs_human_review": True,
        "source": "local_model",
        "warnings": warnings,
    }


_VISION_PROMPT = (
    "You are triaging a municipal complaint photograph for an Indian city "
    "corporation. Choose the single category slug from this list that best "
    "describes the civic problem visible in the image:\n\n{cats}\n\n"
    "If none of them fit, answer 'unclassified'. Reply with ONLY a JSON "
    'object, no markdown fences: {{"category": "<slug>", "confidence": <0-100>}}'
)


def _resolve_category_vision(image: Union[str, Path, bytes]) -> dict | None:
    """
    Optional fallback: ask a vision model to name the category.

    Enable with CIVIC_USE_VISION_FALLBACK=1 and ANTHROPIC_API_KEY=... . This
    lets the app return correct categories today, before the local category
    model has been trained.
    """
    if not (config.USE_VISION_FALLBACK and config.ANTHROPIC_API_KEY):
        return None
    try:
        import urllib.request  # noqa: PLC0415

        if isinstance(image, (bytes, bytearray)):
            raw, media = bytes(image), "image/jpeg"
        else:
            raw = Path(image).read_bytes()
            media = mimetypes.guess_type(str(image))[0] or "image/jpeg"

        body = json.dumps(
            {
                "model": config.VISION_MODEL,
                "max_tokens": 200,
                "messages": [
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "image",
                                "source": {
                                    "type": "base64",
                                    "media_type": media,
                                    "data": base64.b64encode(raw).decode(),
                                },
                            },
                            {
                                "type": "text",
                                "text": _VISION_PROMPT.format(
                                    cats="\n".join(f"- {c}" for c in CATEGORIES)
                                ),
                            },
                        ],
                    }
                ],
            }
        ).encode()

        req = urllib.request.Request(
            "https://api.anthropic.com/v1/messages",
            data=body,
            headers={
                "content-type": "application/json",
                "x-api-key": config.ANTHROPIC_API_KEY,
                "anthropic-version": "2023-06-01",
            },
        )
        with urllib.request.urlopen(req, timeout=30) as resp:
            payload = json.loads(resp.read())

        text = "".join(b.get("text", "") for b in payload.get("content", []))
        parsed = json.loads(text.replace("```json", "").replace("```", "").strip())
        cat = parsed.get("category", "unclassified")
        if cat not in CATEGORIES:
            cat = "unclassified"
        conf = float(parsed.get("confidence", 0))
        return {
            "category": cat,
            "confidence": round(conf, 2),
            "top_categories": [
                {
                    "category": cat,
                    "label": describe(cat).get("label", cat),
                    "confidence": round(conf, 2),
                }
            ],
            "needs_human_review": cat == "unclassified" or conf < 60,
            "source": "vision_api",
            "warnings": [],
        }
    except Exception as exc:  # noqa: BLE001 - fallback must never break the request
        log.warning("Vision fallback failed: %s", exc)
        return None


def _resolve_category_filename(image) -> dict | None:
    """
    Legacy behaviour, off by default.

    The old service picked the category by searching the *file path* for a
    category name. Real uploads are named IMG_2033.jpg, so nothing ever
    matched and every civic photo silently fell back to the "illegal dumping"
    template. That single line is why unrelated photos came back with the
    wrong description. It is kept only for reproducing old dataset tests.
    """
    if not config.ALLOW_FILENAME_HINTS or isinstance(image, (bytes, bytearray)):
        return None
    p = str(image).lower()
    for cat in CATEGORIES:
        if cat in p or cat.replace("_", " ") in p:
            return {
                "category": cat,
                "confidence": 0.0,
                "top_categories": [],
                "needs_human_review": True,
                "source": "filename_hint",
                "warnings": ["Category taken from the filename, not the image."],
            }
    return None


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------


def classify_image(image: Union[str, Path, bytes]) -> dict:
    """
    Classify a complaint photograph.

    `image` may be a file path or raw image bytes (so a Flask/Django view can
    pass request.files["photo"].read() without writing to disk).
    """
    img_array = _load_image_array(image)

    # ---- Stage 1: civic or not -------------------------------------------
    score = float(get_binary_model().predict(img_array, verbose=0)[0][0])
    # score near 1.0 means NON-civic
    warnings: list[str] = []
    borderline = abs(score - config.NON_CIVIC_THRESHOLD) <= config.UNCERTAIN_BAND
    if borderline:
        warnings.append(
            f"Civic/non-civic score {score:.2f} is close to the "
            f"{config.NON_CIVIC_THRESHOLD:.2f} threshold - flagged for review."
        )

    if score >= config.NON_CIVIC_THRESHOLD:
        info = describe("non_civic")
        return {
            "classification": "Non-Civic Issue",
            "is_civic": False,
            "ai_confidence": round(score * 100, 2),
            "ai_explanation": info["explanation"],
            "recommended_actions": info["actions"],
            "assigned_department": info["department"],
            "priority_level": info["priority"],
            "category": "non_civic",
            "category_label": info["label"],
            "category_confidence": round(score * 100, 2),
            "top_categories": [],
            "needs_human_review": borderline,
            "stage2_source": "none",
            "warnings": warnings,
        }

    # ---- Stage 2: which category -----------------------------------------
    civic_confidence = round((1.0 - score) * 100, 2)
    cat = (
        _resolve_category_local(img_array)
        or _resolve_category_vision(image)
        or _resolve_category_filename(image)
    )

    if cat is None:
        cat = {
            "category": "unclassified",
            "confidence": 0.0,
            "top_categories": [],
            "needs_human_review": True,
            "source": "none",
            "warnings": [
                "No category model is installed. Train one with "
                "train_category_model.py, or set CIVIC_USE_VISION_FALLBACK=1."
            ],
        }

    info = describe(cat["category"])
    return {
        "classification": "Civic Issue",
        "is_civic": True,
        "ai_confidence": civic_confidence,
        "ai_explanation": info["explanation"],
        "recommended_actions": info["actions"],
        "assigned_department": info["department"],
        "priority_level": info["priority"],
        "category": cat["category"],
        "category_label": info.get("label", cat["category"]),
        "category_confidence": cat["confidence"],
        "top_categories": cat["top_categories"],
        "needs_human_review": bool(cat["needs_human_review"] or borderline),
        "stage2_source": cat["source"],
        "warnings": warnings + cat["warnings"],
    }


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def _print(result: dict) -> None:
    line = "=" * 60
    print(f"\n{line}")
    print(f"RESULT: {result['classification']}  ({result['ai_confidence']}%)")
    print(f"CATEGORY: {result['category_label']}  ({result['category_confidence']}%)")
    if result["needs_human_review"]:
        print("FLAG: needs human review")
    print("-" * 60)
    print("AI EXPLANATION:\n" + result["ai_explanation"])
    print("-" * 60)
    print("RECOMMENDED ACTIONS:")
    for a in result["recommended_actions"]:
        print(f"  - {a}")
    print("-" * 60)
    print("DEPARTMENT: " + result["assigned_department"])
    print("PRIORITY:   " + result["priority_level"])
    if result["top_categories"]:
        print("-" * 60)
        print("TOP CANDIDATES:")
        for t in result["top_categories"]:
            print(f"  {t['confidence']:6.2f}%  {t['label']}")
    for w in result["warnings"]:
        print(f"\n[!] {w}")
    print(line)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python predict_service.py <image path> [more images...]")
        raise SystemExit(1)
    for path in sys.argv[1:]:
        _print(classify_image(path))
