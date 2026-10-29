import { query } from "../db/pool.js";
import { buildSections } from "./report-sections.js";
import { complete } from "./ai/index.js";


/**
 * Builds a report from queries.
 *
 * Previously this handed raw rows to a language model and asked it to write the
 * whole thing. Two problems: prose cannot be scanned the way a chart can, and a
 * model writing sentences around numbers will eventually write one the numbers
 * do not support — in a document carrying a municipality's name.
 *
 * Now every figure, chart series and sentence comes from SQL. The model is
 * offered exactly one job it is genuinely good at: a short opening paragraph
 * tying the sections together. If it is unavailable, the report is complete
 * without it.
 */
export async function generateReport({ from, to, departmentId, sections, requestedBy }) {
  const built = await buildSections(sections, { from, to, departmentId });

  // The template sentences each section produced. These are always true,
  // because each is a format string over figures from its own query.
  const findings = Object.values(built)
    .filter((s) => s.narrative)
    .map((s) => `${s.title}: ${s.narrative}`);

  let summary = null;
  try {
    summary = await complete({
      system:
        `You write the opening paragraph of a municipal performance report. You are given ` +
        `findings that are already written and already true. Do not restate them and do not ` +
        `introduce any number that is not in them. In three or four sentences, say what the ` +
        `period amounted to and which finding deserves attention first. Plain prose, no lists, ` +
        `no words of alarm.`,
      messages: [
        {
          role: "user",
          content: `Period ${from} to ${to}.\n\n${findings.join("\n\n")}`,
        },
      ],
      maxTokens: 400,
    });
  } catch {
    // A report of figures does not depend on prose. Losing the summary costs a
    // paragraph; failing the whole report because a model was busy would be
    // absurd.
    summary = null;
  }

  const { rows } = await query(
    `insert into generated_reports
       (requested_by, department_id, period_from, period_to, sections, data, narrative)
     values ($1,$2,$3,$4,$5,$6,$7) returning id, created_at`,
    [requestedBy, departmentId ?? null, from, to, sections, built, summary]
  );

  return {
    id: rows[0].id,
    created_at: rows[0].created_at,
    from,
    to,
    sections: built,
    summary,
    findings,
  };
}
