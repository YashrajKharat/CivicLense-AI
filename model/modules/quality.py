"""
Image Quality Assessment Module for CivicPulse AI.

Evaluates uploaded images before running heavy neural network inference:
- Blur / sharpness (Laplacian variance)
- Exposure (underexposure / overexposure)
- Contrast / dynamic range
- Resolution and aspect ratio sanity
- Compression artifact heuristics

Produces a quality score (0-100) and actionable user diagnostics.
"""

from __future__ import annotations
import io
from typing import Tuple, Dict, Any, Union
import numpy as np
from PIL import Image, ImageOps


class ImageQualityChecker:
    """Fast, deterministic image quality evaluation."""

    def __init__(
        self,
        min_width: int = 240,
        min_height: int = 240,
        min_quality_threshold: int = 35,
        blur_threshold: float = 60.0,
    ):
        self.min_width = min_width
        self.min_height = min_height
        self.min_quality_threshold = min_quality_threshold
        self.blur_threshold = blur_threshold

    def evaluate(self, image_input: Union[str, bytes, Image.Image]) -> Dict[str, Any]:
        """
        Evaluate image quality.
        Returns a structured dictionary with quality score, metrics, and diagnostics.
        """
        # Load Pillow image
        if isinstance(image_input, str):
            img = Image.open(image_input)
        elif isinstance(image_input, bytes):
            img = Image.open(io.BytesIO(image_input))
        elif isinstance(image_input, Image.Image):
            img = image_input
        else:
            raise ValueError("Unsupported image input type")

        # Auto-orient based on EXIF tag if present
        try:
            img = ImageOps.exif_transpose(img)
        except Exception:
            pass

        width, height = img.size
        resolution_str = f"{width}x{height}"

        # Convert to RGB if needed
        if img.mode != "RGB":
            img_rgb = img.convert("RGB")
        else:
            img_rgb = img

        # Downsample grayscale for fast metric computation (max 640px)
        gray = img_rgb.convert("L")
        if max(width, height) > 640:
            scale = 640.0 / max(width, height)
            gray_small = gray.resize((int(width * scale), int(height * scale)), Image.Resampling.BILINEAR)
        else:
            gray_small = gray

        gray_arr = np.asarray(gray_small, dtype=np.float32)

        # 1. Blur evaluation via discrete Laplacian filter
        laplacian_var = self._compute_laplacian_variance(gray_arr)
        blur_penalty = 0
        is_blurry = False
        if laplacian_var < self.blur_threshold:
            is_blurry = True
            blur_penalty = min(50, int((self.blur_threshold - laplacian_var) * 1.2))

        # 2. Exposure & Contrast
        mean_luminance = float(np.mean(gray_arr))
        std_luminance = float(np.std(gray_arr))

        is_dark = mean_luminance < 35.0
        is_overexposed = mean_luminance > 225.0
        is_low_contrast = std_luminance < 18.0

        exposure_penalty = 0
        if is_dark:
            exposure_penalty += min(45, int((35.0 - mean_luminance) * 1.5))
        if is_overexposed:
            exposure_penalty += min(40, int((mean_luminance - 225.0) * 1.5))
        if is_low_contrast:
            exposure_penalty += min(30, int((18.0 - std_luminance) * 2.0))

        # 3. Resolution & Aspect Ratio
        is_too_small = width < self.min_width or height < self.min_height
        aspect_ratio = max(width / max(height, 1), height / max(width, 1))
        is_extreme_aspect = aspect_ratio > 4.5

        resolution_penalty = 0
        if is_too_small:
            resolution_penalty += 40
        if is_extreme_aspect:
            resolution_penalty += 30

        # Calculate composite score (0-100)
        total_penalty = blur_penalty + exposure_penalty + resolution_penalty
        quality_score = max(5, min(100, 100 - total_penalty))

        # Diagnostics & warnings
        issues = []
        recommendations = []
        if is_too_small:
            issues.append(f"Image resolution ({resolution_str}) is below recommended {self.min_width}x{self.min_height}.")
            recommendations.append("Upload a higher-resolution photograph.")
        if is_blurry:
            issues.append("Image appears significantly blurred or out of focus.")
            recommendations.append("Hold camera steady and capture with clear focus.")
        if is_dark:
            issues.append("Image is heavily underexposed (too dark).")
            recommendations.append("Take the photo with daylight or enable camera flash.")
        if is_overexposed:
            issues.append("Image is overexposed (glare or direct sunlight washout).")
            recommendations.append("Avoid pointing camera directly into sunlight or bright headlights.")
        if is_low_contrast:
            issues.append("Image has low contrast / washed out detail.")
        if is_extreme_aspect:
            issues.append("Image has an extreme panoramic or cropped aspect ratio.")
            recommendations.append("Upload a standard photo showing the surrounding roadway context.")

        is_sufficient = quality_score >= self.min_quality_threshold

        return {
            "quality_score": int(quality_score),
            "is_sufficient": is_sufficient,
            "decision": "OK" if is_sufficient else "IMAGE_QUALITY_INSUFFICIENT",
            "resolution": resolution_str,
            "aspect_ratio": round(aspect_ratio, 2),
            "blur_metric": round(float(laplacian_var), 2),
            "mean_luminance": round(mean_luminance, 1),
            "contrast": round(std_luminance, 1),
            "issues": issues,
            "recommendations": recommendations,
        }

    @staticmethod
    def _compute_laplacian_variance(gray_arr: np.ndarray) -> float:
        """Fast 2D discrete Laplacian variance calculation."""
        # 3x3 Laplacian kernel: [[0, 1, 0], [1, -4, 1], [0, 1, 0]]
        # Vectorized interior calculation without scipy dependency
        if gray_arr.shape[0] < 3 or gray_arr.shape[1] < 3:
            return 0.0
        
        top = gray_arr[:-2, 1:-1]
        bottom = gray_arr[2:, 1:-1]
        left = gray_arr[1:-1, :-2]
        right = gray_arr[1:-1, 2:]
        center = gray_arr[1:-1, 1:-1]

        laplacian = top + bottom + left + right - 4.0 * center
        return float(np.var(laplacian))
