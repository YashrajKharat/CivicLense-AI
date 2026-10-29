import { Router } from "express";
import { query } from "../db/pool.js";
import { clusterBrief } from "../services/narrate.js";
import { requireAuth, requireMinRole } from "../middleware/auth.js";
import { wrap, notFound } from "../middleware/errors.js";
import { detectEmerging } from "../services/clustering.js";

const router = Router();
router.use(requireAuth, requireMinRole("officer"));

const slaState = (deadline) => {
  if (!deadline) return "within";
  const left = new Date(deadline) - Date.now();
  if (left < 0) return "breached";
  if (left < 6 * 3600 * 1000) return "approaching";
  return "within";
};

/* GET /api/clusters */
router.get(
  "/",
  wrap(async (req, res) => {
    const scope = req.user.role === "global_admin" ? null : req.user.departmentId;

    const { rows } = await query(
      `select c.ref, cat.name as category, w.code as ward,
              c.report_count, c.citizen_count, c.radius_m, c.trend_pct,
              c.first_reported, c.last_reported, c.is_hotspot,
              min(cp.sla_deadline) as earliest_deadline
       from clusters c
       left join categories cat on cat.id = c.category_id
       -- A point falls inside both its own ward and the city-wide catch-all, so
       -- a plain join duplicated every cluster. Smallest area wins.
       left join lateral (
         select w.code from wards w
         where st_intersects(w.geom, c.centroid)
         order by st_area(w.geom::geometry) asc
         limit 1
       ) w on true
       left join complaints cp on cp.cluster_id = c.id and cp.resolved_at is null
       where ($1::int is null or c.department_id = $1) and c.status <> 'resolved'
       group by c.ref, cat.name, w.code, c.report_count, c.citizen_count,
                c.radius_m, c.trend_pct, c.first_reported, c.last_reported, c.is_hotspot
       order by c.report_count desc`,
      [scope]
    );

    const emerging = await detectEmerging();

    res.json({
      clusters: rows.map((r) => ({
        ...r,
        location: r.ward ? `Ward ${r.ward}` : "Unassigned",
        sla: slaState(r.earliest_deadline),
      })),
      emerging,
    });
  })
);

/* GET /api/clusters/:ref */
router.get(
  "/:ref",
  wrap(async (req, res) => {
    const { rows } = await query(
      `select c.*, cat.name as category, w.code as ward_code,
              st_y(c.centroid::geometry) as lat, st_x(c.centroid::geometry) as lng,
              d.name as department_name, ct.contract_no, ct.agency, ct.ends_on as contract_ends
       from clusters c
       left join categories cat on cat.id = c.category_id
       left join lateral (
         select w.code from wards w
         where st_intersects(w.geom, c.centroid)
         order by st_area(w.geom::geometry) asc
         limit 1
       ) w on true
       left join departments d on d.id = c.department_id
       left join contracts ct on ct.id = c.contract_id
       where c.ref = $1`,
      [req.params.ref]
    );
    const c = rows[0];
    if (!c) throw notFound("Group");

    const { rows: reports } = await query(
      `select cp.ref, cp.created_at, p.full_name as citizen_name,
              st_y(cp.location::geometry) as lat, st_x(cp.location::geometry) as lng,
              cp.severity,
              -- round(x, n) exists only for numeric, so st_distance's double
              -- precision has to be cast before it gets there.
              greatest(0, round((100 * (1 - st_distance(cp.location, $2::geography)
                                / greatest(c2.radius_m, 1)))::numeric))::int as match_score
       from complaints cp
       join clusters c2 on c2.id = cp.cluster_id
       left join profiles p on p.id = cp.citizen_id
       where c2.ref = $1
       order by cp.created_at desc`,
      [req.params.ref, c.centroid]
    );

    const { rows: officer } = await query(
      `select p.full_name as name, o.id,
              count(*) filter (where cp.status not in ('resolved','rejected')) as active_cases,
              round((st_distance(o.base_location, $2::geography)/1000.0)::numeric, 1) || ' km' as distance,
              94 as sla
       from officers o
       join profiles p on p.id = o.id
       left join complaints cp on cp.assigned_officer = o.id
       where o.department_id = $1 and o.active
       group by p.full_name, o.id, o.base_location
       order by active_cases asc, st_distance(o.base_location, $2::geography) asc
       limit 1`,
      [c.department_id, c.centroid]
    );

    res.json({
      ...c,
      location: c.ward_code ? `Ward ${c.ward_code}` : "Unassigned",
      sla: slaState(c.earliest_deadline),
      reports,
      suggested_officer: officer[0] || null,
      responsibility: {
        ward_code: c.ward_code,
        department_name: c.department_name,
        contract_no: c.contract_no,
        agency: c.agency,
        contract_ends: c.contract_ends,
      },
    });
  })
);

/* POST /api/clusters/:ref/brief — written summary for administrators. */
router.post(
  "/:ref/brief",
  wrap(async (req, res) => {
    const { rows } = await query(
      `select cl.ref, cl.report_count, cl.citizen_count, cl.radius_m,
              cl.first_reported, cl.last_reported,
              cat.name as category, d.name as department,
              count(c.id) filter (where c.sla_deadline < now()
                                    and c.resolved_at is null)::int as sla_breached
       from clusters cl
       left join categories cat on cat.id = cl.category_id
       left join departments d on d.id = cl.department_id
       left join complaints c on c.cluster_id = cl.id
       where cl.ref = $1
       group by cl.ref, cl.report_count, cl.citizen_count, cl.radius_m,
                cl.first_reported, cl.last_reported, cat.name, d.name`,
      [req.params.ref]
    );

    if (!rows[0]) throw notFound("Group");

    // Assembled from the group's own shape rather than written by a model.
    // How fast it grew and how many separate people reported it are facts, and
    // a sentence built from them says more than a paraphrase of them would.
    res.json(clusterBrief(rows[0]));
  })
);


export default router;
