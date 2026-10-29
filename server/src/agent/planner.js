/**
 * Choosing which tools to run, without a language model.
 *
 * The agent's one genuinely model-shaped job is turning a free-form task into a
 * sequence of tool calls. With no text provider configured it failed outright —
 * "the analysis service returned an unreadable result", zero steps, every run
 * red — which is a poor showing for a feature whose whole point is that it
 * reasons over live data.
 *
 * The honest observation is that administrators ask a small number of questions,
 * and each has an obvious plan. Matching the task to one of those plans and
 * running it covers what the suggestion chips offer, needs nothing external, and
 * is answered from real queries rather than a model's recollection.
 *
 * It is narrower than a model. A task outside these patterns is declined with
 * the list of what it does know, which is more useful than a confident answer
 * to a misread question. When a text provider is configured the model planner
 * runs instead and this is the fallback.
 */

const PLANS = [
  {
    id: "worst_backlog",
    match: /backlog|worst|behind|attention first|which ward/i,
    label: "Which ward has the worst backlog",
    steps: [
      { tool: "ward_breakdown", args: {} },
      { tool: "department_stats", args: {} },
    ],
    read: (results) => {
      // Each tool wraps its rows under a named key — { wards: [...] }, not a
      // bare array. Reading results.ward_breakdown as a list is what produced
      // "wards is not iterable" on every run.
      const wards = results.ward_breakdown?.wards || [];
      // The tool reports ward, total, critical, open and top_category — there
      // is no overdue column, so the backlog is measured on what is open and
      // how much of it is critical.
      const worst = [...wards].sort(
        (a, b) => (b.open ?? 0) - (a.open ?? 0) || (b.critical ?? 0) - (a.critical ?? 0)
      )[0];
      if (!worst) return "No ward has open work at the moment.";

      return (
        `${worst.ward} carries the most: ${worst.open} open of ${worst.total} filed, ` +
        `${worst.critical} of them critical. Most common there is ${worst.top_category}. ` +
        `Volume and lateness are different problems — a busy ward closing on time needs ` +
        `staff, a quiet one running late needs asking why.`
      );
    },
  },

  {
    id: "overdue_critical",
    match: /overdue|critical|urgent|past deadline|escalat/i,
    label: "Find overdue critical complaints",
    steps: [
      { tool: "search_complaints", args: { severity: "critical", status: "open" } },
      { tool: "officer_workload", args: {} },
    ],
    read: (results) => {
      const found = results.search_complaints?.complaints || [];
      const late = found.filter((c) => c.overdue);

      if (found.length === 0) return "Nothing critical is open right now.";

      return (
        `${found.length} critical ${found.length === 1 ? "report is" : "reports are"} open, ` +
        `${late.length} of them past a twelve-hour deadline. ` +
        (late.length
          ? `Those should be assigned before anything else in the queue.`
          : `None have breached yet.`)
      );
    },
  },

  {
    id: "contractor",
    match: /contractor|agency|contract|supplier|vendor/i,
    label: "Which contractor is underperforming",
    steps: [{ tool: "contract_performance", args: {} }],
    read: (results) => {
      const rows = results.contract_performance?.contracts || [];
      const worst = [...rows].sort((a, b) => (b.overdue ?? 0) - (a.overdue ?? 0))[0];
      if (!worst) return "No complaint currently falls inside a maintenance contract.";

      return (
        `${worst.agency} carries the most overdue work — ${worst.overdue} past deadline ` +
        `under ${worst.contract_no}, having closed ${worst.resolved ?? 0} of ${worst.total ?? 0}.`
      );
    },
  },

  {
    id: "officer_load",
    match: /officer|workload|unbalanced|busy|who is free|capacity/i,
    label: "Where officer workload is unbalanced",
    steps: [{ tool: "officer_workload", args: {} }],
    read: (results) => {
      const rows = results.officer_workload?.officers || [];
      if (rows.length < 2) return "There are too few officers to compare.";

      const sorted = [...rows].sort((a, b) => (b.open_cases ?? 0) - (a.open_cases ?? 0));
      const [most, least] = [sorted[0], sorted[sorted.length - 1]];

      // `officer`, not `name` — reading the wrong key printed "undefined is
      // carrying 14".
      return (
        `${most.officer} is carrying ${most.open_cases}, ${least.officer} has ${least.open_cases}. ` +
        `A gap of ${(most.open_cases ?? 0) - (least.open_cases ?? 0)} means someone is missing ` +
        `deadlines that were never realistic while somebody else has room.`
      );
    },
  },

  {
    id: "clusters",
    match: /group|cluster|hotspot|repeat|same place/i,
    label: "Which groups are growing",
    steps: [{ tool: "list_clusters", args: {} }],
    read: (results) => {
      const rows = results.list_clusters?.clusters || [];
      if (!rows.length) return "No groups have formed yet.";

      const biggest = [...rows].sort((a, b) => (b.report_count ?? 0) - (a.report_count ?? 0))[0];
      return (
        `${biggest.ref} is the largest — ${biggest.report_count} reports of ${biggest.category}. ` +
        `One visit closes all of them; treating them separately closes none.`
      );
    },
  },
];

export const PLAN_LABELS = PLANS.map((p) => p.label);

export function planFor(task) {
  return PLANS.find((p) => p.match.test(task)) || null;
}

/**
 * Runs a plan, emitting the same events the model planner does so the interface
 * cannot tell them apart. Every step is a real query against live data — the
 * difference is only in how the steps were chosen.
 */
export async function runPlan({ plan, ctx, onEvent, TOOLS }) {
  const results = {};

  onEvent({ type: "thinking", text: `Recognised this as: ${plan.label}` });

  for (const step of plan.steps) {
    const tool = TOOLS[step.tool];
    if (!tool) continue;

    onEvent({ type: "tool", tool: step.tool, args: step.args });

    try {
      const out = await tool.run(step.args, ctx);
      results[step.tool] = out;
      // The row count comes from whichever array the tool wrapped, so the
      // interface reports "12 rows" rather than "1 object".
      const list = Object.values(out || {}).find(Array.isArray);
      onEvent({
        type: "result",
        tool: step.tool,
        rows: list ? list.length : 1,
      });
    } catch (err) {
      // One failing query should not abandon the run — the remaining steps may
      // still answer the question.
      onEvent({ type: "result", tool: step.tool, error: err.message });
    }
  }

  return {
    answer: plan.read(results),
    results,
    steps: plan.steps.length,
  };
}
