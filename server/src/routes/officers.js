import { Router } from "express";
import { query } from "../db/pool.js";
import { requireAuth, requireMinRole } from "../middleware/auth.js";
import { wrap, notFound } from "../middleware/errors.js";
import { getAIOfficerRecommendation } from "../services/aiAssignment.js";

const router = Router();
router.use(requireAuth, requireMinRole("super_admin"));

/* GET /api/officers */
router.get(
  "/",
  wrap(async (req, res) => {
    const scope = req.user.role === "global_admin" ? null : req.user.departmentId;
    const { rows } = await query(
      `select o.id, p.full_name as name, p.email, o.work_phone, d.name as department,
              count(c.id) filter (where c.status not in ('resolved','rejected')) as active_cases,
              count(c.id) filter (where c.status = 'resolved')                    as resolved_cases,
              round(avg(extract(epoch from (c.resolved_at - c.created_at)) / 86400.0)::numeric, 1) as avg_days,
              round(100.0 * count(c.id) filter (where c.resolved_at <= c.sla_deadline)
                    / nullif(count(c.id) filter (where c.resolved_at is not null), 0)) as sla,
              round(coalesce(avg(f.rating), 0)::numeric, 1) as rating
       from officers o
       join profiles p on p.id = o.id
       join departments d on d.id = o.department_id
       left join complaints c on c.assigned_officer = o.id
       left join complaint_feedback f on f.complaint_id = c.id
       where o.active and ($1::int is null or o.department_id = $1)
       group by o.id, p.full_name, p.email, o.work_phone, d.name
       order by active_cases desc`,
      [scope]
    );
    res.json({ officers: rows });
  })
);

/**
 * GET /api/officers/ai-recommendation?complaint=CP-1234
 * Multi-factor AI analysis across Workload, Resolved cases, Ratings, Speed (avg days), and SLA.
 */
router.get(
  "/ai-recommendation",
  wrap(async (req, res) => {
    if (!req.query.complaint) throw notFound("Complaint reference required.");
    const recommendation = await getAIOfficerRecommendation(req.query.complaint);
    res.json(recommendation);
  })
);

/**
 * GET /api/officers/suggest?complaint=CP-1234
 * Backwards-compatible suggest route powered by AI scoring.
 */
router.get(
  "/suggest",
  wrap(async (req, res) => {
    if (!req.query.complaint) throw notFound("Complaint reference required.");
    const result = await getAIOfficerRecommendation(req.query.complaint);
    res.json({
      suggested: result.recommended,
      alternatives: result.officers.slice(1, 4),
      reasons: result.recommended?.strengths || [],
      analysis: result.analysis,
    });
  })
);

/**
 * GET /api/officers/:id — the full record behind a name.
 *
 * Caseload alone flatters an officer who closes things fast and badly, so the
 * resident reviews sit alongside it. Speed and quality are separate columns
 * because they fail independently.
 */
router.get(
  "/:id",
  wrap(async (req, res) => {
    const scope = req.user.role === "global_admin" ? null : req.user.departmentId;

    const { rows } = await query(
      `select o.id, p.full_name as name, p.email, p.language, o.work_phone,
              d.id as department_id, d.name as department,
              o.designation, o.employee_id, o.active,
              o.approved_at, approver.full_name as approved_by,
              st_y(o.base_location::geometry) as lat,
              st_x(o.base_location::geometry) as lng,
              o.specializations
       from officers o
       join profiles p on p.id = o.id
       left join departments d on d.id = o.department_id
       left join profiles approver on approver.id = o.approved_by
       where o.id = $1 and ($2::int is null or o.department_id = $2)`,
      [req.params.id, scope]
    );

    const officer = rows[0];
    if (!officer) throw notFound("Officer");

    const [stats, workload, reviews, weekly] = await Promise.all([
      query(
        `select
           count(*) filter (where status not in ('resolved','rejected'))::int as open_cases,
           count(*) filter (where status = 'resolved')::int                    as resolved,
           count(*) filter (where status = 'reopened')::int                    as reopened,
           count(*) filter (where sla_deadline < now() and resolved_at is null)::int as overdue,
           round(avg(extract(epoch from (resolved_at - created_at)) / 86400.0)::numeric, 1) as avg_days,
           round(100.0 * count(*) filter (where resolved_at <= sla_deadline)
                 / nullif(count(*) filter (where resolved_at is not null), 0))  as sla
         from complaints where assigned_officer = $1`,
        [req.params.id]
      ),
      query(
        `select c.ref, cat.name as category, c.severity, c.status, c.created_at,
                c.sla_deadline, c.address, w.code as ward_code,
                st_y(c.location::geometry) as lat, st_x(c.location::geometry) as lng,
                (c.sla_deadline < now() and c.resolved_at is null) as overdue
         from complaints c
         left join categories cat on cat.id = c.category_id
         left join wards w on w.id = c.ward_id
         where c.assigned_officer = $1 and c.status not in ('resolved','rejected')
         order by
           case c.severity when 'critical' then 0 when 'high' then 1
                           when 'medium' then 2 else 3 end,
           c.sla_deadline asc
         limit 50`,
        [req.params.id]
      ),
      query(
        `select r.rating, r.speed_rating, r.quality_rating, r.comment,
                r.would_report_again, r.created_at,
                c.ref, cat.name as category
         from complaint_reviews r
         join complaints c on c.id = r.complaint_id
         left join categories cat on cat.id = c.category_id
         where c.assigned_officer = $1
         order by r.created_at desc
         limit 20`,
        [req.params.id]
      ),
      query(
        `select to_char(date_trunc('week', resolved_at), 'DD Mon') as week,
                count(*)::int as resolved
         from complaints
         where assigned_officer = $1 and resolved_at > now() - interval '10 weeks'
         group by 1 order by min(resolved_at)`,
        [req.params.id]
      ),
    ]);

    const scores = reviews.rows;
    const mean = (key) => {
      const vals = scores.map((r) => r[key]).filter(Boolean);
      return vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : null;
    };

    res.json({
      officer,
      stats: stats.rows[0],
      workload: workload.rows,
      weekly: weekly.rows,
      reviews: scores,
      ratings: {
        count: scores.length,
        overall: mean("rating"),
        speed: mean("speed_rating"),
        quality: mean("quality_rating"),
        would_report_again: scores.filter((r) => r.would_report_again === false).length,
      },
    });
  })
);

export default router;
