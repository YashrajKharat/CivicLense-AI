import { Router } from "express";
import { query } from "../db/pool.js";
import { requireAuth, requireMinRole } from "../middleware/auth.js";
import { wrap } from "../middleware/errors.js";
import { signedUrl } from "../services/storage.js";
import { getOfficerCandidates, rankOfficersWithAI, executeBatchAIAutoAssignment } from "../services/aiAssignment.js";

const router = Router();
router.use(requireAuth, requireMinRole("super_admin"));

/* GET /api/admin/overview — everything the command centre first paints. */
router.get(
  "/overview",
  wrap(async (req, res) => {
    const scope = req.user.role === "global_admin" ? null : req.user.departmentId;

    const [stats, complaints, clusters, wards, departments, escalations] = await Promise.all([
      query(
        `select
           count(*)                                                              as total,
           count(*) filter (where created_at::date = current_date)               as today,
           count(*) filter (where severity = 'critical'
                              and status not in ('resolved','rejected'))         as critical,
           count(*) filter (where sla_deadline < now() and resolved_at is null)  as sla_breached,
           count(*) filter (where authenticity <> 'likely_genuine')              as flagged_images,
           round(100.0 * count(*) filter (where status = 'resolved')
                 / nullif(count(*),0), 1)                                        as resolution_rate
         from complaints
         where ($1::int is null or department_id = $1)`,
        [scope]
      ),
      query(
        `select c.ref, cat.name as category, c.severity,
                st_y(c.location::geometry) as lat, st_x(c.location::geometry) as lng
              , (select storage_path from complaint_images i
                 where i.complaint_id = c.id and i.role = 'report' limit 1) as image_path
         from complaints c
         left join categories cat on cat.id = c.category_id
         where ($1::int is null or c.department_id = $1)
           and c.status <> 'withdrawn'
           and c.location is not null
         order by c.created_at desc limit 300`,
        [scope]
      ),
      query(
        `select c.ref, cat.name as category, c.report_count,
                st_y(c.centroid::geometry) as lat, st_x(c.centroid::geometry) as lng,
                case when c.trend_pct > 50 then 'critical' else 'high' end as severity,
                count(*) filter (where c.is_hotspot) over () as hotspots,
                count(*) filter (where c.is_emerging) over () as emerging
         from clusters c
         left join categories cat on cat.id = c.category_id
         where ($1::int is null or c.department_id = $1)
           and c.status <> 'withdrawn'
           and c.status <> 'resolved'
           -- A cluster whose centroid never got computed cannot be plotted, and
           -- Leaflet throws rather than skipping it.
           and c.centroid is not null`,
        [scope]
      ),
      query(`select code, st_asgeojson(geom)::json as geojson from wards where geom is not null`),
      query(
        `select d.name,
                count(*) filter (where c.status not in ('resolved','rejected')) as open,
                least(100, round(100.0 * count(*) filter (where c.status not in ('resolved','rejected'))
                      / greatest(count(*),1))) as load
         from departments d left join complaints c on c.department_id = d.id
         where ($1::int is null or d.id = $1)
         group by d.name order by open desc`,
        [scope]
      ),
      query(
        `select c.ref, cat.name as category, w.code as ward, c.report_count
         from clusters c
         left join categories cat on cat.id = c.category_id
         left join lateral (
         select w.code from wards w
         where st_intersects(w.geom, c.centroid)
         order by st_area(w.geom::geometry) asc
         limit 1
       ) w on true
         where ($1::int is null or c.department_id = $1)
           and c.status <> 'withdrawn' and c.status <> 'resolved'
         order by c.report_count desc limit 5`,
        [scope]
      ),
    ]);

    res.json({
      stats: {
        ...stats.rows[0],
        hotspots: clusters.rows[0]?.hotspots ?? 0,
        emerging: clusters.rows[0]?.emerging ?? 0,
      },
      map: {
        // Signed per pin. A thumbnail in the popup is the difference between
        // "a dot on Kurla" and knowing at a glance whether it is worth sending
        // someone — the photograph is the whole basis of the report.
        complaints: await Promise.all(
          complaints.rows.map(async (r) => ({
            ...r,
            image_url: r.image_path ? await signedUrl(r.image_path, 3600) : null,
            image_path: undefined,
          }))
        ),
        clusters: clusters.rows,
        // Malformed geometry should cost one ward outline, not the whole map.
        wards: wards.rows
          .map((w) => {
            const ring = w.geojson?.coordinates?.[0]?.[0];
            if (!Array.isArray(ring) || ring.length < 3) return null;
            return { code: w.code, polygon: ring.map(([lng, lat]) => [lat, lng]) };
          })
          .filter(Boolean),
      },
      departments: departments.rows,
      escalations: escalations.rows.map((e) => ({ ...e, location: `Ward ${e.ward}` })),
    });
  })
);


/* GET /api/admin/complaints — the working list, with filters and assignment state. */
router.get(
  "/complaints",
  wrap(async (req, res) => {
    const scope = req.user.role === "global_admin" ? null : req.user.departmentId;
    const { status, severity, ward, unassigned, overdue, q, sort = "newest" } = req.query;

    const orderClause = {
      newest: "c.created_at desc",
      severity: "case c.severity when 'critical' then 0 when 'high' then 1 when 'medium' then 2 else 3 end, c.created_at desc",
      deadline: "(c.sla_deadline < now() and c.resolved_at is null) desc, c.sla_deadline asc nulls last",
      unassigned: "(c.assigned_officer is null) desc, c.created_at desc",
    }[sort] || "c.created_at desc";

    const { rows } = await query(
      `select c.ref, cat.name as category, c.severity, c.status, c.created_at,
              c.sla_deadline, c.address, w.code as ward_code, d.name as department,
              st_y(c.location::geometry) as lat, st_x(c.location::geometry) as lng,
              p.full_name as officer, c.assigned_officer,
              cl.ref as cluster_ref, cl.report_count as cluster_size,
              (c.sla_deadline < now() and c.resolved_at is null) as overdue,
              c.rework_count,
              exists (select 1 from resolution_proofs rp where rp.complaint_id = c.id) as has_proof,
              (select storage_path from complaint_images i
               where i.complaint_id = c.id and i.role = 'report' limit 1) as image_path
       from complaints c
       left join categories cat on cat.id = c.category_id
       left join wards w on w.id = c.ward_id
       left join departments d on d.id = c.department_id
       left join profiles p on p.id = c.assigned_officer
       left join clusters cl on cl.id = c.cluster_id
       where ($1::int is null or c.department_id = $1)
           and c.status <> 'withdrawn'
         -- "open" is not a status but the question people actually ask: what is
         -- still outstanding. Expanding it here means the meaning lives in one
         -- place rather than in every caller.
         and ($2::text is null or $2 = ''
              or ($2 = 'open' and c.status not in ('resolved','rejected','withdrawn'))
              or c.status::text = $2)
         and ($3::text is null or c.severity::text = $3)
         and ($4::text is null or w.code = $4)
         and ($5::bool is not true or c.assigned_officer is null)
         and ($6::bool is not true or (c.sla_deadline < now() and c.resolved_at is null))
         and ($7::text is null or c.ref ilike '%' || $7 || '%' or c.address ilike '%' || $7 || '%' or cat.name ilike '%' || $7 || '%')
       order by ${orderClause}
       limit 500`,
      [scope, status || null, severity || null, ward || null,
       unassigned === "true", overdue === "true", q || null]
    );

    const { rows: wards } = await query(`select distinct code from wards order by code`);

    const complaints = await Promise.all(
      rows.map(async (r) => ({
        ...r,
        image_url: r.image_path ? await signedUrl(r.image_path) : null,
      }))
    );

    res.json({ complaints, wards: wards.map((w) => w.code) });
  })
);

/* GET /api/admin/assignable?department= — approved, active officers only. */
router.get(
  "/assignable",
  wrap(async (req, res) => {
    /**
     * Officers who could take this specific complaint.
     *
     * Two things were wrong. It scoped to the *administrator's* department
     * rather than the *complaint's*, so a global admin — who has no department —
     * saw every officer in the city, and a water leak could be assigned to a
     * roads officer. What matters is which department owns the work, not who is
     * doing the assigning.
     *
     * And department heads appeared in the list. A head assigns work; they do
     * not carry it. Putting them among the officers invites exactly what
     * happened — a head assigned to their own complaints.
     */
    const { complaint } = req.query;
    let departmentId = req.user.role === "global_admin" ? null : req.user.departmentId;

    const { complaint: cMeta, officers } = await getOfficerCandidates({
      complaintRef: complaint,
      departmentId,
    });

    const aiResult = rankOfficersWithAI({
      complaint: cMeta,
      officers,
    });

    res.json({
      officers: aiResult.officers,
      ai_recommendation: aiResult.recommended,
      ai_analysis: aiResult.analysis,
      candidate_count: aiResult.candidate_count,
      weights_applied: aiResult.weights_applied,
      department: aiResult.department || null,
      scoped: Boolean(departmentId || cMeta?.department_id),
    });
  })
);

/* POST /api/admin/auto-assign-all — batch auto-assign all unassigned complaints across departments using AI */
router.post(
  "/auto-assign-all",
  wrap(async (req, res) => {
    const scope = req.user.role === "global_admin" ? null : req.user.departmentId;
    const { limit = 200 } = req.body || {};

    const result = await executeBatchAIAutoAssignment({
      departmentId: scope,
      limit: Math.min(Number(limit) || 200, 500),
      actorUserId: req.user.id,
    });

    res.json(result);
  })
);

export default router;
