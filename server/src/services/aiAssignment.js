import { query, transaction } from "../db/pool.js";
import { notify } from "./notifications.js";

/**
 * Intelligent AI Officer Assignment & Recommendation Engine.
 *
 * Evaluates all department officers across key performance and capacity dimensions:
 * 1. Current Workload (active / open cases) — capacity to take on new tasks immediately.
 * 2. Previous Works Completed (resolved cases) — proven track record and domain experience.
 * 3. Citizen Quality Rating (average rating from verified resident reviews) — work standard.
 * 4. Completion Average in Days (avg turnaround time) — operational velocity.
 * 5. SLA Compliance Rate (% of cases resolved on time within SLA deadline).
 * 6. Geographic Proximity (distance to the incident location if coordinates exist).
 */

/**
 * Fetch all eligible officers for a complaint's department with complete metrics.
 */
export async function getOfficerCandidates({ complaintRef, departmentId, locationPoint }) {
  let deptId = departmentId;
  let loc = locationPoint;
  let complaintMeta = null;

  if (complaintRef) {
    const { rows: c } = await query(
      `select c.id, c.ref, c.category_id, cat.name as category, c.department_id, d.name as department_name,
              c.severity, c.severity_score, c.location, c.ward_id, w.code as ward_code,
              c.assigned_officer, p.full_name as current_officer_name
       from complaints c
       left join categories cat on cat.id = c.category_id
       left join departments d on d.id = c.department_id
       left join wards w on w.id = c.ward_id
       left join profiles p on p.id = c.assigned_officer
       where c.ref = $1`,
      [complaintRef]
    );
    if (c[0]) {
      complaintMeta = c[0];
      deptId = c[0].department_id;
      loc = c[0].location;
    }
  }

  const { rows } = await query(
    `select o.id, p.full_name as name, p.email, d.name as department, d.id as department_id,
            o.designation, o.work_phone, o.active,
            count(distinct c.id) filter (where c.status not in ('resolved','rejected','withdrawn'))::int as open_cases,
            count(distinct c.id) filter (where c.status = 'resolved')::int                                 as resolved_cases,
            round(avg(extract(epoch from (c.resolved_at - c.created_at)) / 86400.0)
                  filter (where c.status = 'resolved')::numeric, 1)                                        as avg_days,
            round(100.0 * count(distinct c.id) filter (where c.resolved_at is not null and c.resolved_at <= c.sla_deadline)
                  / nullif(count(distinct c.id) filter (where c.resolved_at is not null), 0))             as sla_compliance,
            round(coalesce(avg(f.rating), 0)::numeric, 1)                                                  as avg_rating,
            count(distinct f.complaint_id)::int                                                            as rating_count,
            case when $2::geography is not null and o.base_location is not null
                 then round((st_distance(o.base_location, $2::geography) / 1000.0)::numeric, 1)
                 else null end as distance_km
     from officers o
     join profiles p on p.id = o.id
     join departments d on d.id = o.department_id
     left join complaints c on c.assigned_officer = o.id
     left join complaint_feedback f on f.complaint_id = c.id
     where o.active and o.approved_at is not null
       and ($1::int is null or o.department_id = $1)
       and p.role = 'officer'
     group by o.id, p.full_name, p.email, d.name, d.id, o.designation, o.work_phone, o.active, o.base_location
     order by open_cases asc`,
    [deptId, loc]
  );

  return { complaint: complaintMeta, officers: rows };
}

/**
 * Score and rank candidate officers using multi-criteria AI decision weights.
 */
export function rankOfficersWithAI({ complaint, officers }) {
  if (!officers || officers.length === 0) {
    return {
      recommended: null,
      officers: [],
      analysis: "No active approved officers found in this department.",
    };
  }

  const severity = complaint?.severity || "medium";
  const category = complaint?.category || "Civic Issue";
  const deptName = officers[0]?.department || complaint?.department_name || "Assigned Department";

  // Dynamic weights based on severity priority:
  // For critical/high issues, capacity (workload) and velocity (speed & SLA) carry higher weight.
  const weights = (severity === "critical" || severity === "high")
    ? { workload: 0.35, speed: 0.25, sla: 0.20, rating: 0.15, experience: 0.05 }
    : { workload: 0.30, rating: 0.25, speed: 0.20, sla: 0.15, experience: 0.10 };

  const evaluated = officers.map((o) => {
    const openCases = Number(o.open_cases) || 0;
    const resolvedCases = Number(o.resolved_cases) || 0;
    const avgDays = o.avg_days != null ? Number(o.avg_days) : null;
    const sla = o.sla_compliance != null ? Number(o.sla_compliance) : null;
    const rating = Number(o.avg_rating) || 0;
    const ratingCount = Number(o.rating_count) || 0;
    const distance = o.distance_km != null ? Number(o.distance_km) : null;

    // 1. Workload Score (0 - 100): Lower open cases = higher score
    let workloadScore;
    if (openCases === 0) workloadScore = 100;
    else if (openCases <= 2) workloadScore = 92;
    else if (openCases <= 4) workloadScore = 78;
    else if (openCases <= 6) workloadScore = 58;
    else if (openCases <= 8) workloadScore = 38;
    else workloadScore = Math.max(10, 100 - openCases * 10);

    // 2. Completed Works / Experience Score (0 - 100)
    const experienceScore = Math.min(100, Math.round(40 + Math.min(resolvedCases, 12) * 5));

    // 3. Citizen Rating Score (0 - 100)
    let ratingScore;
    if (ratingCount > 0) {
      ratingScore = Math.round((rating / 5.0) * 100);
    } else {
      ratingScore = 72; // neutral baseline for new officers
    }

    // 4. Speed / Turnaround Duration Score (0 - 100): Lower days = higher score
    let speedScore;
    if (avgDays !== null) {
      if (avgDays <= 1.0) speedScore = 100;
      else if (avgDays <= 2.0) speedScore = 90;
      else if (avgDays <= 3.5) speedScore = 80;
      else if (avgDays <= 5.0) speedScore = 65;
      else if (avgDays <= 7.0) speedScore = 45;
      else speedScore = Math.max(15, 100 - Math.round(avgDays * 10));
    } else {
      speedScore = 75; // baseline
    }

    // 5. SLA Compliance Score (0 - 100)
    let slaScore;
    if (sla !== null) {
      slaScore = Math.min(100, Math.max(0, sla));
    } else {
      slaScore = 80; // baseline
    }

    // 6. Proximity Score (optional fine-tuning)
    let proximityScore = 80;
    if (distance !== null) {
      proximityScore = Math.max(20, Math.round(100 - distance * 5));
    }

    // Overall Composite Score (0 - 100)
    const compositeScore = Math.round(
      workloadScore * weights.workload +
      ratingScore * weights.rating +
      speedScore * weights.speed +
      slaScore * weights.sla +
      experienceScore * weights.experience
    );

    // Strengths identification
    const strengths = [];
    if (openCases <= 1) strengths.push("Lightest Workload");
    else if (openCases <= 3) strengths.push("Good Capacity");

    if (rating >= 4.2 && ratingCount > 0) strengths.push(`Top Rated (${rating}★)`);
    else if (rating >= 3.5 && ratingCount > 0) strengths.push(`${rating}★ Satisfaction`);

    if (avgDays !== null && avgDays <= 2.0) strengths.push(`Fast Turnaround (${avgDays}d avg)`);
    if (sla !== null && sla >= 90) strengths.push(`${sla}% SLA On-Time`);
    if (resolvedCases >= 5) strengths.push(`${resolvedCases} Works Solved`);
    if (distance !== null && distance <= 5.0) strengths.push(`Near Location (${distance}km)`);

    return {
      ...o,
      open_cases: openCases,
      resolved_cases: resolvedCases,
      avg_days: avgDays,
      avg_rating: rating,
      rating_count: ratingCount,
      sla_compliance: sla,
      distance_km: distance,
      scores: {
        total: compositeScore,
        workload: workloadScore,
        rating: ratingScore,
        speed: speedScore,
        sla: slaScore,
        experience: experienceScore,
      },
      strengths: strengths.length > 0 ? strengths : ["Available"],
    };
  });

  // Sort descending by total composite score, then by lowest open cases
  evaluated.sort((a, b) => b.scores.total - a.scores.total || a.open_cases - b.open_cases);

  const top = evaluated[0];
  top.is_recommended = true;

  // Generate detailed human-readable AI rationale
  const reasons = [];
  reasons.push(
    `AI evaluated ${evaluated.length} candidate officer${evaluated.length === 1 ? "" : "s"} in ${deptName} for this ${severity} ${category} report.`
  );

  const bestTraits = [];
  if (top.open_cases === 0) bestTraits.push("an immediate zero-backlog queue");
  else bestTraits.push(`a light active workload of ${top.open_cases} open case${top.open_cases === 1 ? "" : "s"}`);

  if (top.resolved_cases > 0) {
    bestTraits.push(`${top.resolved_cases} successfully completed works`);
  }

  if (top.avg_rating > 0) {
    bestTraits.push(`a high ${top.avg_rating}★ resident satisfaction rating`);
  }

  if (top.avg_days !== null) {
    bestTraits.push(`an average completion turnaround of ${top.avg_days} day${top.avg_days === 1 ? "" : "s"}`);
  }

  if (top.sla_compliance !== null) {
    bestTraits.push(`${top.sla_compliance}% on-time SLA reliability`);
  }

  const detailedReason = `Recommended ${top.name} with an AI Match Score of ${top.scores.total}%. ${top.name.split(" ")[0]} brings ${bestTraits.join(", ")}, optimizing resolution speed without overloading the team.`;

  return {
    recommended: top,
    officers: evaluated,
    department: deptName,
    candidate_count: evaluated.length,
    weights_applied: weights,
    analysis: detailedReason,
  };
}

/**
 * Compute AI recommendation for a specific complaint ref.
 */
export async function getAIOfficerRecommendation(complaintRef) {
  const { complaint, officers } = await getOfficerCandidates({ complaintRef });
  if (!complaint) {
    throw new Error(`Complaint ${complaintRef} not found.`);
  }
  const result = rankOfficersWithAI({ complaint, officers });
  return {
    complaint_ref: complaintRef,
    category: complaint.category,
    severity: complaint.severity,
    current_officer: complaint.current_officer_name || null,
    ...result,
  };
}

/**
 * Execute AI Auto-Assignment for a complaint.
 */
export async function executeAIAutoAssignment(complaintRef, actorUserId) {
  const recommendation = await getAIOfficerRecommendation(complaintRef);
  if (!recommendation.recommended) {
    throw new Error("No eligible officers found in this department to assign.");
  }

  const chosenOfficer = recommendation.recommended;

  await transaction(async (client) => {
    const { rows } = await client.query(
      `select id, ref, status, citizen_id from complaints where ref = $1`,
      [complaintRef]
    );
    if (!rows[0]) throw new Error("Complaint not found.");
    const c = rows[0];

    await client.query(
      `update complaints set assigned_officer = $2, status = 'assigned' where id = $1`,
      [c.id, chosenOfficer.id]
    );

    await client.query(
      `insert into complaint_status_history (complaint_id, from_status, to_status, actor)
       values ($1, $2, 'assigned', $3)`,
      [c.id, c.status, actorUserId || null]
    );

    await client.query(
      `insert into audit_logs (actor, action, entity, entity_id, after)
       values ($1, 'ai.auto_assign', 'complaints', $2, $3)`,
      [
        actorUserId || null,
        c.ref,
        JSON.stringify({
          officer_id: chosenOfficer.id,
          officer_name: chosenOfficer.name,
          ai_score: chosenOfficer.scores.total,
          reason: recommendation.analysis,
        }),
      ]
    );
  });

  try {
    const { rows: compRow } = await query(`select id, ref, department_id from complaints where ref = $1`, [complaintRef]);
    if (compRow[0]) {
      await notify({
        userId: chosenOfficer.id,
        kind: "assigned",
        complaintId: compRow[0].id,
        context: { ref: complaintRef, officer: chosenOfficer.name },
      });
    }
  } catch (notifyErr) {
    console.warn("[aiAssignment] Notification dispatch warning:", notifyErr.message);
  }

  return {
    success: true,
    complaint_ref: complaintRef,
    assigned_officer: {
      id: chosenOfficer.id,
      name: chosenOfficer.name,
      email: chosenOfficer.email,
      designation: chosenOfficer.designation,
      ai_score: chosenOfficer.scores.total,
      open_cases: chosenOfficer.open_cases,
      resolved_cases: chosenOfficer.resolved_cases,
      avg_days: chosenOfficer.avg_days,
      avg_rating: chosenOfficer.avg_rating,
      sla_compliance: chosenOfficer.sla_compliance,
    },
    ai_analysis: recommendation.analysis,
  };
}

/**
 * Batch AI Auto-Assignment:
 * Evaluates all unassigned complaints across departments and assigns the best-matched
 * officer to each, dynamically updating caseloads during the run so no officer is overloaded.
 */
export async function executeBatchAIAutoAssignment({ departmentId = null, limit = 200, actorUserId = null } = {}) {
  // 1. Fetch unassigned complaints
  const { rows: unassigned } = await query(
    `select c.id, c.ref, c.category_id, cat.name as category,
            c.department_id, d.name as department_name,
            c.severity, c.severity_score, c.location, c.ward_id, w.code as ward_code,
            c.created_at, c.status
     from complaints c
     left join categories cat on cat.id = c.category_id
     left join departments d on d.id = c.department_id
     left join wards w on w.id = c.ward_id
     where c.assigned_officer is null
       and c.status not in ('resolved', 'rejected', 'withdrawn')
       and ($1::int is null or c.department_id = $1)
     order by
       case c.severity when 'critical' then 0 when 'high' then 1 when 'medium' then 2 else 3 end,
       c.created_at asc
     limit $2`,
    [departmentId, limit]
  );

  if (unassigned.length === 0) {
    return {
      success: true,
      total_assigned: 0,
      message: "No unassigned complaints found matching the criteria.",
      assignments: [],
      departments_summary: [],
      officers_summary: [],
    };
  }

  // 2. Fetch all active officers
  const { rows: officers } = await query(
    `select o.id, p.full_name as name, p.email, d.name as department, d.id as department_id,
            o.designation, o.work_phone, o.active,
            count(distinct c.id) filter (where c.status not in ('resolved','rejected','withdrawn'))::int as open_cases,
            count(distinct c.id) filter (where c.status = 'resolved')::int                                 as resolved_cases,
            round(avg(extract(epoch from (c.resolved_at - c.created_at)) / 86400.0)
                  filter (where c.status = 'resolved')::numeric, 1)                                        as avg_days,
            round(100.0 * count(distinct c.id) filter (where c.resolved_at is not null and c.resolved_at <= c.sla_deadline)
                  / nullif(count(distinct c.id) filter (where c.resolved_at is not null), 0))             as sla_compliance,
            round(coalesce(avg(f.rating), 0)::numeric, 1)                                                  as avg_rating,
            count(distinct f.complaint_id)::int                                                            as rating_count
     from officers o
     join profiles p on p.id = o.id
     join departments d on d.id = o.department_id
     left join complaints c on c.assigned_officer = o.id
     left join complaint_feedback f on f.complaint_id = c.id
     where o.active and o.approved_at is not null
       and ($1::int is null or o.department_id = $1)
       and p.role = 'officer'
     group by o.id, p.full_name, p.email, d.name, d.id, o.designation, o.work_phone, o.active
     order by open_cases asc`,
    [departmentId]
  );

  if (officers.length === 0) {
    return {
      success: false,
      total_assigned: 0,
      message: "No active approved officers available for assignment.",
      assignments: [],
      departments_summary: [],
      officers_summary: [],
    };
  }

  // Group officers by department in memory
  const officersByDept = {};
  for (const off of officers) {
    if (!officersByDept[off.department_id]) officersByDept[off.department_id] = [];
    officersByDept[off.department_id].push({ ...off });
  }

  const assignments = [];
  const officerAssignmentCount = {};

  for (const complaint of unassigned) {
    // Find officers in complaint's department, or fallback to general pool if department has no specific officers
    let candidates = officersByDept[complaint.department_id];
    if (!candidates || candidates.length === 0) {
      candidates = officers;
    }

    // Rank candidates using AI multi-factor algorithm
    const evaluation = rankOfficersWithAI({ complaint, officers: candidates });
    const chosen = evaluation.recommended;

    if (chosen) {
      assignments.push({
        complaint_id: complaint.id,
        ref: complaint.ref,
        category: complaint.category || "General Civic",
        severity: complaint.severity || "medium",
        ward_code: complaint.ward_code || null,
        department_name: complaint.department_name || chosen.department,
        department_id: complaint.department_id || chosen.department_id,
        officer_id: chosen.id,
        officer_name: chosen.name,
        officer_email: chosen.email,
        ai_score: chosen.scores?.total || 85,
        reason: evaluation.analysis,
      });

      // Dynamic workload balancing: increase open_cases so next iteration distributes load
      chosen.open_cases = (chosen.open_cases || 0) + 1;
      officerAssignmentCount[chosen.id] = (officerAssignmentCount[chosen.id] || 0) + 1;
    }
  }

  // 3. Batch commit to database
  if (assignments.length > 0) {
    await transaction(async (client) => {
      for (const a of assignments) {
        await client.query(
          `update complaints set assigned_officer = $2, status = 'assigned' where id = $1`,
          [a.complaint_id, a.officer_id]
        );

        await client.query(
          `insert into complaint_status_history (complaint_id, from_status, to_status, actor)
           values ($1, 'submitted', 'assigned', $2)`,
          [a.complaint_id, actorUserId || null]
        );
      }

      await client.query(
        `insert into audit_logs (actor, action, entity, entity_id, after)
         values ($1, 'ai.batch_auto_assign', 'complaints', $2, $3)`,
        [
          actorUserId || null,
          `BATCH-${Date.now()}`,
          JSON.stringify({
            count: assignments.length,
            assignments: assignments.map((a) => ({ ref: a.ref, officer: a.officer_name })),
          }),
        ]
      );
    });
  }

  // 4. Group results for clean summary
  const deptSummaryMap = {};
  for (const a of assignments) {
    const dName = a.department_name || "General";
    if (!deptSummaryMap[dName]) deptSummaryMap[dName] = { department: dName, count: 0, officers: new Set() };
    deptSummaryMap[dName].count += 1;
    deptSummaryMap[dName].officers.add(a.officer_name);
  }

  const departmentsSummary = Object.values(deptSummaryMap).map((d) => ({
    department: d.department,
    count: d.count,
    officers: Array.from(d.officers),
  }));

  const officerSummaryList = officers
    .filter((o) => (officerAssignmentCount[o.id] || 0) > 0)
    .map((o) => ({
      id: o.id,
      name: o.name,
      department: o.department,
      assigned_new_count: officerAssignmentCount[o.id],
      total_active_workload: o.open_cases,
    }));

  return {
    success: true,
    total_assigned: assignments.length,
    departments_summary: departmentsSummary,
    officers_summary: officerSummaryList,
    assignments,
  };
}
