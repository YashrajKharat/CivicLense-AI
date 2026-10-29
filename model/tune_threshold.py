"""
Find the right civic / non-civic threshold for your own photographs.

The old service hard-coded 0.20, which meant any genuine complaint photo
scoring 0.25 was auto-rejected as "not a civic issue". That number should be
measured, not guessed.

Point this at two folders of real photos and it prints the score distribution
and the accuracy at every candidate threshold, so you can pick one on evidence:

    python tune_threshold.py --civic eval/civic --non-civic eval/non_civic

Then set it in your environment:

    export CIVIC_NON_CIVIC_THRESHOLD=0.48
"""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np

import predict_service

EXTS = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}


def score_folder(folder: Path) -> np.ndarray:
    model = predict_service.get_binary_model()
    files = [f for f in folder.rglob("*") if f.suffix.lower() in EXTS]
    if not files:
        raise SystemExit(f"No images found in {folder}")
    scores = []
    for f in files:
        arr = predict_service._load_image_array(f)
        scores.append(float(model.predict(arr, verbose=0)[0][0]))
    print(f"  {folder.name}: {len(files)} images scored")
    return np.array(scores)


def describe(name: str, s: np.ndarray) -> None:
    print(
        f"  {name:<12} min={s.min():.3f}  p25={np.percentile(s,25):.3f}  "
        f"median={np.median(s):.3f}  p75={np.percentile(s,75):.3f}  max={s.max():.3f}"
    )


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--civic", required=True, type=Path)
    ap.add_argument("--non-civic", required=True, type=Path)
    args = ap.parse_args()

    print("Scoring...")
    civic = score_folder(args.civic)       # should score LOW
    non_civic = score_folder(args.non_civic)  # should score HIGH

    print("\nScore distributions (1.0 = non-civic)")
    describe("civic", civic)
    describe("non-civic", non_civic)

    overlap = (civic.max() > non_civic.min())
    if overlap:
        print(
            "\n[!] The two distributions overlap. No single threshold separates "
            "them cleanly - expect some misclassification whatever you pick."
        )

    print("\nthreshold   civic kept   non-civic rejected   balanced acc")
    print("-" * 62)
    best = (0.0, -1.0)
    for t in np.arange(0.05, 1.0, 0.05):
        tpr = float((civic < t).mean())          # civic photos correctly kept
        tnr = float((non_civic >= t).mean())     # non-civic correctly rejected
        bal = (tpr + tnr) / 2
        mark = ""
        if bal > best[1]:
            best = (float(t), bal)
        print(f"  {t:.2f}      {tpr*100:6.1f}%       {tnr*100:6.1f}%          {bal*100:6.1f}%{mark}")
    print("-" * 62)
    print(f"Best balanced threshold: {best[0]:.2f}  ({best[1]*100:.1f}%)")
    print(
        "\nFor a public complaint system, prefer a threshold slightly ABOVE the "
        "balanced optimum. Wrongly rejecting a real citizen complaint costs more "
        "than passing a junk photo to a human reviewer."
    )
    print(f"\n  export CIVIC_NON_CIVIC_THRESHOLD={best[0]:.2f}")


if __name__ == "__main__":
    main()
