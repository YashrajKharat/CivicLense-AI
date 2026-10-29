import { z } from "zod";
import { query } from "../db/pool.js";
import { getAIOfficerRecommendation } from "../services/aiAssignment.js";

/**
 * The agent's tool surface.
 *
 * Three rules shape this file:
 *
 * 1. Scope is enforced here, not in the prompt. Every query takes the caller's
 *    department as a parameter, so a department admin's agent cannot read
 *    another department's rows even if the model is talked into asking.
 *
 * 2. Reads execute immediately. Writes never do — they return a proposal that a
 *    named human approves. See runner.js.
 *
 * 3. Some actions have no tool at all. There is deliberately no way for the
 *    agent to resolve a complaint, reject a resident's report, edit the audit
 *    log, or change a role. Those are absent rather than guarded, because an
 *    absent capability cannot be argued around.
 */

const scopeOf = (ctx) => (ctx.role === "global_admin" ? null : ctx.departmentId);

export const TOOLS = {
  /* ---------------- reads ---------------- */

  search_complaints: {
    readOnly: true,
    description:
      "Find complaints by any combination of ward, category, status, severity and age in days. Returns up to 25 rows, newest first.",
    params: z.object({
      ward: z.string().optional(),
      category: z.string().optional(),
      status: z.string().optional(),
      severity: z.enum(["critical", "high", "medium", "low"]).optional(),
      max_age_days: z.number().int().min(1).max(365).optional(),
      overdue_only: z.boolean().optional(),
    }),
    async run(args, ctx) {
      const { rows } = await query(
        `select c.ref, cat.name as category, w.code as ward, c.severity, c.status,
                c.created_at, c.sla_deadline, p.full_name as officer,
                (c.sla_deadline < now() and c.resolved_at is null) as overdue
         from complaints c
         left join categories cat on cat.id = c.category_id
         left join wards w on w.id = c.ward_id
         left join profiles p on p.id = c.assigned_officer
         where ($1::int is null or c.department_id = $1)
           and ($2::text is null or w.code ilike $2)
           and ($3::text is null or cat.name ilike '%' || $3 || '%')
           and ($4::text is null or c.status::text = $4)
           and ($5::text is null or c.severity::text = $5)
           and ($6::int is null or c.created_at > now() - ($6 || ' days')::interval)
           and ($7::bool is not true or (c.sla_deadline < now() and c.resolved_at is null))
         order by c.created_at desc
         limit 25`,
        [scopeOf(ctx), args.ward ?? null, args.category ?? null, args.status ?? null,
         args.severity ?? null, args.max_age_days ?? null, args.overdue_only ?? null]
      );
      return { count: rows.length, complaints: rows };
    },
  },

  get_complaint: {
    readOnly: true,
    description: "Full detail for one complaint by reference, including its analysis and status history.",
    params: z.object({ ref: z.string() }),
    async run(args, ctx) {
      const { rows } = await query(
        `select c.ref, cat.name as category, w.code as ward, d.name as department,
                c.severity, c.severity_score, c.status, c.ai_confidence, c.authenticity,
                c.created_at, c.sla_deadline, c.resolved_at, c.escalation_level,
                a.summary as analysis, cl.ref as cluster_ref, ct.contract_no, ct.agency,
                p.full_name as officer
         from complaints c
         left join categories cat on cat.id = c.category_id
         left join wards w on w.id = c.ward_id
         left join departments d on d.id = c.department_id
         left join complaint_ai_analysis a on a.complaint_id = c.id
         left join clusters cl on cl.id = c.cluster_id
         left join contracts ct on ct.id = c.contract_id
         left join profiles p on p.id = c.assigned_officer
         where c.ref = $1 and ($2::int is null or c.department_id = $2)`,
        [args.ref, scopeOf(ctx)]
      );
      if (!rows[0]) return { found: false, note: "No complaint with that reference in your scope." };

      const { rows: history } = await query(
        `select h.to_status, h.at, p.full_name as actor
         from complaint_status_history h
         left join profiles p on p.id = h.actor
         join complaints c on c.id = h.complaint_id
         where c.ref = $1 order by h.at`,
        [args.ref]
      );
      return { found: true, complaint: rows[0], history };
    },
  },

  list_clusters: {
    readOnly: true,
    description:
      "Grouped reports, ordered by size. Use hotspots_only for declared hotspots, emerging_only for groups whose report rate is accelerating.",
    params: z.object({
      hotspots_only: z.boolean().optional(),
      emerging_only: z.boolean().optional(),
      limit: z.number().int().min(1).max(20).optional(),
    }),
    async run(args, ctx) {
      const { rows } = await query(
        `select cl.ref, cat.name as category, w.code as ward, cl.report_count,
                cl.citizen_count, cl.radius_m, cl.trend_pct, cl.is_hotspot, cl.is_emerging,
                cl.first_reported, cl.last_reported, ct.contract_no, ct.agency
         from clusters cl
         left join categories cat on cat.id = cl.category_id
         left join lateral (
         select w.code from wards w
         where st_intersects(w.geom, cl.centroid)
         order by st_area(w.geom::geometry) asc
         limit 1
       ) w on true
         left join contracts ct on ct.id = cl.contract_id
         where ($1::int is null or cl.department_id = $1)
           and cl.status <> 'resolved'
           and ($2::bool is not true or cl.is_hotspot)
           and ($3::bool is not true or cl.is_emerging)
         order by cl.report_count desc
         limit $4`,
        [scopeOf(ctx), args.hotspots_only ?? null, args.emerging_only ?? null, args.limit ?? 10]
      );
      return { count: rows.length, clusters: rows };
    },
  },

  department_stats: {
    readOnly: true,
    description: "Volume, backlog, SLA breaches and resolution rate per department over a window of days.",
    params: z.object({ days: z.number().int().min(1).max(365).optional() }),
    async run(args, ctx) {
      const { rows } = await query(
        `select d.name as department,
                count(c.id)::int                                                          as total,
                count(c.id) filter (where c.status not in ('resolved','rejected'))::int   as open,
                count(c.id) filter (where c.severity = 'critical')::int                   as critical,
                count(c.id) filter (where c.sla_deadline < now() and c.resolved_at is null)::int as breached,
                round(100.0 * count(c.id) filter (where c.status = 'resolved')
                      / nullif(count(c.id), 0), 1)                                        as resolution_rate,
                round(avg(extract(epoch from (c.resolved_at - c.created_at)) / 86400.0)::numeric, 1) as avg_days
         from departments d
         left join complaints c
           on c.department_id = d.id
          and c.created_at > now() - (($1)::text || ' days')::interval
         where ($2::int is null or d.id = $2)
         group by d.name
         order by open desc`,
        [args.days ?? 30, scopeOf(ctx)]
      );
      return { window_days: args.days ?? 30, departments: rows };
    },
  },

  officer_workload: {
    readOnly: true,
    description: "Open case count, closed count and SLA compliance for every active officer in scope.",
    params: z.object({}),
    async run(_args, ctx) {
      const { rows } = await query(
        `select p.full_name as officer, d.name as department, o.id as officer_id,
                count(c.id) filter (where c.status not in ('resolved','rejected'))::int as open_cases,
                count(c.id) filter (where c.status = 'resolved')::int                   as resolved,
                round(100.0 * count(c.id) filter (where c.resolved_at <= c.sla_deadline)
                      / nullif(count(c.id) filter (where c.resolved_at is not null), 0)) as sla_compliance
         from officers o
         join profiles p on p.id = o.id
         join departments d on d.id = o.department_id
         left join complaints c on c.assigned_officer = o.id
         where o.active and ($1::int is null or o.department_id = $1)
         group by p.full_name, d.name, o.id
         order by open_cases desc`,
        [scopeOf(ctx)]
      );
      return { officers: rows };
    },
  },

  contract_performance: {
    readOnly: true,
    description:
      "Per-contract complaint linkage: how many reports fall inside each maintenance contract and how many are overdue.",
    params: z.object({ overdue_only: z.boolean().optional() }),
    async run(args, ctx) {
      const { rows } = await query(
        `select ct.contract_no, ct.agency, ct.scope, ct.ends_on,
                count(c.id)::int as linked,
                count(c.id) filter (where c.status = 'resolved')::int as resolved,
                count(c.id) filter (where c.sla_deadline < now() and c.resolved_at is null)::int as overdue
         from contracts ct
         left join complaints c on c.contract_id = ct.id
         where ($1::int is null or ct.department_id = $1)
         group by ct.id
         having ($2::bool is not true
                 or count(c.id) filter (where c.sla_deadline < now() and c.resolved_at is null) > 0)
         order by overdue desc`,
        [scopeOf(ctx), args.overdue_only ?? null]
      );
      return { contracts: rows };
    },
  },

  ward_breakdown: {
    readOnly: true,
    description: "Complaint volume and critical count per ward, with the dominant category in each.",
    params: z.object({ days: z.number().int().min(1).max(365).optional() }),
    async run(args, ctx) {
      const { rows } = await query(
        `select w.code as ward,
                count(c.id)::int as total,
                count(c.id) filter (where c.severity = 'critical')::int as critical,
                count(c.id) filter (where c.status not in ('resolved','rejected'))::int as open,
                mode() within group (order by cat.name) as top_category
         from wards w
         left join complaints c
           on c.ward_id = w.id
          and c.created_at > now() - (($1)::text || ' days')::interval
          and ($2::int is null or c.department_id = $2)
         left join categories cat on cat.id = c.category_id
         group by w.code
         order by total desc`,
        [args.days ?? 30, scopeOf(ctx)]
      );
      return { window_days: args.days ?? 30, wards: rows };
    },
  },

  suggest_officer: {
    readOnly: true,
    description:
      "Rank and AI-evaluate candidate officers for a specific complaint based on workload, resolved cases, citizen ratings, turnaround time (avg days), and SLA reliability.",
    params: z.object({ ref: z.string() }),
    async run(args, ctx) {
      try {
        const result = await getAIOfficerRecommendation(args.ref);
        return {
          found: true,
          complaint_ref: result.complaint_ref,
          category: result.category,
          department: result.department,
          recommended_officer: result.recommended ? {
            id: result.recommended.id,
            name: result.recommended.name,
            score: result.recommended.scores?.total,
            open_cases: result.recommended.open_cases,
            resolved_cases: result.recommended.resolved_cases,
            avg_days: result.recommended.avg_days,
            avg_rating: result.recommended.avg_rating,
            sla_compliance: result.recommended.sla_compliance,
            strengths: result.recommended.strengths,
          } : null,
          ai_analysis: result.analysis,
          candidates: result.officers.map((o) => ({
            officer_id: o.id,
            officer: o.name,
            ai_score: o.scores?.total,
            open_cases: o.open_cases,
            resolved_cases: o.resolved_cases,
            avg_days: o.avg_days,
            avg_rating: o.avg_rating,
            sla_compliance: o.sla_compliance,
            strengths: o.strengths,
            distance_km: o.distance_km,
          })),
        };
      } catch (err) {
        return { found: false, error: err.message };
      }
    },
  },

  /* ---------------- writes: proposed, never executed by the agent ---------------- */

  propose_assignment: {
    readOnly: false,
    description:
      "Propose assigning an officer to a complaint. Produces an approval card for a human; it does not assign anything by itself.",
    params: z.object({
      ref: z.string(),
      officer_id: z.string().uuid(),
      reason: z.string().min(10).max(400),
    }),
    async preview(args, ctx) {
      const { rows } = await query(
        `select c.ref, cat.name as category, c.severity, p.full_name as current_officer,
                (select full_name from profiles where id = $2) as proposed_officer
         from complaints c
         left join categories cat on cat.id = c.category_id
         left join profiles p on p.id = c.assigned_officer
         where c.ref = $1 and ($3::int is null or c.department_id = $3)`,
        [args.ref, args.officer_id, scopeOf(ctx)]
      );
      if (!rows[0]) throw new Error("That complaint is not in your scope.");
      return {
        summary: `Assign ${rows[0].proposed_officer} to ${rows[0].ref} (${rows[0].category}, ${rows[0].severity})`,
        current: rows[0].current_officer || "unassigned",
        reason: args.reason,
      };
    },
  },

  propose_escalation: {
    readOnly: false,
    description:
      "Propose raising a complaint's escalation level. Produces an approval card; it does not escalate anything by itself.",
    params: z.object({ ref: z.string(), reason: z.string().min(10).max(400) }),
    async preview(args, ctx) {
      const { rows } = await query(
        `select c.ref, c.escalation_level, c.status, cat.name as category,
                (c.sla_deadline < now() and c.resolved_at is null) as overdue
         from complaints c
         left join categories cat on cat.id = c.category_id
         where c.ref = $1 and ($2::int is null or c.department_id = $2)`,
        [args.ref, scopeOf(ctx)]
      );
      if (!rows[0]) throw new Error("That complaint is not in your scope.");
      const next = Math.min(rows[0].escalation_level + 1, 2);
      return {
        summary: `Escalate ${rows[0].ref} from level ${rows[0].escalation_level} to ${next}`,
        overdue: rows[0].overdue,
        reason: args.reason,
      };
    },
  },

  propose_report: {
    readOnly: false,
    description:
      "Propose generating a period report. Produces an approval card; the report is only written once a human accepts.",
    params: z.object({
      from: z.string(),
      to: z.string(),
      sections: z.array(z.enum(["statistics", "hotspots", "sla", "officers", "contracts"])).min(1),
      reason: z.string().min(10).max(400),
    }),
    async preview(args) {
      return {
        summary: `Generate a report for ${args.from} to ${args.to} covering ${args.sections.join(", ")}`,
        reason: args.reason,
      };
    },
  },
};

/** The catalogue handed to the model, minus the implementations. */
export function toolCatalogue() {
  return Object.entries(TOOLS).map(([name, tool]) => ({
    name,
    description: tool.description,
    read_only: tool.readOnly,
    params: describe(tool.params),
  }));
}

/**
 * Renders a zod schema into something a model reads reliably.
 *
 * Deliberately avoids zod's internals: v3 and v4 disagree about `_def.shape`,
 * `_def.typeName` and how enums store their values, and a schema description is
 * not worth pinning a major version over. `.shape`, `.safeParse` and `.options`
 * are stable across both.
 */
function describe(schema) {
  const shape = schema.shape || {};

  return Object.fromEntries(
    Object.entries(shape).map(([key, field]) => {
      const optional = field.safeParse(undefined).success ? "optional" : "required";
      const options = unwrapEnum(field);
      const type = options ? `one of ${options.join("|")}` : baseType(field);
      return [key, `${type}, ${optional}`];
    })
  );
}

function unwrapEnum(field) {
  const def = field._def ?? {};
  const values =
    def.values ??                                   // zod 3
    (def.entries && Object.values(def.entries)) ??  // zod 4
    field.options;                                  // both, for ZodEnum
  if (Array.isArray(values) && values.every((v) => typeof v === "string")) return values;

  const inner = def.innerType ?? def.type;
  return inner && typeof inner === "object" ? unwrapEnum(inner) : null;
}

function baseType(field) {
  for (const [probe, name] of [
    ["text", "string"],
    [1, "number"],
    [true, "boolean"],
    [[], "array"],
  ]) {
    if (field.safeParse(probe).success) return name;
  }
  return "value";
}
