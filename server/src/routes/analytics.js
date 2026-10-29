import { Router } from "express";
import { query } from "../db/pool.js";
import { requireAuth, requireMinRole } from "../middleware/auth.js";
import { wrap } from "../middleware/errors.js";

const router = Router();
router.use(requireAuth, requireMinRole("super_admin"));

/* GET /api/analytics?days=30 */
router.get(
  "/",
  wrap(async (req, res) => {
    const days = Math.min(Number(req.query.days) || 30, 365);
    const scope = req.user.role === "global_admin" ? null : req.user.departmentId;
    const params = [days, scope];

    const [health, daily, byCategory, byWard, byDepartment, resolution, feedback] = await Promise.all([
      query(
        `select
           round(100.0*count(*) filter (where status='resolved')/nullif(count(*),0),1) as resolution_rate,
           round(100.0*count(*) filter (where resolved_at<=sla_deadline)
                 /nullif(count(*) filter (where resolved_at is not null),0),1)          as sla_compliance,
           round(avg(extract(epoch from (resolved_at-created_at))/86400.0)::numeric,2)  as avg_days,
           count(*) filter (where status='reopened')                                    as reopened
         from complaints
         where created_at > now() - ($1 || ' days')::interval and ($2::int is null or department_id=$2)`,
        params
      ),
      query(
        `select to_char(d.day,'DD Mon') as label, d.day,
                count(c.id) filter (where c.id is not null) as filed,
                count(c.id) filter (where c.status='resolved') as resolved
         from generate_series(now()-($1||' days')::interval, now(), '1 day') d(day)
         left join complaints c on date_trunc('day',c.created_at)=date_trunc('day',d.day)
              and ($2::int is null or c.department_id=$2)
         group by d.day order by d.day`,
        params
      ),
      query(
        `select cat.name as label, count(*) as value
         from complaints c left join categories cat on cat.id=c.category_id
         where c.created_at > now()-($1||' days')::interval and ($2::int is null or c.department_id=$2)
         group by cat.name order by value desc limit 10`,
        params
      ),
      query(
        `select w.code as label, count(*) as value,
                count(*) filter (where c.severity='critical') as critical
         from complaints c left join wards w on w.id=c.ward_id
         where c.created_at > now()-($1||' days')::interval and ($2::int is null or c.department_id=$2)
         group by w.code order by value desc`,
        params
      ),
      query(
        `select d.name as label, count(*) as value,
                round(100.0*count(*) filter (where c.status='resolved')/nullif(count(*),0),1) as resolved_pct
         from complaints c join departments d on d.id=c.department_id
         where c.created_at > now()-($1||' days')::interval and ($2::int is null or d.id=$2)
         group by d.name order by value desc`,
        params
      ),
      query(
        `select
           count(*) filter (where hours <= 24)              as within_day,
           count(*) filter (where hours > 24 and hours<=72) as within_three,
           count(*) filter (where hours > 72 and hours<=168) as within_week,
           count(*) filter (where hours > 168)              as beyond_week
         from (select extract(epoch from (resolved_at-created_at))/3600 as hours
               from complaints
               where resolved_at is not null
                 and created_at > now()-($1||' days')::interval
                 and ($2::int is null or department_id=$2)) t`,
        params
      ),
      query(
        `select count(*) filter (where resolved) as confirmed,
                count(*) filter (where not resolved) as disputed,
                round(avg(rating)::numeric,1) as avg_rating
         from complaint_feedback f join complaints c on c.id=f.complaint_id
         where f.at > now()-($1||' days')::interval and ($2::int is null or c.department_id=$2)`,
        params
      ),
    ]);

    res.json({
      period_days: days,
      health: health.rows[0],
      daily: daily.rows,
      by_category: byCategory.rows,
      by_ward: byWard.rows,
      by_department: byDepartment.rows,
      resolution_time: resolution.rows[0],
      feedback: feedback.rows[0],
    });
  })
);

export default router;
