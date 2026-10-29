"""
Central configuration for the CivicPulse AI image service.

Everything here can be overridden with environment variables, so you can tune
the model's behaviour in production without touching code.
"""

import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
MODELS_DIR = BASE_DIR / "models"

# Stage 1 - binary civic / non-civic gate (this is the model you already have)
BINARY_MODEL_PATH = MODELS_DIR / "civic_non_civic_model.keras"

# Stage 2 - multi-class category model. Created by train_category_model.py.
# If this file does not exist the service falls back to the vision API (if
# configured) and otherwise honestly reports "unclassified".
CATEGORY_MODEL_PATH = MODELS_DIR / "category_model.keras"
CATEGORY_LABELS_PATH = MODELS_DIR / "category_labels.json"

IMAGE_SIZE = (224, 224)


def _f(name, default):
    try:
        return float(os.environ.get(name, default))
    except (TypeError, ValueError):
        return float(default)


# --- Stage 1 thresholds -----------------------------------------------------
# The binary model outputs a sigmoid score where 1.0 = NON-civic.
# Anything at or above this value is rejected as non-civic.
#
# The old service used 0.20, which rejected a large number of genuine civic
# photos (any real complaint scoring 0.25 was thrown out). 0.55 is a much
# safer default for a public-facing complaint system: it is better to send a
# borderline photo to a human than to auto-reject a real citizen complaint.
NON_CIVIC_THRESHOLD = _f("CIVIC_NON_CIVIC_THRESHOLD", 0.45)

# Scores inside this band around the threshold are flagged for human review
# instead of being trusted outright.
UNCERTAIN_BAND = _f("CIVIC_UNCERTAIN_BAND", 0.15)

# --- Stage 2 thresholds -----------------------------------------------------
# Minimum softmax confidence before we name a specific category.
CATEGORY_MIN_CONFIDENCE = _f("CIVIC_CATEGORY_MIN_CONFIDENCE", 0.45)

# If the top two predictions are closer together than this, and they belong to
# the same confusable group, we report the group instead of guessing.
CATEGORY_MARGIN = _f("CIVIC_CATEGORY_MARGIN", 0.15)

# --- Optional vision-API fallback ------------------------------------------
# When the local category model is missing or unsure, optionally ask Claude to
# name the category. Set ANTHROPIC_API_KEY and CIVIC_USE_VISION_FALLBACK=1.
USE_VISION_FALLBACK = os.environ.get("CIVIC_USE_VISION_FALLBACK", "0") == "1"
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
VISION_MODEL = os.environ.get("CIVIC_VISION_MODEL", "claude-sonnet-4-6")

# Never enable this in production. It was the old service's only way of
# picking a category and it is why unrelated photos came back labelled
# "illegal dumping".
ALLOW_FILENAME_HINTS = os.environ.get("CIVIC_ALLOW_FILENAME_HINTS", "0") == "1"
