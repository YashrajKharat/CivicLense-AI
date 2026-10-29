# CivicLense

## Run it

```bash
# 1 · the classifier — must be running before the server
cd model
py -3.12 -m venv .venv && .venv\Scripts\activate     # Windows
pip install -r requirements.txt
python server.py                                      # stays running on :8000

# 2 · the API
cd server && npm install && npm run dev

# 3 · the app
cd client && npm install && npm run dev
```

**Python 3.10–3.12.** TensorFlow has no 3.13 wheels. `python check_python.py`
in the model folder says which problem you have if the install fails.

Migrations `0001` … `0015` in the Supabase SQL Editor, in order, then `seed.sql`.

---

## What runs on what

**Photographs → your own trained models.** Two in sequence: a binary gate that
answers "is this a civic problem at all", then a 14-class category model. No key,
no quota, ~150 ms, nothing leaves the machine.

**Everything else → queries and templates.** Daily briefs, cluster summaries,
the assistant, notifications and report sections are assembled from SQL. Every
sentence is a format string over a real figure, so it is always correct, instant,
free, and works when nothing else does.

That is not a compromise. A model summarising municipal figures will eventually
write a sentence the figures do not support, in a document carrying the
corporation's name — and the briefs stopped working entirely when a provider
retired a model id, which is an absurd way to lose a page of numbers you already
had.

**Two things still want a language model,** and neither is load-bearing:

- The agent's tool selection, which is genuinely free-form
- An optional opening paragraph on generated reports

`AI_PROVIDER=mock` covers both offline. Set `groq` or `gemini` only if you want
real prose in those two places.

---

## The classifier

22 categories became 14. Four water categories were merged, because a photograph
genuinely cannot separate seepage from leakage from flooding:

| Merged class | Was | Now |
|---|---|---|
| `water_related_issue` | 41% / 25% | **72%** |
| `road_surface_damage` | 63% / 0% | **69%** |
| `waste_accumulation` | 89% / 0% | **79%** |

69% overall on held-out images. The resident sees the most common member and
corrects it in one tap; the follow-up questions resolve the rest. The model sees,
the resident knows.

**Weakest classes and why:** `damaged_traffic_signal` (17 images),
`illegal_parking` (13), `public_toilet_unusable` (15), `footpath_encroachment`
(10). All under 20. That is the entire gap — no architecture change substitutes
for photographs.

```bash
cd model
python train_category_model.py --data dataset --merge-groups --min-images 10
```

It prints per-class accuracy and names what to photograph next.
