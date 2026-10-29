import { completeJSON, aiProvider } from "./ai/index.js";

const SYSTEM = `You are the vision module of CivicLense, a municipal complaint platform in Mumbai.
You classify photographs of civic problems for routing to the correct department.

Rules you must follow:
- Authenticity is an assisted assessment, never a verdict. Stay calibrated and hedge. A photograph is never declared fake; at most it is flagged for human review.
- Severity must be justified by named factors, not asserted.
- If the photograph shows a road surface defect, hole, cavity, broken asphalt, crater, or road crack in a street/road/pavement, it MUST be classified as Pothole or Road crack under Roads & Infrastructure.
- NEVER classify road holes, asphalt textures, wet tarmac, or gravel as Spitting / paan stains.
- Spitting / paan stains strictly applies to visible red/brown spit splatter or defacement on vertical walls, pillars, stairs, or clean floor tiles.
- If the photograph shows no reportable civic problem, say so rather than inventing one. Do not stretch an unrelated photo into the nearest category — "Other" exists for that.
- Describe what you can actually see. An officer reads this before travelling to the site and decides what to bring, so vagueness costs someone a wasted trip.
- Never invent detail that is not visible. If the extent is unclear, say it is unclear.
- Do NOT state measurements, distances or quantities without a reference object. Say a large area or several metres instead.
- Do NOT assert consequences you cannot see. Describe the condition; let severity carry the judgement.
- Confidence must reflect genuine certainty.
- Output raw JSON only. No markdown fences, no explanation before or after.`;

const SCHEMA = `Reply with ONLY a JSON object:
{
 "category": "<Pothole | Road crack | Open manhole | Broken footpath | Garbage overflow | Illegal dumping | Dead animal | Water leakage | Flooding | Broken pipeline | Broken streetlight | Exposed wire | Damaged traffic signal | Illegal parking | Road obstruction | Stagnant water | Unhygienic food stall | Spitting / paan stains | Defaced wall or property | Public urination spot | Damp or seepage on a structure | Sewage overflow | Dangerous or dead tree | Persistent noise nuisance | Stray animal concern | Other>",
 "confidence": <0-100 integer>,
 "department": "<Roads & Infrastructure | Solid Waste Management | Water Supply | Street Lighting | Traffic | Public Health | Food Safety | Encroachment | Unclassified>",
 "severity": "<critical|high|medium|low>",
 "severity_score": <0-100 integer>,
 "severity_factors": [{"factor":"<short reason>","points":<integer>}],
 "authenticity": "<likely_genuine|possibly_ai_generated|possibly_manipulated|undetermined>",
 "authenticity_confidence": <0-100 integer>,
 "authenticity_notes": ["<factor noticed in photo>"],
 "summary": "<one sentence describing what is broken or required>",
 "description": "<two sentences on the visible condition>",
 "observations": ["<specific visible detail>", "<another>", "<another>"],
 "recommended_action": "<what the officer should do or bring, in one line>",
 "is_civic_issue": <true|false>,
 "not_civic_reason": "<if is_civic_issue is false, what the photograph actually shows>"
}`;

const AUTHENTICITY_LABEL = {
  likely_genuine: "Likely camera image",
  possibly_ai_generated: "Possibly AI generated",
  possibly_manipulated: "Possibly manipulated",
  undetermined: "Unable to determine",
};

const CATEGORIES = [
  "Pothole", "Road crack", "Open manhole", "Broken footpath", "Garbage overflow",
  "Illegal dumping", "Dead animal", "Water leakage", "Flooding", "Broken pipeline",
  "Broken streetlight", "Exposed wire", "Damaged traffic signal", "Illegal parking",
  "Road obstruction", "Stagnant water", "Unhygienic food stall",
  "Spitting / paan stains", "Defaced wall or property", "Public urination spot",
  "Damp or seepage on a structure", "Sewage overflow", "Dangerous or dead tree",
  "Persistent noise nuisance", "Stray animal concern",
  "Other",
];

const clamp = (n, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, Math.round(Number(n) || 0)));

function normalise(raw) {
  if (raw.is_civic_issue === false) {
    return {
      category: "Non-Civic Issue",
      confidence: clamp(raw.confidence || 0),
      department: "Invalid Public Grievance",
      severity: "low",
      severity_score: 5,
      severity_factors: [],
      authenticity: "undetermined",
      authenticity_confidence: 0,
      authenticity_notes: [],
      authenticity_label: AUTHENTICITY_LABEL.undetermined,
      summary: raw.not_civic_reason || "This does not appear to show a civic problem.",
      description: String(raw.description || raw.not_civic_reason || "The photograph does not show a reportable civic issue."),
      observations: Array.isArray(raw.observations) ? raw.observations.map(String).slice(0, 6) : [],
      recommended_action: null,
      is_civic_issue: false,
      not_civic_reason: raw.not_civic_reason ? String(raw.not_civic_reason) : null,
    };
  }

  const category = CATEGORIES.find((c) => c.toLowerCase() === String(raw.category || "").toLowerCase())
    || CATEGORIES.find((c) => String(raw.category || "").toLowerCase().includes(c.toLowerCase()))
    || "Other";

  const severity = ["critical", "high", "medium", "low"].includes(raw.severity)
    ? raw.severity
    : "medium";

  const authenticity = AUTHENTICITY_LABEL[raw.authenticity] ? raw.authenticity : "undetermined";

  return {
    category,
    confidence: clamp(raw.confidence),
    department: raw.department || "Unclassified",
    severity,
    severity_score: clamp(raw.severity_score || 40),
    severity_factors: Array.isArray(raw.severity_factors)
      ? raw.severity_factors
          .filter((f) => f && f.factor)
          .map((f) => ({ factor: String(f.factor), points: clamp(f.points, 0, 60) }))
      : [],
    authenticity,
    authenticity_confidence: clamp(raw.authenticity_confidence || 50),
    authenticity_notes: Array.isArray(raw.authenticity_notes) ? raw.authenticity_notes.map(String) : [],
    authenticity_label: AUTHENTICITY_LABEL[authenticity],
    summary: String(raw.summary || "No summary was produced for this photograph."),
    description: String(raw.description || raw.summary || "No description was produced."),
    observations: Array.isArray(raw.observations)
      ? raw.observations.map(String).filter(Boolean).slice(0, 6)
      : [],
    recommended_action: raw.recommended_action ? String(raw.recommended_action) : null,
    is_civic_issue: raw.is_civic_issue !== false,
    not_civic_reason: raw.not_civic_reason ? String(raw.not_civic_reason) : null,
  };
}

export async function classifyPhoto({ base64, mimeType, context }) {
  const raw = await completeJSON({
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: [
          { type: "image", mimeType, data: base64 },
          { type: "text", text: `${SCHEMA}\n\nContext: ${context || "no additional context supplied"}.` },
        ],
      },
    ],
  });

  return normalise(raw);
}

export async function verifyResolution({ before, after }) {
  if (!aiProvider.vision_comparison) {
    return {
      scene_match: null,
      change_detected: null,
      verdict: "not_checked",
      summary:
        "No automatic comparison was run — the local classifier reads one photograph at a time. The resident compares the two and decides.",
    };
  }

  const raw = await completeJSON({
    system:
      "You compare two photographs of the same reported problem, taken before and after " +
      "work. Judge whether they show the same place and whether the problem is gone. " +
      "Say inconclusive when you cannot tell — a wrong verdict is worse than no verdict.",
    messages: [
      {
        role: "user",
        content: [
          { type: "image", mimeType: before.mimeType, data: before.base64 },
          { type: "image", mimeType: after.mimeType, data: after.base64 },
          {
            type: "text",
            text:
              'First image is BEFORE, second is AFTER. Reply with raw JSON only:\n' +
              '{"scene_match":<0-100>,"change_detected":<true|false>,' +
              '"verdict":"<likely_completed|inconclusive|not_completed>","summary":"<two sentences>"}',
          },
        ],
      },
    ],
    maxTokens: 400,
  });

  return {
    scene_match: clamp(raw.scene_match),
    change_detected: Boolean(raw.change_detected),
    verdict: ["likely_completed", "inconclusive", "not_completed"].includes(raw.verdict)
      ? raw.verdict
      : "inconclusive",
    summary: String(raw.summary || "The comparison was inconclusive."),
  };
}
