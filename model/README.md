# CivicPulse AI — image classification service

Updated package. Read "What was wrong" first — it explains why the old build
returned the wrong issue for almost every real upload.

---

## What was wrong

**1. The model never predicted a category. The filename did.**

Your `civic_non_civic_model.keras` is a MobileNetV2 with a **single sigmoid
output**. It can only answer "civic or not". It has no idea what a pothole is.

The old `predict_service.py` picked the category like this:

```python
p_str = str(image_path).lower()
for cat_name, info in CIVIC_KNOWLEDGE_BASE.items():
    if cat_name.lower() in p_str:      # <-- searches the FILE NAME
        matched = info
```

That works when you test with `dataset/pothole/img12.jpg`. A citizen uploads
`IMG_2033.jpg`, nothing matches, and every single civic photo silently falls
back to `DEFAULT_CIVIC` — the "waste scattered beside a roadside drainage area"
text. That is the wrong-detection bug. It was never a model accuracy problem;
the model was not being asked.

**2. The threshold was set to 0.20.**

`score >= 0.20 → non-civic`. Any genuine complaint photo scoring 0.25 was
auto-rejected. On a public grievance system that means real citizen complaints
were being thrown away. Default is now `0.55`, and `tune_threshold.py` lets you
measure the right value on your own photos instead of guessing.

**3. `requirements.txt` was unpinned.**

`tensorflow>=2.15.0` resolves to anything from TF 2.15 (Keras 2) upward. Your
model file was written by **Keras 3.15.1** — a Keras 2 install cannot
deserialise it, and a mismatched numpy build throws ABI errors on import. Now
pinned to the exact stack the model was saved with (TF 2.21.0 / Keras 3.15.1 /
numpy 2.4.4, verified working).

---

## What's in the package

| File | Purpose |
|---|---|
| `predict_service.py` | Two-stage classifier. Same public API as before, plus category fields. |
| `knowledge_base.py` | All 22 categories, departments, priorities, and the confusable groups. |
| `config.py` | Every threshold, overridable by environment variable. |
| `train_category_model.py` | **Trains the missing category model** on your dataset. |
| `tune_threshold.py` | Measures the correct civic/non-civic threshold from labelled folders. |
| `server.py` | Optional Flask microservice so your backend never imports TensorFlow. |
| `models/civic_non_civic_model.keras` | Your existing Stage-1 model, unchanged. |

---

## Setup

```bash
pip install -r requirements.txt
python predict_service.py test_images/sample.jpg
```

Python 3.10–3.12. TensorFlow does not support 3.13 yet.

---

## Using it in your backend

The old two-line call still works exactly as before:

```python
import predict_service

result = predict_service.classify_image("uploaded.jpg")
result["classification"]        # "Civic Issue" / "Non-Civic Issue"
result["ai_confidence"]         # 97.7
result["assigned_department"]
result["priority_level"]
```

New fields you should use in the dashboard:

```python
result["category"]              # "pothole" | "water_related_issue" | "unclassified"
result["category_label"]        # "Pothole"
result["category_confidence"]   # 82.4
result["top_categories"]        # top 3 with confidences — show these to the officer
result["needs_human_review"]    # True → route to triage instead of auto-assigning
result["warnings"]              # why it was unsure, in plain English
```

You can now pass **raw bytes**, so a Flask/Django view doesn't need a temp file:

```python
result = predict_service.classify_image(request.files["photo"].read())
```

Call `predict_service.warmup()` once at startup so the first citizen upload
isn't the one that pays the model-loading cost.

---

## Training the category model (this is the "trained model" you need)

I can't train it for you — that needs your photo dataset, which wasn't in the
zip. The script does the whole job:

```
dataset/
  pothole/            img001.jpg ...
  garbage_overflow/   ...
  water_leakage/      ...
```

Folder names must be the exact slugs from `knowledge_base.py`.

```bash
# recommended for your current dataset size
python train_category_model.py --data dataset --merge-groups

# once every class has 40+ images
python train_category_model.py --data dataset --epochs 30 --fine-tune-epochs 15
```

It writes `models/category_model.keras` + `models/category_labels.json`, and
`predict_service.py` picks them up on the next restart. No code changes.

### How it handles your specific problems

**The 41% water_leakage problem.** water_leakage, damp_or_seepage, flooding and
contaminated_water look nearly identical in a photograph — that is a real
signal, not a bug. `--merge-groups` trains them as one `water_related_issue`
class. One strong class beats four weak ones, and the ticket still routes to
the water department. Split them out later when each has enough images.

At inference, even with separate classes, if the top two predictions are close
**and** in the same confusable family, the service reports the family and sets
`needs_human_review`. It will not hand an officer a confident 41% guess.

**road_crack with 2 images.** `--min-images` (default 12) drops classes that are
too small to learn instead of letting them contaminate the others. Dropped
classes are printed at the end with exactly how many more photos each needs.
With `--merge-groups`, road_crack is rescued into `road_surface_damage` along
with pothole and broken_footpath rather than being dropped.

**Imbalance.** Square-root class weighting is always on, so a 20-image class
isn't drowned out by a 200-image one, without over-amplifying it either.

Training also prints a per-class validation report showing which class each
weak one is being confused with — that tells you what to photograph next.

---

## Getting correct categories today, before training

Set two environment variables and the service asks a vision model to name the
category when the local model can't:

```bash
export CIVIC_USE_VISION_FALLBACK=1
export ANTHROPIC_API_KEY=sk-ant-...
```

It only fires when the local model is missing or unsure, so it costs nothing
once you've trained. Good enough to demo the full pipeline at a viva or
hackathon while the dataset is still being collected.

---

## Tuning the threshold

```bash
python tune_threshold.py --civic eval/civic --non-civic eval/non_civic
export CIVIC_NON_CIVIC_THRESHOLD=0.48
```

It prints the score distributions and accuracy at every threshold, and warns
you if the two distributions overlap (in which case no threshold separates
them cleanly and you need better non-civic training data).

---

## Running as a service

```bash
python server.py                                             # dev
gunicorn -w 1 -k gthread --threads 4 -b 0.0.0.0:8000 server:app   # prod
```

```
GET  /health     → which models are loaded, current threshold
POST /classify   → multipart "image", or JSON {"image_base64": "..."}
```

Keep workers at 1 unless you have RAM to spare — each worker loads its own copy
of the models.

---

## Honest limits

- Stage 1 is unchanged, and it is not great. Random noise scores 97% "civic".
  Retrain it with harder negatives (indoor photos, selfies, screenshots,
  documents) when you have time.
- With `unclassified` results, the service tells the truth instead of guessing.
  Expect more triage tickets at first, and fewer wrong ones. That trade is the
  right one for a government-facing system.
- The `ai_explanation` text is a template per category, not generated from the
  image. Nothing in it should be read as a description of the specific photo.
- Filename matching still exists but is off by default. Only turn it on
  (`CIVIC_ALLOW_FILENAME_HINTS=1`) to reproduce old dataset tests — never in
  production.

---

## Next steps, in order

1. `pip install -r requirements.txt` and confirm the smoke test runs.
2. `tune_threshold.py` on 50 civic + 50 non-civic real photos → set the threshold.
3. Collect to at least 12 images per class; train with `--merge-groups`.
4. Read the per-class report, photograph the weak classes, retrain.
5. Drop `--merge-groups` once every class clears 40 images.
