-- CivicLense 0017 — award the points and badges that were never granted
--
-- rewards.js exported award() and checkBadges() and nothing ever called them,
-- so no resident has ever earned a point or a badge. That is now wired into
-- filing a report and confirming a fix — but only for what happens next.
--
-- Everyone who has already been using the app has a record that earned rewards
-- under the rules and never received them. Telling them their badges start from
-- today would be the wrong answer: the work was done.
--
-- Idempotent. `on conflict do nothing` throughout, so re-running grants nothing
-- twice.

-- ============================================================
-- 1. Points for reports already filed
-- ============================================================
insert into reward_events (citizen_id, reason, points, complaint_id, at)
select c.citizen_id,
       case when c.severity = 'critical' then 'critical_report' else 'valid_report' end,
       case when c.severity = 'critical' then 15 else 10 end,
       c.id,
       c.created_at
from complaints c
where c.citizen_id is not null
  and c.status not in ('rejected', 'withdrawn')
  and not exists (
    select 1 from reward_events r
    where r.complaint_id = c.id
      and r.reason in ('valid_report', 'critical_report')
  );

-- ============================================================
-- 2. Points for fixes already confirmed
-- ============================================================
insert into reward_events (citizen_id, reason, points, complaint_id, at)
select f.citizen_id, 'confirmed_resolution', 20, f.complaint_id, f.at
from complaint_feedback f
where f.citizen_id is not null
  and f.resolved
  and not exists (
    select 1 from reward_events r
    where r.complaint_id = f.complaint_id and r.reason = 'confirmed_resolution'
  );

-- ============================================================
-- 3. Recompute every total from the events
-- ============================================================
-- Set from the event log rather than incremented. A total that cannot be
-- derived from its own history is a number nobody can check, and there was
-- already a bare `points = points + 20` writing one of these without an event.
update profiles p
set points = coalesce(sub.total, 0)
from (
  select citizen_id, sum(points)::int as total
  from reward_events
  group by citizen_id
) sub
where p.id = sub.citizen_id;

update profiles set points = 0
where role = 'citizen'
  and id not in (select distinct citizen_id from reward_events where citizen_id is not null);

-- ============================================================
-- 4. Award every badge already earned
-- ============================================================
-- The same criteria checkBadges() applies, expressed once in SQL so the
-- backfill and the live check cannot drift apart in what they count.
with record as (
  select c.citizen_id,
         count(*) filter (where c.status <> 'rejected')                     as valid_reports,
         count(*) filter (where c.status = 'resolved')                      as resolved,
         count(distinct c.cluster_id) filter (where c.is_duplicate = false) as clusters_started,
         count(*) filter (where c.severity = 'critical')                    as critical_reports
  from complaints c
  where c.citizen_id is not null
  group by c.citizen_id
)
insert into citizen_badges (citizen_id, badge_id)
select r.citizen_id, b.id
from record r
cross join badges b
where
  case b.code
    when 'FIRST'    then r.valid_reports    >= 1
    when 'WATCHER'  then r.valid_reports    >= 10
    when 'GUARDIAN' then r.valid_reports    >= 50
    when 'FINDER'   then r.clusters_started >= 1
    when 'VERIFIER' then r.resolved         >= 5
    else false
  end
on conflict do nothing;

-- ============================================================
-- Summary
-- ============================================================
do $$
declare granted int; awarded int; residents int;
begin
  select count(*) into granted  from reward_events;
  select count(*) into awarded  from citizen_badges;
  select count(*) into residents from profiles where role = 'citizen' and points > 0;

  raise notice E'\n%  reward events on record\n%  badges held\n%  residents with a points total\n',
    granted, awarded, residents;
end $$;
