import { query } from "../db/pool.js";
import { notify } from "./notifications.js";

/**
 * Points reward verified contribution, never volume. Filing the same complaint
 * ten times earns nothing, because only the report that starts a group scores
 * and duplicates are folded into it.
 */
export const POINTS = {
  valid_report: 10,
  first_of_group: 25,
  critical_report: 15,
  confirmed_resolution: 20,
  group_became_hotspot: 30,
};

export async function award(citizenId, reason, complaintId) {
  const points = POINTS[reason];
  if (!points) return;

  await query(
    `insert into reward_events (citizen_id, reason, points, complaint_id) values ($1,$2,$3,$4)`,
    [citizenId, reason, points, complaintId || null]
  );
  await query(`update profiles set points = points + $2 where id = $1`, [citizenId, points]);

  await checkBadges(citizenId);
}

/** Why each badge was earned, in words a resident would recognise. */
const BADGE_REASON = {
  FIRST: "filing your first report",
  WATCHER: "filing ten reports",
  GUARDIAN: "filing fifty reports",
  FINDER: "being first to report a problem others then confirmed",
  VERIFIER: "confirming five fixes",
};

/** Evaluates every badge's criteria against the citizen's current record. */
export async function checkBadges(citizenId) {
  const { rows: stats } = await query(
    `select
       count(*) filter (where status not in ('rejected'))            as valid_reports,
       count(*) filter (where status = 'resolved')                   as resolved,
       count(distinct cluster_id) filter (where is_duplicate = false) as clusters_started,
       count(*) filter (where severity = 'critical')                 as critical_reports
     from complaints where citizen_id = $1`,
    [citizenId]
  );

  const record = stats[0];
  const { rows: badges } = await query(
    `select b.id, b.code, b.name, b.criteria
     from badges b
     where not exists (select 1 from citizen_badges cb where cb.badge_id = b.id and cb.citizen_id = $1)`,
    [citizenId]
  );

  for (const badge of badges) {
    const met = Object.entries(badge.criteria).every(
      ([key, threshold]) => Number(record[key] || 0) >= Number(threshold)
    );
    if (!met) continue;

    await query(
      `insert into citizen_badges (citizen_id, badge_id) values ($1,$2) on conflict do nothing`,
      [citizenId, badge.id]
    );
    // Its own template. Borrowing "resolved" meant earning a badge told the
    // resident "Report closed", which is a different thing entirely.
    await notify({
      userId: citizenId,
      kind: "badge_earned",
      context: {
        badge: badge.name,
        why: BADGE_REASON[badge.code] || "your reports",
      },
    });
  }
}
