/**
 * Severity scoring, without a model.
 *
 * This was the model's job, and that was the wrong call. Asking a language
 * model to output "severity_score: 85" produces a number with no derivation —
 * it cannot be audited, it changes between runs on the same photo, it costs an
 * API call on every single report, and in a viva "the model said 85" is not an
 * answer to "why 85?".
 *
 * Severity is not a perception problem. It is a policy question: how much does
 * a municipality care about this, here, right now. That is a rule, and rules
 * are better at it in every way that matters — free, instant, identical every
 * time, and explainable line by line.
 *
 * What the model is still good for is the perception part: what is in the
 * photograph. That stays. This takes over from the moment the category is known.
 */

/* ── 1. What kind of problem is it, inherently ─────────────────────────── */
// Base weights encode the municipality's own priorities. An open manhole
// outranks a faded sign because someone can fall into one of them.
const BASE = {
  MANHOLE: 82, EXPOSEDWIRE: 88, SEWAGE: 78, CONTAMINATED: 85, FLOOD: 72,
  DAMAGEDPOLE: 70, TREEFALL: 66, DEAD_TREE: 62, SIGNAL: 68, DEADANIMAL: 60,
  PIPELINE: 62, NOWATER: 58, STAGNANT: 55, MOSQUITO: 55, DRAINBLOCK: 52,
  POTHOLE: 48, LEAK: 50, GARBAGE: 45, FOODSTALL: 55, FOODSTORAGE: 58,
  ROADOBST: 50, DUMPING: 45, TOILET: 45, FOOTPATH: 38, URINATION: 42,
  DEBRIS: 40, STRAY: 45, ROADCRACK: 30, STREETLIGHT: 32, DAMP: 35,
  SPITTING: 28, DEFACED: 25, PARKING: 28, HAWKER: 30, ENCROACHMENT: 35,
  SIGNBOARD: 30, PARKDAMAGE: 25, NOISE: 30, OTHER: 25,
};

/* ── 2. Modifiers, each with a stated reason ───────────────────────────── */

/** How long it has been left. Neglect is itself a harm. */
function ageFactor(createdAt) {
  const days = (Date.now() - new Date(createdAt)) / 864e5;
  if (days >= 30) return { points: 14, factor: "Unresolved for over a month" };
  if (days >= 14) return { points: 9, factor: "Unresolved for two weeks" };
  if (days >= 7) return { points: 5, factor: "Unresolved for a week" };
  return null;
}

/**
 * How many people independently reported it.
 *
 * Deliberately logarithmic. Twenty reports is not twenty times worse than one —
 * it is one problem that twenty people walk past. Linear weighting would let a
 * single busy street dominate the entire queue.
 */
function clusterFactor(reportCount) {
  if (!reportCount || reportCount < 2) return null;
  const points = Math.min(22, Math.round(8 * Math.log2(reportCount)));
  return { points, factor: `${reportCount} separate residents reported this` };
}

/**
 * What is nearby.
 *
 * A pothole outside a school is a different problem from the same pothole on an
 * industrial access road, and this is the one judgement a photograph genuinely
 * cannot make — it needs the map.
 */
function proximityFactor(nearby = {}) {
  const out = [];
  if (nearby.school_m != null && nearby.school_m < 150)
    out.push({ points: 16, factor: `${nearby.school_m} m from a school` });
  if (nearby.hospital_m != null && nearby.hospital_m < 200)
    out.push({ points: 14, factor: `${nearby.hospital_m} m from a hospital` });
  if (nearby.market_m != null && nearby.market_m < 100)
    out.push({ points: 9, factor: `${nearby.market_m} m from a market` });
  return out;
}

/** What the resident told us the photograph could not show. */
// Answers above this weight describe danger, not circumstance — somebody fell
// ill, a wire is live, children pass here. Those are not capped.
const DANGER_THRESHOLD = 25;

function answerFactors(followups = []) {
  return followups
    .filter((f) => f.severity_delta > 0)
    .map((f) => ({
      points: f.severity_delta,
      factor: f.answer_label || f.answer_value,
      danger: f.severity_delta >= DANGER_THRESHOLD,
    }));
}

/** Monsoon turns drainage and flooding from nuisance into emergency. */
function seasonFactor(code, when = new Date()) {
  const month = when.getMonth() + 1; // June–September in Mumbai
  const monsoon = month >= 6 && month <= 9;
  if (!monsoon) return null;

  if (["DRAINBLOCK", "FLOOD", "SEWAGE", "STAGNANT", "MOSQUITO"].includes(code))
    return { points: 12, factor: "Monsoon season — drainage failures escalate quickly" };
  if (["POTHOLE", "MANHOLE"].includes(code))
    return { points: 8, factor: "Monsoon season — standing water hides road defects" };
  return null;
}

/**
 * Neighbours saying they have seen it too.
 *
 * Weighted below a separate report on purpose. Agreeing costs a tap;
 * photographing it yourself and filing costs real effort, and the second is
 * better evidence. Logarithmic for the same reason report count is — a popular
 * complaint should not outrank a dangerous one on agreement alone.
 */
function corroborationFactor(count) {
  if (!count) return null;
  return {
    points: Math.min(15, Math.round(8 * Math.log(count + 1))),
    factor: `${count} neighbour${count === 1 ? "" : "s"} confirmed seeing it`,
  };
}

/**
 * And neighbours saying it is already fixed, or was never there.
 *
 * Pushes priority down rather than up. Sending a crew to something two people
 * say is already done wastes a visit that another street needed.
 */
function disputeFactor(count) {
  if (!count) return null;
  return {
    points: -Math.min(20, count * 8),
    factor: `${count} resident${count === 1 ? "" : "s"} say it is already resolved`,
  };
}

/** A job the resident has already rejected has proven harder than it looked. */
function reworkFactor(reworkCount) {
  if (!reworkCount) return null;
  return {
    points: Math.min(20, reworkCount * 10),
    factor: `Returned by the resident ${reworkCount} time${reworkCount === 1 ? "" : "s"}`,
  };
}

/* ── 3. Scoring ─────────────────────────────────────────────────────────── */

const band = (score) =>
  score >= 80 ? "critical" : score >= 60 ? "high" : score >= 35 ? "medium" : "low";

/**
 * How much the surrounding circumstances can lift a report.
 *
 * Without this, a much-reported pothole outscored an open manhole: fourteen
 * people noticing something beat a hazard a person can fall into. Attention is
 * a real signal, but it measures how many people walk past a problem, not how
 * dangerous the problem is — a busy street generates reports a quiet one never
 * will.
 *
 * So circumstance is capped by how dangerous the thing is to begin with. A
 * nuisance can climb to the top of "high" on weight of numbers and stay there.
 * Reaching "critical" needs something intrinsically hazardous, or an answer
 * from the resident that reveals real danger.
 */
const CIRCUMSTANCE_CAP = 40;   // hazardous categories, base >= 60
const NUISANCE_CAP = 30;       // everything else

/**
 * Returns a score, a band, and the arithmetic that produced them.
 *
 * The breakdown is the point. A resident can see why their report is "medium",
 * an officer can see why one job outranks another, and an administrator can
 * argue with a weight rather than with a black box.
 */
export function scoreSeverity({
  categoryCode,
  createdAt = new Date(),
  reportCount = 1,
  nearby = {},
  followups = [],
  reworkCount = 0,
  corroborations = 0,
  disputes = 0,
  now = new Date(),
}) {
  const base = BASE[categoryCode] ?? BASE.OTHER;

  const factors = [
    { points: base, factor: `Base weight for this category`, base: true },
    ageFactor(createdAt),
    clusterFactor(reportCount),
    ...proximityFactor(nearby),
    ...answerFactors(followups),
    seasonFactor(categoryCode, now),
    reworkFactor(reworkCount),
    corroborationFactor(corroborations),
    disputeFactor(disputes),
  ].filter(Boolean);

  const modifiers = factors.filter((f) => !f.base);
  const modifierTotal = modifiers.reduce((sum, f) => sum + f.points, 0);

  // A resident reporting genuine danger is not "circumstance" — it is the same
  // kind of signal as the category itself, and it is not capped.
  const dangerAnswers = modifiers
    .filter((f) => f.danger)
    .reduce((sum, f) => sum + f.points, 0);

  // A dispute lowers the score and must not be swallowed by the cap — capping
  // the sum would let a heavily corroborated report absorb the correction from
  // people saying it is already fixed.
  const negative = modifiers.filter((f) => f.points < 0).reduce((s, f) => s + f.points, 0);
  const positive = modifierTotal - dangerAnswers - negative;

  const cap = base >= 60 ? CIRCUMSTANCE_CAP : NUISANCE_CAP;
  const circumstance = Math.min(cap, positive) + negative;
  const limited = circumstance < modifierTotal - dangerAnswers;

  const raw = base + circumstance + dangerAnswers;
  const score = Math.max(0, Math.min(100, raw));

  return {
    score,
    severity: band(score),
    factors: modifiers,
    base,
    // Both limits are reported, because "this hit the ceiling" and "circumstance
    // was capped so a hazard would still outrank it" are different facts and an
    // administrator tuning the weights needs to tell them apart.
    capped: base + modifierTotal > 100,
    circumstance_limited: limited,
    raw: base + modifierTotal,
  };
}

/** Plain-language explanation, for the resident and the officer. */
export function explainSeverity(result) {
  const top = [...result.factors].sort((a, b) => b.points - a.points)[0];

  if (!top) return `Scored ${result.score} on the base weight for this category alone.`;

  return (
    `Scored ${result.score} of 100. The largest single factor is "${top.factor}" ` +
    `at +${top.points}. Every figure here comes from the category, the map, the ` +
    `resident's answers and how long it has waited — nothing is estimated.`
  );
}

export const SEVERITY_WEIGHTS = BASE;
