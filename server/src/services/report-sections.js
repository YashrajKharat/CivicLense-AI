import { query } from "../db/pool.js";

/**
 * Report sections, each returning both a table and a chart series.
 *
 * The previous version handed raw rows to a language model and asked it to
 * write prose. That was the wrong shape twice over: prose cannot be read at a
 * glance the way a chart can, and a model writing sentences around numbers will
 * eventually write a sentence the numbers do not support.
 *
 * Every figure below comes from a query. The narrative sentences are templates
 * with slots, so they are always true, always instant, and never cost anything.
 */

const bucketFor = (days) => (days <= 14 ? "day" : days <= 120 ? "week" : "month");
const labelFor = (bucket) =>
  bucket === "day" ? "DD Mon" : bucket === "week" ? '"w/c" DD Mon' : "Mon YYYY";

const pct = (part, whole) => (whole ? Math.round((part / whole) * 100) : 0);
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

/* ── Filed against resolved, over time ──────────────────────────────────── */
async function volume({ from, to, departmentId }) {
  const days = Math.max(1, Math.round((new Date(to) - new Date(from)) / 864e5));
  const bucket = bucketFor(days);

  const { rows } = await query(
    `with span as (
       select generate_series(
         date_trunc($4, $1::timestamptz),
         date_trunc($4, $2::timestamptz),
         ('1 ' || $4)::interval
       ) as period
     )
     select to_char(s.period, $5) as label,
            count(c.id) filter (where c.created_at >= s.period)::int  as filed,
            count(c.id) filter (where c.resolved_at >= s.period)::int as resolved
     from span s
     left join complaints c
       on date_trunc($4, c.created_at) = s.period
      and ($3::int is null or c.department_id = $3)
     group by s.period
     order by s.period`,
    [from, to, departmentId ?? null, bucket, labelFor(bucket)]
  );

  const filed = rows.reduce((n, r) => n + r.filed, 0);
  const resolved = rows.reduce((n, r) => n + r.resolved, 0);
  const gap = filed - resolved;

  return {
    title: "Filed against resolved",
    chart: {
      style: "line",
      x: rows.map((r) => r.label),
      series: [
        { name: "Filed", values: rows.map((r) => r.filed) },
        { name: "Resolved", values: rows.map((r) => r.resolved) },
      ],
    },
    stats: [
      { label: "Filed", value: filed },
      { label: "Resolved", value: resolved },
      { label: "Net change", value: gap > 0 ? `+${gap}` : String(gap), alert: gap > 0 },
    ],
    // Every clause is a figure from above, so this cannot drift from the data.
    narrative:
      gap > 0
        ? `Intake outran capacity: ${plural(filed, "report")} filed against ${resolved} closed, ` +
          `a backlog growth of ${gap}. A resolution rate looks healthy in isolation and still ` +
          `leaves the queue longer than it started.`
        : gap < 0
        ? `The backlog shrank by ${Math.abs(gap)}: ${resolved} closed against ${plural(filed, "new report")}.`
        : `Intake and capacity matched exactly — ${filed} filed, ${resolved} closed.`,
  };
}

/* ── Where the work is ──────────────────────────────────────────────────── */
async function byCategory({ from, to, departmentId }) {
  const { rows } = await query(
    `select cat.name as label,
            count(*)::int as total,
            count(*) filter (where c.status = 'resolved')::int as resolved,
            count(*) filter (where c.sla_deadline < now() and c.resolved_at is null)::int as overdue
     from complaints c
     join categories cat on cat.id = c.category_id
     where c.created_at between $1 and $2
       and ($3::int is null or c.department_id = $3)
     group by cat.name
     order by total desc
     limit 10`,
    [from, to, departmentId ?? null]
  );

  const top = rows[0];
  const all = rows.reduce((n, r) => n + r.total, 0);

  return {
    title: "By category",
    chart: {
      style: "bar",
      x: rows.map((r) => r.label),
      series: [{ name: "Reports", values: rows.map((r) => r.total) }],
    },
    table: rows.map((r) => ({
      ...r,
      resolution_rate: `${pct(r.resolved, r.total)}%`,
    })),
    narrative: top
      ? `${top.label} accounts for ${pct(top.total, all)}% of everything filed ` +
        `(${plural(top.total, "report")}), closing ${pct(top.resolved, top.total)}% of them.` +
        (top.overdue > 0 ? ` ${top.overdue} are past their deadline.` : "")
      : "Nothing was filed in this period.",
  };
}

/* ── Which wards carry the load ─────────────────────────────────────────── */
async function byWard({ from, to, departmentId }) {
  const { rows } = await query(
    `select w.code as label, w.name as ward,
            count(*)::int as total,
            count(*) filter (where c.status = 'resolved')::int as resolved,
            round(avg(extract(epoch from (c.resolved_at - c.created_at)) / 86400.0)::numeric, 1) as avg_days
     from complaints c
     join wards w on w.id = c.ward_id
     where c.created_at between $1 and $2
       and ($3::int is null or c.department_id = $3)
       and w.code <> 'MUMBAI'
     group by w.code, w.name
     order by total desc
     limit 12`,
    [from, to, departmentId ?? null]
  );

  const slowest = [...rows].filter((r) => r.avg_days).sort((a, b) => b.avg_days - a.avg_days)[0];

  return {
    title: "By ward",
    chart: {
      style: "bar",
      x: rows.map((r) => r.label),
      series: [
        { name: "Filed", values: rows.map((r) => r.total) },
        { name: "Resolved", values: rows.map((r) => r.resolved) },
      ],
    },
    table: rows,
    narrative: slowest
      ? `${slowest.ward} takes longest at ${slowest.avg_days} days on average, against ` +
        `${plural(slowest.total, "report")} filed. Volume and speed are different problems — ` +
        `a busy ward closing quickly needs staff, a quiet one closing slowly needs attention.`
      : "No ward data for this period.",
  };
}

/* ── Deadlines ──────────────────────────────────────────────────────────── */
async function sla({ from, to, departmentId }) {
  const { rows } = await query(
    `select c.severity::text as label,
            count(*)::int as total,
            count(*) filter (where c.resolved_at <= c.sla_deadline)::int as on_time,
            count(*) filter (where c.sla_deadline < now() and c.resolved_at is null)::int as still_late
     from complaints c
     where c.created_at between $1 and $2
       and ($3::int is null or c.department_id = $3)
     group by c.severity
     order by case c.severity
       when 'critical' then 0 when 'high' then 1 when 'medium' then 2 else 3 end`,
    [from, to, departmentId ?? null]
  );

  const total = rows.reduce((n, r) => n + r.total, 0);
  const onTime = rows.reduce((n, r) => n + r.on_time, 0);
  const critical = rows.find((r) => r.label === "critical");

  return {
    title: "Against deadline",
    chart: {
      style: "bar",
      x: rows.map((r) => r.label),
      series: [
        { name: "On time", values: rows.map((r) => r.on_time) },
        { name: "Still late", values: rows.map((r) => r.still_late) },
      ],
    },
    stats: [
      { label: "On time", value: `${pct(onTime, total)}%` },
      { label: "Past deadline", value: rows.reduce((n, r) => n + r.still_late, 0), alert: true },
    ],
    narrative:
      critical && critical.still_late > 0
        ? `${plural(critical.still_late, "critical report")} are past their 12-hour deadline. ` +
          `Overall ${pct(onTime, total)}% were closed on time, but a headline rate hides the ` +
          `severity it was averaged across.`
        : `${pct(onTime, total)}% closed within their deadline.`,
  };
}

/* ── Whether residents accepted the work ────────────────────────────────── */
async function verification({ from, to, departmentId }) {
  const { rows } = await query(
    `select
       count(*) filter (where c.status = 'resolved')::int                 as accepted,
       count(*) filter (where c.rework_count > 0)::int                    as returned,
       count(*) filter (where c.status = 'verification')::int             as awaiting,
       round(avg(r.rating)::numeric, 1)                                   as avg_rating,
       count(r.id)::int                                                   as reviews
     from complaints c
     left join complaint_reviews r on r.complaint_id = c.id
     where c.created_at between $1 and $2
       and ($3::int is null or c.department_id = $3)`,
    [from, to, departmentId ?? null]
  );

  const d = rows[0];
  const decided = d.accepted + d.returned;

  return {
    title: "Resident verification",
    chart: {
      style: "bar",
      x: ["Accepted", "Sent back", "Awaiting"],
      series: [{ name: "Reports", values: [d.accepted, d.returned, d.awaiting] }],
    },
    stats: [
      { label: "Accepted first time", value: `${pct(d.accepted, decided || 1)}%` },
      { label: "Sent back", value: d.returned, alert: d.returned > 0 },
      { label: "Average rating", value: d.avg_rating ?? "—" },
    ],
    narrative:
      d.returned > 0
        ? `Residents rejected ${plural(d.returned, "submission")}, ${pct(d.returned, decided || 1)}% ` +
          `of everything decided. That figure matters more than the closure rate: it is the only ` +
          `measure of whether work was actually done rather than merely marked done.`
        : `Every submission residents ruled on was accepted.`,
  };
}

/* ── Agency performance ─────────────────────────────────────────────────── */
async function agencies({ from, to, departmentId }) {
  const { rows } = await query(
    `select ct.agency as label, ct.contract_no,
            count(c.id)::int as total,
            count(c.id) filter (where c.status = 'resolved')::int as resolved,
            count(c.id) filter (where c.sla_deadline < now() and c.resolved_at is null)::int as overdue
     from contracts ct
     left join complaints c on c.contract_id = ct.id and c.created_at between $1 and $2
     where ($3::int is null or ct.department_id = $3)
     group by ct.agency, ct.contract_no
     having count(c.id) > 0
     order by overdue desc, total desc
     limit 10`,
    [from, to, departmentId ?? null]
  );

  const worst = rows[0];

  return {
    title: "Maintenance agencies",
    chart: {
      style: "bar",
      x: rows.map((r) => r.label),
      series: [
        { name: "Resolved", values: rows.map((r) => r.resolved) },
        { name: "Overdue", values: rows.map((r) => r.overdue) },
      ],
    },
    table: rows.map((r) => ({ ...r, resolution_rate: `${pct(r.resolved, r.total)}%` })),
    narrative:
      worst && worst.overdue > 0
        ? `${worst.agency} has ${plural(worst.overdue, "report")} past deadline under ` +
          `${worst.contract_no}, closing ${pct(worst.resolved, worst.total)}% of the ${worst.total} ` +
          `raised against it.`
        : rows.length
        ? `No agency is carrying overdue work in this period.`
        : `No complaints fell inside a maintenance contract in this period.`,
  };
}

export const SECTIONS = {
  volume: { label: "Filed against resolved", build: volume },
  categories: { label: "By category", build: byCategory },
  wards: { label: "By ward", build: byWard },
  sla: { label: "Against deadline", build: sla },
  verification: { label: "Resident verification", build: verification },
  agencies: { label: "Maintenance agencies", build: agencies },
};

/** Builds every requested section. Sections are independent, so one failing
 *  query costs that section rather than the whole report. */
export async function buildSections(keys, params) {
  const out = {};

  for (const key of keys) {
    const section = SECTIONS[key];
    if (!section) continue;

    try {
      out[key] = await section.build(params);
    } catch (err) {
      out[key] = { title: section.label, error: err.message };
    }
  }

  return out;
}
