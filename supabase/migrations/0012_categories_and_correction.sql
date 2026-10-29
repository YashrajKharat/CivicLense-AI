-- CivicLense 0012 — the categories that were missing, and letting the resident correct the machine
--
-- A photograph of paan stains down a wall was classified as water leakage. The
-- model was not being stupid: rust-coloured streaks running vertically down
-- concrete genuinely resemble water staining, and the taxonomy contained no
-- category for spitting or defacement — so the nearest visual match was the
-- only answer available to it.
--
-- Two fixes. Give it the right categories, and let the person standing in front
-- of the problem overrule it.

-- ============================================================
-- 1. Categories that were missing
-- ============================================================
insert into categories (code, name, description, default_department_id, base_severity, responsible_party) values
  ('SPITTING', 'Spitting / paan stains',
   'Paan, gutka or tobacco staining on walls, stairs, corners or public property.',
   (select id from departments where code = 'SWM'), 35, 'department'),

  ('DEFACED', 'Defaced wall or property',
   'Posters, graffiti, unauthorised painting or advertising on public walls.',
   (select id from departments where code = 'SWM'), 30, 'department'),

  ('URINATION', 'Public urination spot',
   'A location being repeatedly used as an open urinal.',
   (select id from departments where code = 'HEALTH'), 45, 'department'),

  ('DAMP', 'Damp or seepage on a structure',
   'Water seeping through a wall, ceiling or municipal structure.',
   (select id from departments where code = 'WATER'), 40, 'contractor'),

  ('SEWAGE', 'Sewage overflow',
   'Sewage surfacing from a chamber, drain or pipe.',
   (select id from departments where code = 'DRAIN'), 85, 'contractor'),

  ('DEAD_TREE', 'Dangerous or dead tree',
   'A tree or large branch at risk of falling.',
   (select id from departments where code = 'GARDEN'), 70, 'contractor'),

  ('NOISE', 'Persistent noise nuisance',
   'Loudspeakers, machinery or construction outside permitted hours.',
   (select id from departments where code = 'HEALTH'), 35, 'department'),

  ('STRAY', 'Stray animal concern',
   'An injured, aggressive or trapped animal in a public place.',
   (select id from departments where code = 'HEALTH'), 50, 'department')
on conflict (code) do nothing;

-- Every new category needs SLA rules, or its complaints inherit the fallback
-- deadline with nobody noticing.
insert into sla_rules (category_id, severity, hours, escalate_after_hours)
select c.id, s.severity, s.hours, s.escalate
from categories c
cross join (values
  ('critical'::severity, 12, 12),
  ('high'::severity,     24, 24),
  ('medium'::severity,   72, 48),
  ('low'::severity,     168, 96)
) as s(severity, hours, escalate)
where c.code in ('SPITTING','DEFACED','URINATION','DAMP','SEWAGE','DEAD_TREE','NOISE','STRAY')
  and not exists (
    select 1 from sla_rules r where r.category_id = c.id and r.severity = s.severity
  );

-- ============================================================
-- 2. When a resident overrules the classifier
-- ============================================================
-- Keeping both answers matters twice over: an officer should know the category
-- came from the person who was there rather than from a photograph, and the
-- disagreement rate is the only honest measure of whether the classifier is
-- any good.
alter table complaints
  add column if not exists ai_category_id int references categories(id),
  add column if not exists category_corrected boolean not null default false,
  add column if not exists corrected_at timestamptz;

create index if not exists complaints_corrected
  on complaints(category_corrected) where category_corrected;

-- Which categories the classifier confuses for which. A pattern here is a
-- prompt or taxonomy problem, not a run of unlucky photographs.
create or replace view classifier_accuracy as
select
  guessed.name  as classified_as,
  actual.name   as corrected_to,
  count(*)::int as times,
  round(avg(c.ai_confidence)::numeric, 1) as avg_confidence_when_wrong
from complaints c
join categories guessed on guessed.id = c.ai_category_id
join categories actual  on actual.id  = c.category_id
where c.category_corrected
group by guessed.name, actual.name
order by times desc;

create or replace view classifier_summary as
select
  count(*)::int                                              as classified,
  count(*) filter (where category_corrected)::int            as corrected_by_resident,
  round(100.0 * count(*) filter (where category_corrected)
        / nullif(count(*), 0), 1)                            as correction_rate,
  round(avg(ai_confidence) filter (where category_corrected)::numeric, 1)     as avg_confidence_when_wrong,
  round(avg(ai_confidence) filter (where not category_corrected)::numeric, 1) as avg_confidence_when_right
from complaints
where ai_category_id is not null;

-- Backfill: everything filed so far was the classifier's own answer.
update complaints set ai_category_id = category_id where ai_category_id is null;
