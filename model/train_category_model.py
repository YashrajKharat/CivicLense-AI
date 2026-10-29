"""
Train the Stage-2 category model.

This is the model that was missing. Your existing model only answers
"civic or not"; this one answers "which of the 22 civic categories", which is
what the dashboard actually needs.

Dataset layout - one folder per category, named with the exact slug used in
knowledge_base.py:

    dataset/
      pothole/            img001.jpg ...
      garbage_overflow/   ...
      open_manhole/       ...
      water_leakage/      ...

Run:

    python train_category_model.py --data dataset
    python train_category_model.py --data dataset --min-images 15 --merge-groups
    python train_category_model.py --data dataset --epochs 30 --fine-tune-epochs 15

Outputs models/category_model.keras and models/category_labels.json, which
predict_service.py picks up automatically on the next restart.

Notes on your current situation
-------------------------------
* Classes with only a handful of images cannot be learned. --min-images (default 12)
  drops them from training rather than letting them poison the other classes.
  Anything dropped is listed at the end so you know what to photograph next.
* water_leakage / damp_or_seepage / flooding / contaminated_water genuinely
  overlap in photographs. --merge-groups trains them as one "water_related_issue"
  class, which is far more accurate than four weak ones. You can split them back
  out later once each has 40+ images.
* Class weighting is always on, so a category with 20 images is not drowned out
  by one with 200.
"""

from __future__ import annotations

import argparse
import json
import math
from collections import Counter
from pathlib import Path

import numpy as np
import tensorflow as tf

import config
from knowledge_base import CONFUSABLE_GROUPS, group_of

AUTOTUNE = tf.data.AUTOTUNE


def build_file_list(data_dir: Path, min_images: int, merge_groups: bool):
    """Scan the dataset folder, apply merging and the minimum-count filter."""
    exts = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}
    raw: dict[str, list[Path]] = {}
    for folder in sorted(p for p in data_dir.iterdir() if p.is_dir()):
        files = [f for f in folder.rglob("*") if f.suffix.lower() in exts]
        if files:
            raw[folder.name] = files

    if not raw:
        raise SystemExit(f"No image folders found under {data_dir}")

    counts = {k: len(v) for k, v in raw.items()}
    mapped: dict[str, list[Path]] = {}
    merged_note: dict[str, str] = {}

    for name, files in raw.items():
        target = name
        if merge_groups:
            g = group_of(name)
            if g:
                target = g
                merged_note[name] = g
        mapped.setdefault(target, []).extend(files)

    dropped = {k: len(v) for k, v in mapped.items() if len(v) < min_images}
    kept = {k: v for k, v in mapped.items() if len(v) >= min_images}

    if len(kept) < 2:
        raise SystemExit(
            "Fewer than two usable classes after filtering. Lower --min-images "
            "or add more photographs."
        )

    return kept, counts, dropped, merged_note


def make_datasets(kept: dict[str, list[Path]], val_split: float, batch: int, seed: int):
    labels = sorted(kept.keys())
    index = {name: i for i, name in enumerate(labels)}

    paths, ys = [], []
    for name, files in kept.items():
        for f in files:
            paths.append(str(f))
            ys.append(index[name])

    paths_arr = np.array(paths)
    ys_arr = np.array(ys)

    # Stratified split so every class appears in both train and validation.
    rng = np.random.default_rng(seed)
    tr_idx, va_idx = [], []
    for c in range(len(labels)):
        idx = np.where(ys_arr == c)[0]
        rng.shuffle(idx)
        n_val = max(1, int(round(len(idx) * val_split)))
        va_idx.extend(idx[:n_val])
        tr_idx.extend(idx[n_val:])
    rng.shuffle(tr_idx)
    rng.shuffle(va_idx)

    def decode(path, label):
        img = tf.io.decode_image(
            tf.io.read_file(path), channels=3, expand_animations=False
        )
        img = tf.image.resize(img, config.IMAGE_SIZE)
        img = tf.cast(img, tf.float32)  # stays in 0-255; the model normalises
        return img, label

    def build(idx, shuffle):
        ds = tf.data.Dataset.from_tensor_slices((paths_arr[idx], ys_arr[idx]))
        if shuffle:
            ds = ds.shuffle(min(len(idx), 2048), seed=seed, reshuffle_each_iteration=True)
        return ds.map(decode, num_parallel_calls=AUTOTUNE).batch(batch).prefetch(AUTOTUNE)

    return labels, build(tr_idx, True), build(va_idx, False), ys_arr[tr_idx]


def build_model(n_classes: int, dropout: float = 0.35):
    inputs = tf.keras.Input(shape=(*config.IMAGE_SIZE, 3))

    augment = tf.keras.Sequential(
        [
            tf.keras.layers.RandomFlip("horizontal"),
            tf.keras.layers.RandomRotation(0.12),
            tf.keras.layers.RandomZoom(0.15),
            tf.keras.layers.RandomTranslation(0.1, 0.1),
            tf.keras.layers.RandomContrast(0.2),
            tf.keras.layers.RandomBrightness(0.2, value_range=(0, 255)),
        ],
        name="augmentation",
    )

    x = augment(inputs)
    x = tf.keras.layers.Rescaling(1.0 / 127.5, offset=-1.0)(x)

    # The ImageNet weights are taken from the binary model rather than
    # downloaded. They are the same weights it was itself built on, and this
    # works on a machine with no internet — which matters, because running the
    # classifier locally is the whole reason this exists.
    base = None
    if config.BINARY_MODEL_PATH.exists():
        try:
            donor = tf.keras.models.load_model(config.BINARY_MODEL_PATH, compile=False)
            base = next(
                (l for l in donor.layers if l.__class__.__name__ == "Functional"), None
            )
            if base is not None:
                print(f"reusing the MobileNetV2 backbone from {config.BINARY_MODEL_PATH.name}")
        except Exception:
            base = None

    if base is None:
        base = tf.keras.applications.MobileNetV2(
            input_shape=(*config.IMAGE_SIZE, 3), include_top=False, weights="imagenet"
        )
    base.trainable = False

    x = base(x, training=False)
    x = tf.keras.layers.GlobalAveragePooling2D()(x)
    x = tf.keras.layers.Dropout(dropout)(x)
    x = tf.keras.layers.Dense(256, activation="relu")(x)
    x = tf.keras.layers.Dropout(dropout)(x)
    outputs = tf.keras.layers.Dense(n_classes, activation="softmax")(x)

    return tf.keras.Model(inputs, outputs), base


def class_weights(y_train, n_classes):
    counts = Counter(y_train.tolist())
    total = len(y_train)
    # Square-root balancing: corrects imbalance without over-amplifying a class
    # that only has ten photographs.
    weights = {}
    for c in range(n_classes):
        n = counts.get(c, 1)
        weights[c] = math.sqrt(total / (n_classes * n))
    return weights


def confusion_report(model, val_ds, labels):
    y_true, y_pred = [], []
    for xb, yb in val_ds:
        p = model.predict(xb, verbose=0)
        y_true.extend(yb.numpy().tolist())
        y_pred.extend(np.argmax(p, axis=1).tolist())

    n = len(labels)
    cm = np.zeros((n, n), dtype=int)
    for t, p in zip(y_true, y_pred):
        cm[t][p] += 1

    print("\nPer-class validation accuracy")
    print("-" * 62)
    weak = []
    for i, name in enumerate(labels):
        support = cm[i].sum()
        acc = cm[i][i] / support if support else 0.0
        confused_with = ""
        if support:
            off = [(cm[i][j], labels[j]) for j in range(n) if j != i and cm[i][j]]
            if off:
                off.sort(reverse=True)
                confused_with = f"  (most often read as {off[0][1]})"
        flag = "  <-- weak" if acc < 0.6 and support else ""
        print(f"  {name:<28} {acc*100:5.1f}%  n={support:<4}{flag}{confused_with}")
        if acc < 0.6 and support:
            weak.append(name)
    print("-" * 62)
    if weak:
        print("Weak classes needing more photographs: " + ", ".join(weak))
    return cm


def main():
    ap = argparse.ArgumentParser(description="Train the CivicPulse category model")
    ap.add_argument("--data", default="dataset", help="dataset root folder")
    ap.add_argument("--epochs", type=int, default=25, help="frozen-backbone epochs")
    ap.add_argument("--fine-tune-epochs", type=int, default=12)
    ap.add_argument("--batch", type=int, default=16)
    ap.add_argument("--val-split", type=float, default=0.2)
    ap.add_argument("--min-images", type=int, default=12)
    ap.add_argument(
        "--merge-groups",
        action="store_true",
        help="train visually similar classes as one group (recommended while "
        "the weak classes are still small)",
    )
    ap.add_argument("--seed", type=int, default=1337)
    args = ap.parse_args()

    tf.keras.utils.set_random_seed(args.seed)

    kept, counts, dropped, merged = build_file_list(
        Path(args.data), args.min_images, args.merge_groups
    )

    print("Dataset")
    print("-" * 62)
    for name in sorted(counts):
        note = f" -> merged into {merged[name]}" if name in merged else ""
        print(f"  {name:<28} {counts[name]:>4} images{note}")
    if dropped:
        print("\nDropped (below --min-images):")
        for name, n in sorted(dropped.items()):
            print(f"  {name:<28} {n:>4} images - need {args.min_images - n} more")

    labels, train_ds, val_ds, y_train = make_datasets(
        kept, args.val_split, args.batch, args.seed
    )
    print(f"\nTraining {len(labels)} classes on {len(y_train)} images.\n")

    model, base = build_model(len(labels))
    weights = class_weights(y_train, len(labels))

    ckpt = config.MODELS_DIR / "category_model.keras"
    config.MODELS_DIR.mkdir(parents=True, exist_ok=True)

    callbacks = [
        tf.keras.callbacks.EarlyStopping(
            monitor="val_accuracy", patience=6, restore_best_weights=True
        ),
        tf.keras.callbacks.ReduceLROnPlateau(
            monitor="val_loss", factor=0.5, patience=3, min_lr=1e-6
        ),
    ]

    model.compile(
        optimizer=tf.keras.optimizers.Adam(1e-3),
        loss="sparse_categorical_crossentropy",
        metrics=["accuracy"],
    )

    print("Phase 1 - frozen backbone")
    model.fit(
        train_ds,
        validation_data=val_ds,
        epochs=args.epochs,
        class_weight=weights,
        callbacks=callbacks,
    )

    if args.fine_tune_epochs > 0:
        print("\nPhase 2 - fine-tuning the top of MobileNetV2")
        base.trainable = True
        for layer in base.layers[:-40]:
            layer.trainable = False
        # BatchNorm must stay frozen when fine-tuning on a small dataset.
        for layer in base.layers:
            if isinstance(layer, tf.keras.layers.BatchNormalization):
                layer.trainable = False
        model.compile(
            optimizer=tf.keras.optimizers.Adam(1e-5),
            loss="sparse_categorical_crossentropy",
            metrics=["accuracy"],
        )
        model.fit(
            train_ds,
            validation_data=val_ds,
            epochs=args.fine_tune_epochs,
            class_weight=weights,
            callbacks=callbacks,
        )

    model.save(ckpt)
    (config.MODELS_DIR / "category_labels.json").write_text(
        json.dumps(
            {
                "labels": labels,
                "merged_groups": {
                    g: CONFUSABLE_GROUPS[g]["members"]
                    for g in labels
                    if g in CONFUSABLE_GROUPS
                },
                "dropped_classes": dropped,
            },
            indent=2,
        ),
        encoding="utf-8",
    )

    confusion_report(model, val_ds, labels)
    print(f"\nSaved {ckpt}")
    print("Restart your backend - predict_service.py will pick it up automatically.")


if __name__ == "__main__":
    main()
