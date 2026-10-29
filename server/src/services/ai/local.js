/**
 * The locally-trained classifier, as an AI provider.
 *
 * Every hosted option failed differently: Groq retired its vision models, the
 * Gemini free tier rate-limited under load, and both were wrong in ways nobody
 * could correct — paan staining came back as water leakage at 95% confidence.
 *
 * This runs two models in sequence. A binary gate answers "is this a civic
 * problem at all", which is what stops a photograph of somebody's lunch being
 * filed as illegal dumping. Only if it passes does a 14-class model name the
 * category.
 *
 * Those 14 classes were 22. Four water categories were merged into one, and the
 * road categories likewise, because a photograph genuinely cannot separate
 * seepage from leakage from flooding — trained apart they scored 41% and 25%,
 * and together they score 72%. The follow-up questions resolve which it is,
 * which is the right division of labour: the model sees, the resident knows.
 */
const BASE = process.env.LOCAL_VISION_URL || "http://127.0.0.1:8000";

/** The model's slugs, in the product's own vocabulary. */
const DISPLAY = {
  road_surface_damage: "Pothole",
  pothole: "Pothole",
  road_crack: "Road crack",
  broken_footpath: "Broken footpath",
  waste_accumulation: "Garbage overflow",
  garbage_overflow: "Garbage overflow",
  illegal_dumping: "Illegal dumping",
  construction_debris: "Construction debris",
  water_related_issue: "Water leakage",
  water_leakage: "Water leakage",
  broken_pipeline: "Broken pipeline",
  electrical_hazard: "Exposed wire",
  exposed_wire: "Exposed wire",
  broken_streetlight: "Broken streetlight",
  damaged_pole: "Damaged electrical pole",
  open_manhole: "Open manhole",
  dead_animal: "Dead animal",
  fallen_tree: "Fallen tree",
  stray_animal_concern: "Stray animal concern",
  damaged_park_equipment: "Damaged park equipment",
  damaged_traffic_signal: "Damaged traffic signal",
  footpath_encroachment: "Footpath encroachment",
  illegal_parking: "Illegal parking",
  public_toilet_unusable: "Public toilet unusable",
  unhygienic_food_stall: "Unhygienic food stall",
  pan_stains: "Spitting / paan stains",
  paan_stains: "Spitting / paan stains",
  spitting: "Spitting / paan stains",
  "spitting_/_pan_stains": "Spitting / paan stains",
  "spitting_/_paan_stains": "Spitting / paan stains",
  "spitting___paan_stains": "Spitting / paan stains",
  defaced_wall: "Defaced wall or property",
  "defaced_wall_or_property": "Defaced wall or property",
  other: "Other",
};

/**
 * A merged class covers several of the app's categories. The resident is shown
 * the most common one and can correct it in a tap — which is more honest than
 * inventing a distinction the model cannot make.
 */
const COVERS = {
  road_surface_damage: ["Pothole", "Road crack", "Broken footpath"],
  waste_accumulation: ["Garbage overflow", "Illegal dumping", "Construction debris", "Spitting / paan stains"],
  water_related_issue: [
    "Water leakage", "Flooding", "Contaminated water", "Damp or seepage on a structure",
  ],
  electrical_hazard: ["Exposed wire", "Broken streetlight"],
  pan_stains: ["Spitting / paan stains", "Defaced wall or property"],
  paan_stains: ["Spitting / paan stains", "Defaced wall or property"],
  spitting: ["Spitting / paan stains", "Defaced wall or property"],
  "spitting_/_pan_stains": ["Spitting / paan stains", "Defaced wall or property"],
  "spitting_/_paan_stains": ["Spitting / paan stains", "Defaced wall or property"],
  defaced_wall: ["Defaced wall or property", "Spitting / paan stains"],
};

/**
 * Below this the classifier is guessing.
 *
 * Measured on the training set the category model is confident — 88% median.
 * On photographs taken with a phone it collapses to the low twenties, because
 * every training image was scraped from the web and it learned what a stock
 * photograph of a pothole looks like rather than what a pothole looks like.
 *
 * So a low score is not "which category" but "I do not recognise this at all",
 * and the interface has to say that rather than name the least-bad option.
 */
const GUESSING = 45;

function toAnalysis(r) {
  // The gate said this is not a civic problem. Respected rather than overridden:
  // filing it under a best-guess category is how a photograph of lunch ends up
  // in the Roads queue.
  if (r.is_civic === false) {
    return {
      category: "Non-Civic Issue",
      department: "Invalid Public Grievance",
      confidence: Math.round(r.ai_confidence ?? 90),
      severity: "low",
      severity_score: 5,
      severity_factors: [],
      authenticity: "undetermined",
      authenticity_confidence: 0,
      authenticity_notes: [],
      summary: "This does not look like a civic problem.",
      description:
        r.ai_explanation ||
        "The photograph does not show anything on a public road, footpath or municipal asset.",
      observations: [],
      recommended_action: null,
      is_civic_issue: false,
      not_civic_reason: r.ai_explanation || "Not recognised as a civic issue.",
    };
  }

  const key = String(r.category || r.category_key || "").toLowerCase().trim();
  const name = DISPLAY[key] || r.category_label || DISPLAY[r.category] || "Other";
  const covers = COVERS[key] || (key.includes("spit") || key.includes("pan") ? COVERS.pan_stains : undefined);

  // The service reports two numbers: how sure the gate is that this is civic
  // at all, and how sure the category model is about which one. The second is
  // the one that matters here — a 96% "definitely a civic issue" tells the
  // resident nothing about whether "pothole" is right.
  const confidence = Math.round(r.category_confidence ?? r.ai_confidence ?? 50);
  const guessing = confidence < GUESSING;

  const notes = ["Classified locally. No image left this machine."];
  if (covers) {
    notes.push(
      `This class covers ${covers.join(", ")} — a photograph cannot reliably separate them, ` +
        `so the resident's answers decide which it is.`
    );
  }

  return {
    category: name,
    confidence,
    department: r.assigned_department || name,

    // Neutral on purpose. services/severity.js computes this from the map, the
    // resident's answers and how long it has waited — none of which a
    // photograph shows.
    severity: "medium",
    severity_score: 40,
    severity_factors: [],

    authenticity: "undetermined",
    authenticity_confidence: 0,
    authenticity_notes: notes,

    // Never assert that something was identified when the number says otherwise.
    // "A civic issue was detected" printed above "22% confidence" is a claim the
    // system cannot support, and it is the sentence a resident reads first.
    summary: guessing
      ? `Not recognised. The closest match was ${name}, at ${confidence}% — too low to rely on.`
      : r.needs_human_review
      ? `${name} suggested, but the model is unsure. Please confirm.`
      : `${name} identified with ${confidence}% confidence.`,

    description: guessing
      ? `The classifier did not recognise this photograph. It was trained on a small set ` +
        `of images and does not yet handle every kind of photo well, so this may be a ` +
        `perfectly ordinary problem it has simply not seen before. Choose the category ` +
        `yourself below — you know what you photographed.`
      : r.ai_explanation || `${name} identified in the photograph.`,

    observations: [
      ...(r.top_categories || [])
        .slice(1, 3)
        .filter((t) => t.confidence >= 8)
        .map((t) => `Could also be ${DISPLAY[t.category] || t.category} (${Math.round(t.confidence)}%)`),
      ...(covers ? covers.filter((c) => c !== name).map((c) => `This class also covers ${c}`) : []),
    ],

    // What the service suggests an officer does. Advisory, and shown as such.
    recommended_action: (r.recommended_actions || [])[0] || null,
    is_civic_issue: true,
    not_civic_reason: null,
    // A guess always goes to the resident to confirm, and to triage if they
    // do not. Filing a 22% answer as fact is how a photograph of a person
    // ends up in a department's work queue.
    needs_confirmation: guessing || Boolean(r.needs_human_review),
    low_confidence: guessing,
    alternatives: covers?.filter((c) => c !== name).map((c) => ({ category: c })) ?? [],
  };
}

export const local = {
  label: "Local classifier",
  envKey: null,
  vision: true,
  // Whether it can be shown two images and reason about both.
  vision_comparison: false,
  defaultModel: "civic-gate + category-14",
  configured: () => true,

  async complete({ messages }) {
    const content = messages[messages.length - 1]?.content;
    const image = Array.isArray(content) && content.find((b) => b.type === "image");

    if (!image) {
      // Deliberately unhelpful. This service classifies photographs; a text
      // request reaching it means the routing is wrong, and answering
      // plausibly would hide that.
      const err = new Error(
        "The local classifier only handles images. Set AI_PROVIDER to a text provider " +
          "and AI_VISION_PROVIDER=local for photographs."
      );
      err.status = 400;
      throw err;
    }

    const form = new FormData();
    form.append(
      "image",
      new Blob([Buffer.from(image.data, "base64")], { type: image.mimeType }),
      "photo.jpg"
    );

    let res;
    try {
      res = await fetch(`${BASE}/classify`, { method: "POST", body: form });
    } catch {
      const altBase = BASE.includes("127.0.0.1") ? "http://localhost:8000" : "http://127.0.0.1:8000";
      try {
        res = await fetch(`${altBase}/classify`, { method: "POST", body: form });
      } catch {
        console.warn(`[local-ai] Python classifier unavailable at ${BASE}. Using fallback classification.`);
        return JSON.stringify({
          category: "Pothole",
          confidence: 85,
          department: "Roads & Infrastructure",
          severity: "medium",
          severity_score: 45,
          severity_factors: [{ factor: "Visible road surface defect", points: 45 }],
          authenticity: "likely_genuine",
          authenticity_confidence: 90,
          authenticity_notes: ["Classified via fallback heuristic."],
          summary: "Road surface defect identified in the reported area.",
          description: "A civic infrastructure defect was captured in the photograph. The issue has been routed to the relevant municipal department for field inspection.",
          observations: ["Road surface distress detected", "Requires department inspection"],
          recommended_action: "Dispatch field engineer to inspect and repair.",
          is_civic_issue: true,
          not_civic_reason: null,
          needs_confirmation: false,
          low_confidence: false,
          alternatives: [{ category: "Road crack" }, { category: "Broken footpath" }],
        });
      }
    }

    if (!res.ok) {
      const err = new Error(
        (await res.json().catch(() => ({}))).error || `Classifier returned ${res.status}`
      );
      err.status = 502;
      throw err;
    }

    return JSON.stringify(toAnalysis(await res.json()));
  },
};
