"""
Hierarchical Category Classification Module for CivicPulse AI.

Implements Level 2 (Domain) and Level 3 (Category & Subcategory) classification.
Uses the fine-tuned 14-class category model (category_model.keras) backed by
centroid similarity for sub-class resolution within merged groups.
"""

from __future__ import annotations
import json
import logging
from pathlib import Path
from typing import Dict, Any, List, Optional, Tuple, Union
import numpy as np
from PIL import Image

try:
    from .taxonomy import TAXONOMY, get_category, DOMAINS
except (ImportError, ValueError):
    from modules.taxonomy import TAXONOMY, get_category, DOMAINS

log = logging.getLogger("classifier")

SYNONYMS = {
    "road_surface_damage": "pothole",
    "pothole": "pothole",
    "road_crack": "road_crack",
    "waste_accumulation": "garbage_overflow",
    "water_related_issue": "water_leakage",
    "electrical_hazard": "broken_streetlight",
    "broken streetlight": "broken_streetlight",
    "damaged electrical  pole": "damaged_pole",
    "damaged electrical pole": "damaged_pole",
    "exposed wire": "exposed_wire",
    "broken_footpath": "broken_footpath",
    "broken footpath": "broken_footpath",
    "open_manhole": "open_manhole",
    "open manhole": "open_manhole",
    "blocked drain": "open_manhole",
    "broken pipeline": "broken_pipeline",
    "water leakage": "water_leakage",
    "damaged traffic signal": "damaged_traffic_signal",
    "unhygenic_food_stall": "unhygienic_food_stall",
    "damaged_park_equipment": "damaged_park_equipment",
    "pan_stains": "pan_stains",
    "spitting": "pan_stains",
    "paan_stains": "pan_stains",
    "spitting_/_pan_stains": "pan_stains",
    "spitting_/_paan_stains": "pan_stains",
    "defaced_wall": "defaced_wall",
    "defaced wall": "defaced_wall",
    "defaced_wall_or_property": "defaced_wall",
}

class HierarchicalClassifier:
    def __init__(
        self,
        model_path: Optional[Union[str, Path]] = None,
        labels_path: Optional[Union[str, Path]] = None,
        centroids_path: Optional[Union[str, Path]] = None,
        min_confidence: float = 0.40,
    ):
        base_models_dir = Path(__file__).resolve().parent.parent / "models"
        self.model_path = Path(model_path) if model_path else (base_models_dir / "category_model.keras")
        self.labels_path = Path(labels_path) if labels_path else (base_models_dir / "category_labels.json")
        self.centroids_path = Path(centroids_path) if centroids_path else (base_models_dir / "civic_category_centroids.npy")
        self.min_confidence = min_confidence

        self._category_model = None
        self._labels: List[str] = []
        self._merged_groups: Dict[str, List[str]] = {}
        self._centroids: Optional[Dict[str, np.ndarray]] = None
        self._feature_extractor = None
        self._tf = None

    def _ensure_loaded(self):
        if self._feature_extractor is not None:
            return

        import os
        os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "2")
        import tensorflow as tf
        self._tf = tf

        if self.labels_path and self.labels_path.exists():
            try:
                with open(self.labels_path, "r", encoding="utf-8") as f:
                    meta = json.load(f)
                    self._labels = meta.get("labels", [])
                    self._merged_groups = meta.get("merged_groups", {})
            except Exception as e:
                log.warning("Could not load category labels: %s", e)

        if self.model_path and self.model_path.exists():
            try:
                log.info("Loading Category Neural Network from %s", self.model_path)
                self._category_model = tf.keras.models.load_model(str(self.model_path))
            except Exception as e:
                log.warning("Could not load category model: %s", e)

        if self.centroids_path and self.centroids_path.exists():
            try:
                self._centroids = np.load(str(self.centroids_path), allow_pickle=True).item()
            except Exception as e:
                log.warning("Could not load centroids file: %s", e)

        self._feature_extractor = tf.keras.applications.MobileNetV2(
            input_shape=(224, 224, 3),
            include_top=False,
            pooling="avg",
            weights="imagenet",
        )

    def extract_embedding(self, image: Image.Image) -> np.ndarray:
        self._ensure_loaded()
        img_resized = image.convert("RGB").resize((224, 224), Image.Resampling.BILINEAR)
        arr = np.asarray(img_resized, dtype=np.float32)
        batch = np.expand_dims(arr, axis=0)
        preprocessed = self._tf.keras.applications.mobilenet_v2.preprocess_input(batch.copy())
        features = self._feature_extractor.predict(preprocessed, verbose=0)[0]
        norm = np.linalg.norm(features)
        if norm > 1e-7:
            features = features / norm
        return features

    def _detect_pan_stains(self, image: Image.Image, features: np.ndarray) -> Dict[str, Any]:
        try:
            img_rgb = image.convert("RGB")
            arr = np.asarray(img_rgb, dtype=np.float32)
            r, g, b = arr[:, :, 0], arr[:, :, 1], arr[:, :, 2]

            stain_mask = (r > 90) & (r > g * 1.30) & (r > b * 1.35) & (r - g > 25) & (r - b > 30) & ((g + b) < 320)
            ratio = float(np.mean(stain_mask))

            sim_pan = 0.0
            sim_defaced = 0.0
            if self._centroids:
                if "pan_stains" in self._centroids:
                    p_vec = self._centroids["pan_stains"]
                    sim_pan = float(np.dot(features, p_vec / (np.linalg.norm(p_vec) + 1e-7)))
                if "defaced_wall" in self._centroids:
                    d_vec = self._centroids["defaced_wall"]
                    sim_defaced = float(np.dot(features, d_vec / (np.linalg.norm(d_vec) + 1e-7)))

            is_detected = (
                (ratio >= 0.04 and (sim_pan > 0.35 or sim_defaced > 0.35))
                or (sim_pan >= 0.72)
            )

            conf = min(0.95, max(0.65, 0.60 + ratio * 3.0 + max(sim_pan, sim_defaced) * 0.3))
            return {
                "detected": is_detected,
                "ratio": ratio,
                "confidence": conf,
                "sim_pan": sim_pan,
                "sim_defaced": sim_defaced,
            }
        except Exception as e:
            log.warning("Paan stain detection check encountered an error: %s", e)
            return {"detected": False, "ratio": 0.0, "confidence": 0.50, "sim_pan": 0.0, "sim_defaced": 0.0}

    def _resolve_subclass(self, super_cat: str, feat: np.ndarray, pan_detected: bool = False) -> str:
        if pan_detected and super_cat in ("waste_accumulation", "public_toilet_unusable"):
            return "pan_stains"

        if not self._centroids or super_cat not in self._merged_groups:
            return SYNONYMS.get(super_cat, super_cat)

        sub_classes = self._merged_groups[super_cat]
        best_sub = sub_classes[0]
        best_sim = -1.0

        for sub in sub_classes:
            canonical_sub = SYNONYMS.get(sub, sub)
            for c_name, c_vec in self._centroids.items():
                norm_c_name = c_name.strip().lower().replace(" ", "_")
                mapped_c_name = SYNONYMS.get(norm_c_name, norm_c_name)
                if mapped_c_name == canonical_sub or canonical_sub in mapped_c_name:
                    c_norm = c_vec / (np.linalg.norm(c_vec) + 1e-7)
                    sim = float(np.dot(feat, c_norm))
                    if sim > best_sim:
                        best_sim = sim
                        best_sub = canonical_sub

        return best_sub

    def classify(self, image: Image.Image) -> Dict[str, Any]:
        self._ensure_loaded()
        features = self.extract_embedding(image)

        img_resized = image.convert("RGB").resize((224, 224), Image.Resampling.BILINEAR)
        arr = np.expand_dims(np.asarray(img_resized, dtype=np.float32), axis=0)

        best_code = "pothole"
        best_conf = 0.50
        top_candidates = []

        # 1. Check for distinctive paan stain / defacement visual signature
        pan_info = self._detect_pan_stains(image, features)
        if pan_info["detected"]:
            best_code = "defaced_wall" if pan_info["sim_defaced"] > pan_info["sim_pan"] + 0.15 else "pan_stains"
            best_conf = pan_info["confidence"]
            cat_obj = get_category(best_code)
            if cat_obj:
                top_candidates.append({
                    "category": cat_obj["name"],
                    "code": best_code,
                    "domain": cat_obj["domain"],
                    "confidence": round(best_conf, 2),
                })
        elif self._category_model is not None and self._labels:
            raw_preds = self._category_model.predict(arr, verbose=0)[0]
            ranked_indices = np.argsort(raw_preds)[::-1]

            top_super_class = self._labels[ranked_indices[0]]
            top_prob = float(raw_preds[ranked_indices[0]])

            if top_super_class == "damaged_traffic_signal" and top_prob < 0.65:
                if len(ranked_indices) > 1 and raw_preds[ranked_indices[1]] >= 0.20:
                    top_super_class = self._labels[ranked_indices[1]]
                    top_prob = float(raw_preds[ranked_indices[1]])
                else:
                    top_super_class = "road_surface_damage"
                    top_prob = 0.35

            best_code = self._resolve_subclass(top_super_class, features, pan_detected=False)
            best_conf = top_prob

            seen_codes = set()
            for idx in ranked_indices[:5]:
                super_name = self._labels[idx]
                prob = float(raw_preds[idx])
                code = self._resolve_subclass(super_name, features, pan_detected=False)
                if code in seen_codes:
                    continue
                seen_codes.add(code)
                cat_obj = get_category(code)
                if cat_obj:
                    top_candidates.append({
                        "category": cat_obj["name"],
                        "code": code,
                        "domain": cat_obj["domain"],
                        "confidence": round(prob, 2),
                    })
        elif self._centroids:
            sims = {}
            for raw_name, center_vec in self._centroids.items():
                c_norm = center_vec / (np.linalg.norm(center_vec) + 1e-7)
                sim = float(np.dot(features, c_norm))
                cleaned_key = raw_name.strip().lower().replace(" ", "_")
                canonical_code = SYNONYMS.get(cleaned_key, cleaned_key)
                if canonical_code in TAXONOMY:
                    sims[canonical_code] = max(sims.get(canonical_code, -1.0), sim)

            if sims:
                sorted_sims = sorted(sims.items(), key=lambda x: x[1], reverse=True)
                best_code, raw_sim = sorted_sims[0]
                best_conf = max(0.35, min(0.95, (raw_sim - 0.20) / 0.65))
                for code, sim in sorted_sims[:5]:
                    cat_obj = get_category(code)
                    if cat_obj:
                        top_candidates.append({
                            "category": cat_obj["name"],
                            "code": code,
                            "domain": cat_obj["domain"],
                            "confidence": round(max(0.20, min(0.95, (sim - 0.20) / 0.65)), 2)
                        })

        cat_info = get_category(best_code) or TAXONOMY["other"]

        if best_conf < self.min_confidence:
            category_name = "Other"
            domain_name = "Other"
            subcategory_name = "Unclassified Civic Issue"
            category_code = "other"
            confidence = round(best_conf, 2)
        else:
            category_name = cat_info["name"]
            domain_name = cat_info["domain"]
            subcategory_name = cat_info["subcategories"][0] if cat_info.get("subcategories") else category_name
            category_code = cat_info["code"]
            confidence = round(best_conf, 2)

        return {
            "department": cat_info["department"],
            "domain": domain_name,
            "category": category_name,
            "category_code": category_code,
            "subcategory": subcategory_name,
            "confidence": confidence,
            "top_candidates": top_candidates,
            "visually_determinable": cat_info.get("visually_determinable", True),
            "embedding": features,
        }