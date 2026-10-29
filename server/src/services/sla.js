import { query, transaction } from "../db/pool.js";
import { notify, notifyDepartment } from "./notifications.js";

/**
 * Escalation ladder. Nothing here depends on a human noticing a deadline.
 *   level 0 → assigned officer
 *   level 1 → department administrator
 *   level 2 → global administrator
 */
const LADDER = ["officer", "super_admin", "global_admin"];

export async function runEscalations() {
  const { rows: breached } = await query(
    `select c.id, c.ref, c.escalation_level, c.department_id, c.assigned_officer,
            c.severity, cat.name as category, w.code as ward
     from complaints c
     left join categories cat on cat.id = c.category_id
     left join wards w on w.id = c.ward_id
     where c.sla_deadline < now()
       and c.resolved_at is null
       and c.status not in ('resolved','rejected')
       and (c.last_escalated_at is null or c.last_escalated_at < now() - interval '12 hours')`
  );

  for (const complaint of breached) {
    const nextLevel = Math.min(complaint.escalation_level + 1, LADDER.length - 1);

    await transaction(async (client) => {
      await client.query(
        `update complaints set escalation_level = $2, last_escalated_at = now() where id = $1`,
        [complaint.id, nextLevel]
      );
      await client.query(
        `insert into audit_logs (actor, action, entity, entity_id, before, after)
         values (null, 'sla.breach', 'complaints', $1, $2, $3)`,
        [
          complaint.ref,
          JSON.stringify({ escalation_level: complaint.escalation_level }),
          JSON.stringify({ escalation_level: nextLevel }),
        ]
      );
    });

    const context = { ref: complaint.ref, category: complaint.category, ward: complaint.ward, sla_label: "deadline" };

    if (nextLevel === 0 && complaint.assigned_officer) {
      await notify({ userId: complaint.assigned_officer, kind: "sla_breach", complaintId: complaint.id, context });
    } else {
      await notifyDepartment(complaint.department_id, {
        kind: "escalated",
        complaintId: complaint.id,
        context,
      });
    }
  }

  return { escalated: breached.length };
}

/** Marks groups as hotspots once they cross both a volume and a duration threshold. */
export async function promoteHotspots({ minReports = 15, minHours = 24 } = {}) {
  const { rows } = await query(
    `update clusters
     set is_hotspot = true, is_emerging = false
     where is_hotspot = false
       and report_count >= $1
       and first_reported < now() - ($2 || ' hours')::interval
       and status <> 'resolved'
     returning id, ref, report_count`,
    [minReports, String(minHours)]
  );
  return rows;
}
