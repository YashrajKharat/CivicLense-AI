/**
 * Prose from data, without a language model.
 *
 * Every sentence here is a format string over figures that came from a query.
 * That is a narrower tool than a language model and a better one for this job:
 *
 * · It cannot say something the numbers do not support. A model summarising a
 *   municipal report will eventually write a sentence that is not true, in a
 *   document carrying the corporation's name.
 * · It costs nothing and takes no time, so a daily brief can be regenerated on
 *   every page load rather than cached and quietly going stale.
 * · It never fails. The briefs stopped working entirely when a provider retired
 *   a model id, which is an absurd way to lose a page of numbers you already had.
 *
 * The writing is deliberately plain. Municipal reporting reaches people who are
 * skimming for the one thing that needs them, and adjectives get in the way.
 */

const plural = (n, word, many) => `${n} ${n === 1 ? word : many || word + "s"}`;
const pct = (part, whole) => (whole ? Math.round((part / whole) * 100) : 0);

/** "3 days ago", "yesterday" — relative, because exact dates need arithmetic. */
export function ago(iso) {
  if (!iso) return "";
  const days = Math.floor((Date.now() - new Date(iso)) / 864e5);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.round(days / 7)} weeks ago`;
  return `${Math.round(days / 30)} months ago`;
}

/**
 * The daily brief.
 *
 * Ordered by what would make somebody act, not by what is largest. A single
 * critical complaint past its deadline matters more than fifty routine ones
 * filed this morning, and a brief that leads with the bigger number buries it.
 */
export function dailyBrief(d) {
  const items = [];

  if (d.breached > 0) {
    items.push({
      tag: "Deadlines",
      severity: d.breached > 5 ? "critical" : "high",
      headline: `${plural(d.breached, "report")} past deadline`,
      detail:
        d.breached_critical > 0
          ? `${d.breached_critical} of them are critical. Those had a twelve-hour deadline, ` +
            `so every one has been open at least half a day longer than it should.`
          : `None are critical, but each is now escalating on its own timer.`,
    });
  }

  if (d.rejected > 0) {
    items.push({
      tag: "Rework",
      severity: "high",
      headline: `${plural(d.rejected, "resident")} rejected an officer's evidence`,
      detail:
        `Work was submitted and sent back. That figure matters more than the closure ` +
        `rate: it is the only measure of whether something was fixed rather than marked fixed.`,
    });
  }

  if (d.new_hotspots > 0) {
    items.push({
      tag: "Grouping",
      severity: "medium",
      headline: `${plural(d.new_hotspots, "group")} crossed into hotspot`,
      detail:
        `Twelve or more residents have now reported the same problem in the same place. ` +
        `One crew visit closes all of them; treating them separately closes none.`,
    });
  }

  if (d.unassigned > 0) {
    items.push({
      tag: "Assignment",
      severity: d.unassigned > 20 ? "high" : "medium",
      headline: `${plural(d.unassigned, "report")} waiting for an officer`,
      detail:
        d.oldest_unassigned
          ? `The oldest was filed ${ago(d.oldest_unassigned)} and nobody has been sent.`
          : `None have been assigned yet.`,
    });
  }

  if (d.flagged > 0) {
    items.push({
      tag: "Review",
      severity: "low",
      headline: `${plural(d.flagged, "photograph")} waiting on a human`,
      detail: `Flagged by the classifier rather than rejected. Nothing is refused automatically.`,
    });
  }

  if (items.length === 0) {
    items.push({
      tag: "Operations",
      severity: "low",
      headline: "Nothing needs you this morning",
      detail:
        `${plural(d.open ?? 0, "report")} open, none past deadline and none sent back. ` +
        `The queue is moving.`,
    });
  }

  const worst = items[0];

  return {
    headline: worst.headline,
    summary:
      `${plural(d.filed_today ?? 0, "report")} filed today against ${d.resolved_today ?? 0} closed. ` +
      (d.breached > 0
        ? `${d.breached} are past deadline and should be looked at first.`
        : `Nothing is past deadline.`),
    items,
    // Said plainly, because a brief that looks generated invites the question.
    generated: "Assembled from queries. No figure here is estimated.",
  };
}

/**
 * A cluster brief — why these reports are one problem.
 *
 * The useful content is the shape of the group: how fast it grew, how many
 * separate people, how long the oldest has waited. Those are facts, and a
 * sentence built from them says more than a paraphrase of them would.
 */
export function clusterBrief(c) {
  const days = Math.max(
    1,
    Math.round((new Date(c.last_reported) - new Date(c.first_reported)) / 864e5)
  );
  const rate = (c.report_count / days).toFixed(1);

  const summary =
    `${plural(c.report_count, "report")} from ${plural(c.citizen_count, "resident")} ` +
    `within ${c.radius_m} metres, first raised ${ago(c.first_reported)} and still arriving ` +
    `at about ${rate} a day. ` +
    (c.citizen_count > 1
      ? `Separate people reporting the same thing independently is what distinguishes a ` +
        `real problem from one person's complaint.`
      : `All from one resident, so this may be one person's persistence rather than a ` +
        `widespread problem.`);

  const action =
    c.report_count >= 12
      ? `Send one crew to the centroid. Closing these individually means ${c.report_count} ` +
        `visits to the same street.`
      : `Worth a single visit rather than ${c.report_count} separate assignments.`;

  const risk =
    c.sla_breached > 0
      ? `${c.sla_breached} of these are already past deadline, and each escalates separately.`
      : `Left alone the group keeps growing, and every new report starts its own clock.`;

  return { summary, action, risk };
}

/**
 * Answers to the questions an administrator actually asks.
 *
 * Not natural language understanding — a fixed set of questions matched on
 * keywords, each answered from a real query. It handles what the suggestion
 * chips offer and says plainly when it cannot help, which is more useful than a
 * fluent answer to a question it misread.
 */
export const ASSISTANT_INTENTS = [
  {
    id: "worst_ward",
    match: /ward|area|which part|where.*worst|attention first/i,
    label: "Which ward needs attention first?",
  },
  {
    id: "critical_today",
    match: /critical|urgent|today|summarise|summary/i,
    label: "Summarise today's critical issues",
  },
  {
    id: "contractor",
    match: /contractor|agency|contract|underperform/i,
    label: "Which contractor is underperforming?",
  },
  {
    id: "officer_load",
    match: /officer|workload|unbalanced|busy|staff/i,
    label: "Where is officer workload unbalanced?",
  },
];

export function matchIntent(question) {
  return ASSISTANT_INTENTS.find((i) => i.match.test(question)) || null;
}

/** Turns query rows into the answer shape the assistant panel renders. */
export function answerFrom(intent, rows) {
  if (!rows.length) {
    return {
      headline: "Nothing to report",
      findings: [],
      reading: "No records match that for the current period.",
      action: "",
    };
  }

  const top = rows[0];

  const shapes = {
    worst_ward: () => ({
      headline: `${top.label} has the most open work`,
      findings: rows.slice(0, 5).map((r) => ({
        label: r.label,
        value: `${r.open} open`,
        note: r.overdue > 0 ? `${r.overdue} past deadline` : null,
      })),
      reading:
        `${top.label} carries ${plural(top.open, "open report")}, ` +
        `${pct(top.overdue, top.open)}% of them past deadline. ` +
        `Volume and lateness are different problems — a busy ward closing on time needs ` +
        `staff, a quiet one running late needs asking why.`,
      action:
        top.overdue > 0
          ? `Start with the ${top.overdue} overdue in ${top.label}.`
          : `No overdue work there despite the volume.`,
    }),

    critical_today: () => ({
      headline: `${plural(rows.length, "critical report")} open`,
      findings: rows.slice(0, 6).map((r) => ({
        label: r.label,
        value: r.value,
        note: r.note,
      })),
      reading:
        `Critical reports carry a twelve-hour deadline. ` +
        `${rows.filter((r) => r.overdue).length} have already passed it.`,
      action: "Assign the overdue ones before anything else in the queue.",
    }),

    contractor: () => ({
      headline: `${top.label} has the most overdue work`,
      findings: rows.slice(0, 5).map((r) => ({
        label: r.label,
        value: `${r.overdue} overdue`,
        note: `${pct(r.resolved, r.total)}% closed`,
      })),
      reading:
        `${top.label} has ${plural(top.overdue, "report")} past deadline under ` +
        `${top.note || "its contract"}, closing ${pct(top.resolved, top.total)}% of the ` +
        `${top.total} raised against it.`,
      action: `Worth raising at the next contract review.`,
    }),

    officer_load: () => ({
      headline: `${top.label} is carrying the most`,
      findings: rows.slice(0, 6).map((r) => ({
        label: r.label,
        value: `${r.open} open`,
        note: r.sla != null ? `${r.sla}% on time` : null,
      })),
      reading:
        `The gap between the busiest and quietest officer is ` +
        `${top.open - (rows[rows.length - 1]?.open ?? 0)} reports. ` +
        `An overloaded officer misses deadlines that were never realistic.`,
      action: `Route new work in this department away from ${top.label} until it evens out.`,
    }),
  };

  return (shapes[intent.id] || shapes.worst_ward)();
}
