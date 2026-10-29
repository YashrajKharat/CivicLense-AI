# Replacing the AI

An honest audit of every place this project calls a model, what it would take
to replace, and — for several of them — why a model was the wrong tool in the
first place.

---

## What the API is actually doing

Nine call sites, in three groups.

### Group A — genuinely needs a vision model

| Where | What it does |
|---|---|
| `classifyPhoto` | What is in this photograph → a category |
| `verifyResolution` | Do the before and after photos show the same place, and did it change |

### Group B — genuinely needs a language model

| Where | What it does |
|---|---|
| `routes/assistant.js` | Free-form questions over live data |
| `agent/runner.js` | Chooses which read tool to call next |
| `services/translation.js` | Resident's text → English for the officer |

### Group C — never needed a model

| Where | Why it was the wrong tool |
|---|---|
| Severity scoring | **Replaced.** See below. |
| `generateReport` | A report of numbers does not need prose invented around it |
| `buildDailyBrief` | Thresholds and aggregates, not judgement |
| Cluster briefs | Same |

Routing, duplicate detection and responsibility resolution never touched a
model — those are PostGIS and SQL already.

---

## Severity — already replaced, and better for it

`server/src/services/severity.js` is done and wired in. This was the single
biggest win, because severity is computed on **every report**, and rules beat a
model at it on every axis:

| | Model | Rules |
|---|---|---|
| Cost | An API call per report | Free |
| Speed | 1–3 seconds | Under a millisecond |
| Same input twice | Different answers | Identical |
| "Why 85?" | No answer | Line-by-line arithmetic |
| Tuning | Rewrite a prompt and hope | Change a number |

The inputs are things a photograph cannot show anyway: how long it has waited,
how many people reported it, what is within 150 m, what the resident answered,
whether it is monsoon season, whether the work has already been rejected once.

**One design decision worth defending in a viva.** Circumstance is capped. Early
testing put a much-reported pothole *above* an open manhole — fourteen people
noticing something beat a hazard a person can fall into. But report count
measures how many people walk past a problem, not how dangerous it is; a busy
street generates reports a quiet one never will. So circumstance can lift a
nuisance to the top of "high" and no further. Reaching "critical" needs
intrinsic danger, or a resident answer that reveals it.

---

## What you could build from scratch, realistically

### 1. Photo classification — yes, achievable

Transfer learning on MobileNetV3 or EfficientNet-B0. You retrain only the final
layer on your categories.

**Requirements**
- ~200 labelled images per category. This is the real cost — budget 1–2 days.
  Roboflow Universe and Kaggle have pothole, garbage and crack datasets that cut
  it considerably.
- Google Colab free tier. 20–40 minutes of training.
- Export to ONNX, run in Node with `onnxruntime-node`.

**Expect** 85–92% on a clean 8–10 class taxonomy. About 50 ms per image, on your
own machine, with no quota ever.

**Honest limitation** it returns a category and a confidence. It cannot write
the description or the observations — for those you either drop them or keep a
model for that one job.

### 2. Before/after comparison — yes, and no ML needed at all

This is the one people assume needs AI and does not. It is two classical
computer-vision steps:

1. **Same place?** ORB feature detection on both images, match descriptors,
   estimate a homography. A high inlier ratio means the same scene from roughly
   the same angle. This is exactly what `ai_scene_match` reports.
2. **Did it change?** Warp the after-image onto the before-image using that
   homography, then run SSIM over the aligned region. A large structural
   difference in the area of interest means work happened.

`opencv4nodejs` or a small Python sidecar. Deterministic, explainable, free, and
arguably **more** defensible than a model — you can show the matched keypoints.

### 3. Reports and daily briefs — templates, not generation

Do not ask a model to write prose around numbers you already have. Write the
template once and fill it:

> Roads & Infrastructure closed 42 of 61 complaints this week (69%). Three
> breached their deadline, all in Ward M-East. The Kurla pothole group grew from
> 9 to 14 reports and has been open 11 days.

Every clause is a query. It never hallucinates, never costs anything, and reads
better than most model output because the sentences were designed for the data
rather than improvised around it.

### 4. The assistant — hardest to replace honestly

Free-form natural language over live data is where a model earns its place.

A from-scratch version means intent classification onto a fixed set of templated
queries — "which ward is worst" → a known SQL query with slots. That works, and
it is what most production systems actually do. But it only answers the
questions you anticipated, and pretending otherwise would be dishonest.

**Recommendation** keep a model for this one feature, and let it fail gracefully.
It is an administrator convenience, not something the complaint workflow depends
on.

---

## What this buys you

If you build (1) and (2) and template (3), the resident-facing flow — which is
where all your traffic is — needs **no API at all**. Classification runs locally,
severity is arithmetic, routing is PostGIS, proof comparison is OpenCV.

A model would remain only for the admin assistant and the agent, both of which
are demonstrated once rather than used per-report.

That is also a stronger project. "We use an LLM" is common; "we replaced the LLM
with a rules engine where rules were more defensible, and kept it only where
language genuinely matters" is an engineering argument.

---

## Suggested order

1. **Done** — severity rules
2. **Half a day** — template the reports and briefs
3. **Half a day** — OpenCV before/after comparison
4. **Two days** — collect images, train MobileNetV3, export ONNX
5. **Leave alone** — the assistant and the agent

Until step 4 is finished, `AI_PROVIDER=mock` runs the entire application with no
key and no quota.
