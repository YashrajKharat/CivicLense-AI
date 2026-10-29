import { Router } from "express";
import { query } from "../db/pool.js";
import { requireAuth, requireMinRole } from "../middleware/auth.js";
import { wrap, notFound } from "../middleware/errors.js";

const router = Router();
router.use(requireAuth, requireMinRole("super_admin"));

/**
 * GET /api/departments (or /api/admin/departments)
 * Returns all departments, each with comprehensive operational metrics,
 * SLA configurations, category coverage, department head, and all officers
 * with their individual performance metrics (workload, resolved works, rating, speed, SLA).
 */
router.get(
  "/",
  wrap(async (req, res) => {
    const scope = req.user.role === "global_admin" ? null : req.user.departmentId;

    // 1. Fetch departments with head info, complaints statistics, contracts and active clusters
    const { rows: departments } = await query(
      `select
         d.id,
         d.code,
         d.name,
         d.authority,
         d.sla_hours,
         head.id as head_id,
         head.full_name as head_name,
         head.email as head_email,
         head.phone as head_phone,
         count(c.id) as total_complaints,
         count(c.id) filter (where c.status not in ('resolved', 'rejected', 'withdrawn')) as open_complaints,
         count(c.id) filter (where c.status = 'resolved') as resolved_complaints,
         count(c.id) filter (where c.severity = 'critical' and c.status not in ('resolved', 'rejected', 'withdrawn')) as critical_cases,
         count(c.id) filter (where c.severity = 'high' and c.status not in ('resolved', 'rejected', 'withdrawn')) as high_cases,
         count(c.id) filter (where c.sla_deadline < now() and c.resolved_at is null and c.status not in ('resolved', 'rejected', 'withdrawn')) as sla_breached,
         round(100.0 * count(c.id) filter (where c.resolved_at is not null and c.resolved_at <= c.sla_deadline)
               / nullif(count(c.id) filter (where c.resolved_at is not null), 0), 1) as sla_rate,
         round(avg(extract(epoch from (c.resolved_at - c.created_at)) / 86400.0)::numeric, 1) as avg_resolution_days,
         round(coalesce(avg(f.rating), 0)::numeric, 1) as avg_rating,
         count(f.complaint_id) as total_feedback_count
       from departments d
       left join lateral (
         select p.id, p.full_name, p.email, p.phone
         from profiles p
         join officers o on o.id = p.id
         where o.department_id = d.id and p.role in ('super_admin', 'dept_admin')
         order by p.created_at asc
         limit 1
       ) head on true
       left join complaints c on c.department_id = d.id and c.status <> 'withdrawn'
       left join complaint_feedback f on f.complaint_id = c.id
       where ($1::int is null or d.id = $1)
       group by d.id, d.code, d.name, d.authority, d.sla_hours, head.id, head.full_name, head.email, head.phone
       order by d.id asc`,
      [scope]
    );

    // 2. Fetch categories mapped to each department
    const { rows: categories } = await query(
      `select id, code, name, default_department_id as department_id
       from categories
       order by name asc`
    );

    // 3. Fetch active contracts mapped to each department
    const { rows: contracts } = await query(
      `select id, contract_no, scope, agency, department_id, starts_on, ends_on, sla_hours
       from contracts
       where ends_on >= current_date
       order by starts_on desc`
    );

    // 4. Fetch active clusters mapped to each department
    const { rows: clusters } = await query(
      `select id, ref, report_count, department_id, is_hotspot, is_emerging
       from clusters
       where status not in ('resolved', 'withdrawn')`
    );

    // 5. Fetch all officers belonging to departments with full performance metrics
    const { rows: officers } = await query(
      `select
         o.id,
         o.department_id,
         p.full_name as name,
         p.email,
         p.phone as profile_phone,
         o.work_phone,
         o.designation,
         o.employee_id,
         o.active,
         o.approved_at,
         o.specializations,
         st_y(o.base_location::geometry) as lat,
         st_x(o.base_location::geometry) as lng,
         count(c.id) filter (where c.status not in ('resolved','rejected','withdrawn')) as active_cases,
         count(c.id) filter (where c.status = 'resolved') as resolved_cases,
         count(c.id) filter (where c.severity = 'critical' and c.status not in ('resolved','rejected','withdrawn')) as critical_cases,
         round(avg(extract(epoch from (c.resolved_at - c.created_at)) / 86400.0)::numeric, 1) as avg_days,
         round(100.0 * count(c.id) filter (where c.resolved_at is not null and c.resolved_at <= c.sla_deadline)
               / nullif(count(c.id) filter (where c.resolved_at is not null), 0), 1) as sla,
         round(coalesce(avg(f.rating), 0)::numeric, 1) as rating,
         count(f.complaint_id) as reviews_count,
         w.code as primary_ward
       from officers o
       join profiles p on p.id = o.id
       left join complaints c on c.assigned_officer = o.id and c.status <> 'withdrawn'
       left join complaint_feedback f on f.complaint_id = c.id
       left join lateral (
         select w2.code
         from complaints c2
         join wards w2 on w2.id = c2.ward_id
         where c2.assigned_officer = o.id
         group by w2.code
         order by count(*) desc
         limit 1
       ) w on true
       where p.role = 'officer' or o.active = true
       group by o.id, o.department_id, p.full_name, p.email, p.phone, o.work_phone, o.designation, o.employee_id, o.active, o.approved_at, o.specializations, o.base_location, w.code
       order by active_cases desc, p.full_name asc`
    );

    // 6. Fetch recent active assignments for officers
    const { rows: recentCases } = await query(
      `select c.id, c.ref, c.assigned_officer, cat.name as category, c.severity, c.status, c.address, c.created_at
       from complaints c
       left join categories cat on cat.id = c.category_id
       where c.assigned_officer is not null and c.status not in ('resolved', 'rejected', 'withdrawn')
       order by c.created_at desc`
    );

    // Group items under departments
    const categoriesByDept = {};
    for (const cat of categories) {
      if (!categoriesByDept[cat.department_id]) categoriesByDept[cat.department_id] = [];
      categoriesByDept[cat.department_id].push(cat);
    }

    const contractsByDept = {};
    for (const ct of contracts) {
      if (!contractsByDept[ct.department_id]) contractsByDept[ct.department_id] = [];
      contractsByDept[ct.department_id].push(ct);
    }

    const clustersByDept = {};
    for (const cl of clusters) {
      if (!clustersByDept[cl.department_id]) clustersByDept[cl.department_id] = [];
      clustersByDept[cl.department_id].push(cl);
    }

    const recentCasesByOfficer = {};
    for (const rc of recentCases) {
      if (!recentCasesByOfficer[rc.assigned_officer]) recentCasesByOfficer[rc.assigned_officer] = [];
      if (recentCasesByOfficer[rc.assigned_officer].length < 3) {
        recentCasesByOfficer[rc.assigned_officer].push(rc);
      }
    }

    const officersWithCases = officers.map((o) => ({
      ...o,
      recent_cases: recentCasesByOfficer[o.id] || [],
    }));

    const officersByDept = {};
    for (const off of officersWithCases) {
      if (!officersByDept[off.department_id]) officersByDept[off.department_id] = [];
      officersByDept[off.department_id].push(off);
    }

    const result = departments.map((d) => {
      const deptOfficers = officersByDept[d.id] || [];
      const deptContracts = contractsByDept[d.id] || [];
      const deptClusters = clustersByDept[d.id] || [];
      const deptCategories = categoriesByDept[d.id] || [];

      return {
        ...d,
        categories: deptCategories,
        contracts: deptContracts,
        active_contracts_count: deptContracts.length,
        hotspots_count: deptClusters.filter((c) => c.is_hotspot).length,
        emerging_clusters_count: deptClusters.filter((c) => c.is_emerging).length,
        total_clusters_count: deptClusters.length,
        officers_count: deptOfficers.length,
        officers: deptOfficers,
      };
    });

    res.json({
      departments: result,
      summary: {
        total_departments: departments.length,
        total_officers: officers.length,
        total_open_cases: departments.reduce((acc, d) => acc + Number(d.open_complaints || 0), 0),
        total_resolved_cases: departments.reduce((acc, d) => acc + Number(d.resolved_complaints || 0), 0),
        total_sla_breached: departments.reduce((acc, d) => acc + Number(d.sla_breached || 0), 0),
        avg_city_sla: Math.round(
          departments.reduce((acc, d) => acc + (d.sla_rate ? Number(d.sla_rate) : 0), 0) /
            (departments.filter((d) => d.sla_rate != null).length || 1)
        ),
      },
    });
  })
);

/**
 * GET /api/departments/:id
 * Single department deep dive.
 */
router.get(
  "/:id",
  wrap(async (req, res) => {
    const scope = req.user.role === "global_admin" ? null : req.user.departmentId;
    if (scope && Number(req.params.id) !== Number(scope)) {
      throw notFound("Department not in user scope.");
    }

    const { rows } = await query(
      `select d.* from departments d where d.id = $1`,
      [req.params.id]
    );
    if (!rows[0]) throw notFound("Department");

    res.json({ department: rows[0] });
  })
);

export default router;
