import { query } from "../db/pool.js";
import { dailyBrief } from "./narrate.js";

/**
 * The morning brief, assembled from queries.
 *
 * This used to hand a pile of rows to a language model and ask it to write the
 * page. Two problems with that. A model summarising municipal figures will
 * eventually write a sentence the figures do not support, in something carrying
 * the corporation's name. And the whole brief stopped working when a provider
 * retired a model id — an absurd way to lose a page of numbers already in hand.
 *
 * Every sentence is now a format string over a real figure. It costs nothing,
 * takes no time, cannot be wrong, and cannot fail.
 */
export async function buildDailyBrief(departmentId = null) {
  const scope = departmentId ?? null;

  const [counts, wards, groups, agencies, officers] = await Promise.all([
    query(
      `select
         count(*) filter (where status not in ('resolved','rejected','withdrawn'))::int as open,
         count(*) filter (where created_at::date = current_date)::int                  as filed_today,
         count(*) filter (where resolved_at::date = current_date)::int                 as resolved_today,
         count(*) filter (where sla_deadline < now() and resolved_at is null
                            and status <> 'withdrawn')::int                            as breached,
         count(*) filter (where sla_deadline < now() and resolved_at is null
                            and severity = 'critical')::int                            as breached_critical,
         count(*) filter (where assigned_officer is null
                            and status not in ('resolved','rejected','withdrawn'))::int as unassigned,
         count(*) filter (where rework_count > 0 and status = 'reopened')::int         as rejected,
         count(*) filter (where authenticity <> 'likely_genuine'
                            and review_decision is null)::int                          as flagged,
         min(created_at) filter (where assigned_officer is null
                            and status not in ('resolved','rejected','withdrawn'))     as oldest_unassigned
       from complaints
       where ($1::int is null or department_id = $1)`,
      [scope]
    ),

    query(
      `select w.code as label,
              count(*) filter (where c.status not in ('resolved','rejected','withdrawn'))::int as open,
              count(*) filter (where c.sla_deadline < now() and c.resolved_at is null)::int    as overdue
       from complaints c
       join wards w on w.id = c.ward_id
       where ($1::int is null or c.department_id = $1) and w.code <> 'MUMBAI'
       group by w.code having count(*) > 0
       order by open desc limit 6`,
      [scope]
    ),

    query(
      `select count(*)::int as new_hotspots
       from clusters
       where is_hotspot and last_reported > now() - interval '24 hours'
         and ($1::int is null or department_id = $1)`,
      [scope]
    ),

    query(
      `select ct.agency as label, ct.contract_no as note,
              count(c.id)::int as total,
              count(c.id) filter (where c.status = 'resolved')::int as resolved,
              count(c.id) filter (where c.sla_deadline < now() and c.resolved_at is null)::int as overdue
       from contracts ct
       left join complaints c on c.contract_id = ct.id
       where ($1::int is null or ct.department_id = $1)
       group by ct.agency, ct.contract_no
       having count(c.id) > 0
       order by overdue desc limit 5`,
      [scope]
    ),

    query(
      `select p.full_name as label,
              count(*) filter (where c.status not in ('resolved','rejected','withdrawn'))::int as open,
              round(100.0 * count(*) filter (where c.resolved_at <= c.sla_deadline)
                    / nullif(count(*) filter (where c.resolved_at is not null), 0))            as sla
       from officers o
       join profiles p on p.id = o.id
       left join complaints c on c.assigned_officer = o.id
       where o.active and ($1::int is null or o.department_id = $1)
       group by p.full_name
       order by open desc limit 6`,
      [scope]
    ),
  ]);

  const d = { ...counts.rows[0], ...groups.rows[0] };

  return {
    ...dailyBrief(d),
    // The supporting tables the panel renders alongside the narrative.
    wards: wards.rows,
    agencies: agencies.rows,
    officers: officers.rows,
    at: new Date().toISOString(),
  };
}
