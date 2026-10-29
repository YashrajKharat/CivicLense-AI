import { Router } from "express";
import { query } from "../db/pool.js";
import { requireAuth, requireMinRole } from "../middleware/auth.js";
import { wrap } from "../middleware/errors.js";

const router = Router();
router.use(requireAuth, requireMinRole("super_admin"));

router.get(
  "/",
  wrap(async (req, res) => {
    const scope = req.user.role === "global_admin" ? null : req.user.departmentId;

    const { rows: contracts } = await query(
      `select ct.contract_no, ct.scope, ct.agency, ct.starts_on, ct.ends_on,
              case when ct.ends_on < current_date + interval '90 days'
                   then 'expiring' else 'active' end as status,
              coalesce(string_agg(distinct w.code, ' / '), '—') as coverage,
              count(c.id) as linked,
              count(c.id) filter (where c.status = 'resolved') as resolved,
              count(c.id) filter (where c.sla_deadline < now() and c.resolved_at is null) as overdue
       from contracts ct
       left join complaints c on c.contract_id = ct.id
       -- A contract really does span several wards, so this one aggregates
       -- rather than being deduplicated.
       left join wards w on st_intersects(w.geom, ct.coverage) and w.code <> 'MUMBAI'
       where ($1::int is null or ct.department_id = $1)
       group by ct.id
       order by overdue desc`,
      [scope]
    );

    res.json({
      contracts,
      stats: {
        active: contracts.filter((c) => c.status === "active").length,
        expiring: contracts.filter((c) => c.status === "expiring").length,
        with_open: contracts.filter((c) => c.linked > c.resolved).length,
        breaching: contracts.filter((c) => c.overdue > 0).length,
      },
    });
  })
);

export default router;
