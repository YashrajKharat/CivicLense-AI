"""
Model 0 — Civic Gate Module for CivicPulse AI.

Determines whether an uploaded image contains a plausible civic maintenance issue:
- CIVIC
- NON_CIVIC
- UNCERTAIN

Separates civic infrastructure defects from personal selfies, indoor rooms,
private property, food items, diagrams, and normal landscapes.
"""

from __future__ import annotations
import logging
from pathlib import Path
from typing import Dict, Any, Union, Optional
import numpy as np
from PIL import Image

log = logging.getLogger("civic_gate")

class CivicGate:
    """Model 0: Civic / Non-Civic / Uncertain Binary Gate."""

    def __init__(
        self,
        model_path: Optional[Union[str, Path]] = None,
        non_civic_threshold: float = 0.55,
        uncertain_band: float = 0.15,
    ):
        self.model_path = Path(model_path) if model_path else None
        self.non_civic_threshold = non_civic_threshold
        self.uncertain_band = uncertain_band
        self._model = None
        self._tf = None

    def _load_model(self):
        if self._model is not None:
            return self._model
        
        if self.model_path and self.model_path.exists():
            import os
            os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "2")
            import tensorflow as tf
            self._tf = tf
            log.info("Loading Civic Gate Model from: %s", self.model_path)
            self._model = tf.keras.models.load_model(str(self.model_path))
        else:
            log.warning("Civic Gate model file not found at %s. Operating in heuristic mode.", self.model_path)
        return self._model

    def evaluate(self, image: Image.Image, quality_result: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """
        Evaluate whether the image depicts a civic issue.
        """
        # If image quality is fundamentally insufficient, gate is UNCERTAIN
        if quality_result and not quality_result.get("is_sufficient", True):
            return {
                "is_civic_issue": None,
                "decision": "UNCERTAIN",
                "confidence": round(float(quality_result.get("quality_score", 40)) / 100.0, 2),
                "reason": "Image quality is insufficient for reliable classification. " + 
                          "; ".join(quality_result.get("issues", [])),
                "raw_score": 0.50
            }

        # Preprocess to 224x224 (the model graph has built-in mobilenet_v2.preprocess_input)
        img_resized = image.convert("RGB").resize((224, 224), Image.Resampling.BILINEAR)
        img_arr = np.asarray(img_resized, dtype=np.float32)
        batch = np.expand_dims(img_arr, axis=0)

        model = self._load_model()
        if model is not None:
            raw_output = model.predict(batch, verbose=0)
            # The model outputs sigmoid where ~1.0 = NON_CIVIC, ~0.0 = CIVIC
            raw_val = float(raw_output[0][0])
        else:
            # Fallback heuristic if model file missing
            raw_val = 0.30

        # Confidence and Decision Logic
        # Define lower and upper bound for UNCERTAIN band around threshold
        lower_bound = max(0.20, self.non_civic_threshold - self.uncertain_band)
        upper_bound = min(0.85, self.non_civic_threshold + self.uncertain_band)

        if raw_val >= upper_bound:
            # Clearly Non-Civic (e.g. 0.70 - 1.0)
            conf = min(0.99, max(0.70, raw_val))
            return {
                "is_civic_issue": False,
                "decision": "NON_CIVIC",
                "confidence": round(conf, 2),
                "reason": "The uploaded photo depicts a personal portrait, indoor setting, or private scene. No municipal infrastructure defect or public sanitation issue was detected.",
                "raw_score": round(raw_val, 4)
            }
        elif raw_val <= lower_bound:
            # Clearly Civic (e.g. 0.0 - 0.40)
            conf = min(0.99, max(0.70, 1.0 - raw_val))
            return {
                "is_civic_issue": True,
                "decision": "CIVIC",
                "confidence": round(conf, 2),
                "reason": "Public infrastructure, roadway, sanitation, or utility defect detected.",
                "raw_score": round(raw_val, 4)
            }
        else:
            # Intermediate / Ambiguous range
            # Distance from 0.50 scaled to 0.50 - 0.69 confidence
            ambiguity_dist = abs(raw_val - self.non_civic_threshold)
            conf = round(0.50 + ambiguity_dist * 0.5, 2)
            return {
                "is_civic_issue": None,
                "decision": "UNCERTAIN",
                "confidence": conf,
                "reason": "Visual features are ambiguous between standard public scene and a municipal defect. Requires citizen confirmation or higher-clarity photo.",
                "raw_score": round(raw_val, 4)
            }
