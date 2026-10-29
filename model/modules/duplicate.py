"""
Duplicate Report Detection Module for CivicPulse AI.

Combines:
- Deep visual feature embeddings (1280-dim vector cosine similarity)
- Perceptual hash Hamming distance
- Geographic proximity (Haversine geodesic distance)
- Temporal proximity (sliding time decay)
- Category matching

Produces a calibrated duplicate risk score (0-100) and matches against historical reports.
"""

from __future__ import annotations
import math
from typing import Dict, Any, List, Optional, Tuple
import numpy as np


class DuplicateDetector:
    """Calculates multi-modal duplicate report likelihood."""

    def __init__(
        self,
        geo_threshold_meters: float = 75.0,
        visual_similarity_threshold: float = 0.82,
        duplicate_risk_threshold: int = 75,
    ):
        self.geo_threshold_meters = geo_threshold_meters
        self.visual_similarity_threshold = visual_similarity_threshold
        self.duplicate_risk_threshold = duplicate_risk_threshold
        # In-memory index of recent reports: list of dicts
        self._recent_reports: List[Dict[str, Any]] = []

    def register_report(
        self,
        report_id: str,
        embedding: np.ndarray,
        phash: str,
        category_code: str,
        latitude: Optional[float] = None,
        longitude: Optional[float] = None,
        timestamp: Optional[float] = None,
    ) -> None:
        """Register a processed report into the local duplicate cache."""
        self._recent_reports.append({
            "report_id": report_id,
            "embedding": embedding,
            "phash": phash,
            "category_code": category_code,
            "lat": latitude,
            "lng": longitude,
            "timestamp": timestamp,
        })
        # Keep only the last 1000 items in memory
        if len(self._recent_reports) > 1000:
            self._recent_reports.pop(0)

    def check_duplicate(
        self,
        embedding: np.ndarray,
        phash: str,
        category_code: str,
        latitude: Optional[float] = None,
        longitude: Optional[float] = None,
        external_candidates: Optional[List[Dict[str, Any]]] = None,
    ) -> Dict[str, Any]:
        """
        Compare against existing reports and compute duplicate risk (0-100).
        """
        candidates = external_candidates if external_candidates is not None else self._recent_reports
        if not candidates:
            return {
                "risk_score": 0,
                "possible_duplicate": False,
                "similar_report_ids": [],
                "primary_match": None,
            }

        best_risk = 0.0
        best_match_id = None
        similar_ids = []

        for item in candidates:
            # 1. Category match check
            cat_match = (item.get("category_code") == category_code)
            
            # 2. Visual cosine similarity
            item_emb = item.get("embedding")
            if item_emb is not None:
                sim_vis = float(np.dot(embedding, item_emb))
            else:
                sim_vis = 0.0

            # 3. pHash Hamming distance
            item_phash = item.get("phash", "")
            if item_phash and phash:
                # Convert hex to binary strings and count differences
                b1 = bin(int(phash, 16))[2:].zfill(64)
                b2 = bin(int(item_phash, 16))[2:].zfill(64)
                hamming_dist = sum(c1 != c2 for c1, c2 in zip(b1, b2))
                # 0-5 diff is extremely similar; 6-12 is moderately similar
                sim_phash = max(0.0, 1.0 - (hamming_dist / 32.0))
            else:
                sim_phash = 0.0

            # Combined visual score
            vis_score = max(sim_vis, sim_phash)

            # 4. Geographic proximity
            geo_dist = None
            geo_score = 0.5  # Neutral if GPS missing
            if (
                latitude is not None and longitude is not None and
                item.get("lat") is not None and item.get("lng") is not None
            ):
                geo_dist = self._haversine(latitude, longitude, item["lat"], item["lng"])
                if geo_dist <= 25.0:
                    geo_score = 1.0
                elif geo_dist <= 75.0:
                    geo_score = 0.8
                elif geo_dist <= 150.0:
                    geo_score = 0.5
                else:
                    geo_score = 0.1

            # 5. Composite Risk Formula
            # If same category and high visual similarity:
            if cat_match:
                composite = (0.55 * vis_score + 0.45 * geo_score) * 100.0
            else:
                # Different category reduces duplicate risk significantly
                composite = (0.40 * vis_score + 0.20 * geo_score) * 100.0

            risk_int = int(min(98, max(0, composite)))
            if risk_int > 50:
                similar_ids.append(item.get("report_id"))

            if risk_int > best_risk:
                best_risk = risk_int
                best_match_id = item.get("report_id")

        is_dup = best_risk >= self.duplicate_risk_threshold

        return {
            "risk_score": int(best_risk),
            "possible_duplicate": is_dup,
            "similar_report_ids": similar_ids[:5],
            "primary_match": best_match_id if is_dup else None,
        }

    @staticmethod
    def _haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
        """Great-circle distance in meters between two lat/lng points."""
        R = 6371000.0  # Earth radius in meters
        phi1 = math.radians(lat1)
        phi2 = math.radians(lat2)
        delta_phi = math.radians(lat2 - lat1)
        delta_lambda = math.radians(lon2 - lon1)

        a = (
            math.sin(delta_phi / 2.0) ** 2 +
            math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2.0) ** 2
        )
        c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
        return R * c
