-- CivicLense 0010 — nothing lands on Roads by accident
--
-- The `Other` category was seeded with Roads & Infrastructure as its default
-- department, because the seed needed *some* department and Roads was first in
-- the list. The effect is that anything the classifier cannot place — a photo of
-- a mouldy orange, a picture of someone's ceiling, a genuine problem with no
-- matching category — arrives in the Roads queue as though it were a pothole.
--
-- That is worse than useless: it pollutes one department's backlog and buries
-- reports that nobody has actually triaged.

insert into departments (code, name, authority, sla_hours) values
  ('TRIAGE', 'Ward Office — triage', 'MCGM',
   '{"critical":24,"high":48,"medium":96,"low":168}')
on conflict (code) do nothing;

-- Unclassifiable reports go to a human to sort, not to a work queue.
update categories
set default_department_id = (select id from departments where code = 'TRIAGE'),
    responsible_party = 'department',
    description = 'Anything that does not fit another category. A ward officer reads it and reroutes.'
where code = 'OTHER';

-- Move the ones already misfiled. Only untouched reports — anything an officer
-- has already picked up stays where it is, since they may have good reason.
update complaints c
set department_id = (select id from departments where code = 'TRIAGE')
from categories cat
where cat.id = c.category_id
  and cat.code = 'OTHER'
  and c.status in ('submitted', 'ai_analysis', 'under_review')
  and c.assigned_officer is null;

-- ============================================================
-- Reports the classifier does not believe are civic issues
-- ============================================================
-- These were being filed like any other complaint. They should be visible as
-- what they are: something a person needs to look at before it enters a queue.
alter table complaints
  add column if not exists flagged_not_civic boolean not null default false,
  add column if not exists triage_note text;

create index if not exists complaints_triage
  on complaints(flagged_not_civic) where flagged_not_civic;

-- No department should be able to hide behind the triage queue either, so it
-- carries the same SLA machinery as the rest.
insert into sla_rules (category_id, severity, hours, escalate_after_hours)
select c.id, s.severity, s.hours, s.escalate
from categories c
cross join (values
  ('critical'::severity, 24, 24),
  ('high'::severity,     48, 24),
  ('medium'::severity,   96, 48),
  ('low'::severity,     168, 96)
) as s(severity, hours, escalate)
where c.code = 'OTHER'
  and not exists (
    select 1 from sla_rules r where r.category_id = c.id and r.severity = s.severity
  );
