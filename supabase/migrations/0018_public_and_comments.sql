-- CivicLense 0018 — the public record
--
-- Three things, and they only work together.
--
-- **Comments.** A resident who walks past the same pothole knows something the
-- reporter did not: that it is worse this week, that a child fell, that it was
-- patched and failed again. That is evidence, and it was being thrown away.
--
-- **A public feed.** The product's argument is that responsibility is visible.
-- It has been visible only to the people doing the work. Anyone should be able
-- to see what was reported, what was done, and what is still open.
--
-- **Leaderboards.** Residents who report carefully and officers who close on
-- time are doing the thing the system exists to encourage, and neither was
-- named anywhere.

-- ============================================================
-- 1. Comments
-- ============================================================
-- A comment is not just text. "I saw this too" and "this was fixed last week"
-- mean different things to a queue, so the kind is recorded and counted.
-- Guarded: `create type` has no `if not exists`, so re-running the migration
-- would abort here and leave everything after it unapplied.
do $$ begin
  create type comment_kind as enum ('corroborate', 'detail', 'dispute', 'resolved_already');
exception when duplicate_object then null;
end $$;

create table if not exists complaint_comments (
  id bigserial primary key,
  complaint_id bigint not null references complaints(id) on delete cascade,
  author_id uuid references profiles(id) on delete set null,

  kind comment_kind not null default 'detail',
  body text not null check (length(trim(body)) between 2 and 800),

  -- Staff comments are marked, because a resident should be able to tell an
  -- official answer from a neighbour's opinion at a glance.
  is_official boolean not null default false,

  -- Hidden rather than deleted. A removed comment that leaves no trace is
  -- indistinguishable from one that was never made, and moderation that cannot
  -- be audited is not moderation.
  hidden boolean not null default false,
  hidden_by uuid references profiles(id),
  hidden_reason text,

  created_at timestamptz default now()
);

create index if not exists comments_by_complaint
  on complaint_comments(complaint_id, created_at desc) where not hidden;
create index if not exists comments_by_author on complaint_comments(author_id);

-- One corroboration per person per complaint. Without this a single resident
-- could "me too" a report twenty times and move it up the queue alone, which
-- is exactly the signal corroboration is supposed to defend against.
create unique index if not exists one_corroboration_each
  on complaint_comments(complaint_id, author_id)
  where kind = 'corroborate' and not hidden;

-- Counts kept on the complaint so a list of 300 does not run a subquery each.
alter table complaints
  add column if not exists comment_count int not null default 0,
  add column if not exists corroboration_count int not null default 0,
  add column if not exists dispute_count int not null default 0;

create or replace function refresh_comment_counts() returns trigger
language plpgsql as $$
declare target bigint := coalesce(new.complaint_id, old.complaint_id);
begin
  update complaints c set
    comment_count = sub.total,
    corroboration_count = sub.corroborated,
    dispute_count = sub.disputed
  from (
    select
      count(*) filter (where not hidden)::int                                as total,
      count(*) filter (where not hidden and kind = 'corroborate')::int       as corroborated,
      count(*) filter (where not hidden and kind in ('dispute','resolved_already'))::int as disputed
    from complaint_comments where complaint_id = target
  ) sub
  where c.id = target;

  return null;
end $$;

drop trigger if exists comment_counts on complaint_comments;
create trigger comment_counts
  after insert or update or delete on complaint_comments
  for each row execute function refresh_comment_counts();

-- ============================================================
-- 2. Corroboration feeds priority
-- ============================================================
-- Deliberately weaker than a separate report. Someone agreeing is worth less
-- than someone bothering to photograph it themselves, and logarithmic so a
-- popular complaint cannot dominate the whole queue on agreement alone.
create or replace function corroboration_weight(n int)
returns int language sql immutable as $$
  select least(15, (8 * ln(greatest(n, 1) + 1))::int);
$$;

-- ============================================================
-- 3. What the public may see
-- ============================================================
-- The reporter is never named, the coordinate is rounded to roughly a street
-- rather than a doorstep, and withdrawn or rejected reports do not appear.
--
-- Rounding matters: a complaint about a broken streetlight outside somebody's
-- house, published to four decimal places with a timestamp, is a statement
-- about where that person lives.
create or replace view public_reports as
select
  c.ref,
  cat.name                                        as category,
  d.name                                          as department,
  c.severity,
  c.status,
  w.code                                          as ward_code,
  w.name                                          as ward_name,
  round(st_y(c.location::geometry)::numeric, 3)   as lat,
  round(st_x(c.location::geometry)::numeric, 3)   as lng,
  c.created_at,
  c.resolved_at,
  c.comment_count,
  c.corroboration_count,
  c.rework_count,
  (c.sla_deadline < now() and c.resolved_at is null) as overdue,
  -- Whether anyone has been sent, without naming who.
  (c.assigned_officer is not null)                as assigned,
  ct.agency                                       as agency
from complaints c
left join categories cat on cat.id = c.category_id
left join departments d on d.id = c.department_id
left join wards w on w.id = c.ward_id
left join contracts ct on ct.id = c.contract_id
where c.status not in ('withdrawn', 'rejected')
  and c.location is not null;

-- ============================================================
-- 4. Leaderboards
-- ============================================================
-- Residents ranked on points, which come from verified contributions rather
-- than volume — a duplicate earns nothing, and confirming a fix earns more than
-- filing. Ranking on report count would reward whoever files most, which is not
-- the same as whoever helps most.
create or replace view resident_leaderboard as
select
  p.id,
  p.full_name,
  p.avatar_path,
  p.points,
  count(distinct b.badge_id)::int                                     as badges,
  count(distinct c.id)::int                                           as reports,
  count(distinct c.id) filter (where c.status = 'resolved')::int      as resolved,
  count(distinct f.complaint_id)::int                                 as confirmations,
  rank() over (order by p.points desc, count(distinct b.badge_id) desc) as position
from profiles p
left join citizen_badges b on b.citizen_id = p.id
left join complaints c on c.citizen_id = p.id and c.status <> 'withdrawn'
left join complaint_feedback f on f.citizen_id = p.id
where p.role = 'citizen' and p.points > 0
group by p.id, p.full_name, p.avatar_path, p.points;

-- Officers ranked on closing within deadline, not on volume.
--
-- Counting jobs closed would reward whoever is handed the most, which is a
-- decision somebody else made. On-time rate is what an officer controls. A
-- floor of five resolved keeps somebody who closed one job on time off the top.
create or replace view officer_leaderboard as
select
  o.id,
  p.full_name,
  d.name                                                          as department,
  count(c.id) filter (where c.status = 'resolved')::int            as resolved,
  count(c.id) filter (where c.resolved_at <= c.sla_deadline)::int  as on_time,
  round(100.0 * count(c.id) filter (where c.resolved_at <= c.sla_deadline)
        / nullif(count(c.id) filter (where c.resolved_at is not null), 0))::int as on_time_rate,
  round(avg(extract(epoch from (c.resolved_at - c.created_at)) / 86400.0)
        filter (where c.resolved_at is not null)::numeric, 1)      as avg_days,
  round(avg(r.rating)::numeric, 1)                                 as rating,
  count(c.id) filter (where c.rework_count > 0)::int               as returned
from officers o
join profiles p on p.id = o.id
left join departments d on d.id = o.department_id
left join complaints c on c.assigned_officer = o.id
left join complaint_reviews r on r.complaint_id = c.id
where o.active
group by o.id, p.full_name, d.name
having count(c.id) filter (where c.status = 'resolved') >= 5;

-- ============================================================
-- 5. Row level security
-- ============================================================
alter table complaint_comments enable row level security;

drop policy if exists "anyone reads visible comments" on complaint_comments;
create policy "anyone reads visible comments" on complaint_comments
  for select using (not hidden);

drop policy if exists "signed in residents comment" on complaint_comments;
create policy "signed in residents comment" on complaint_comments
  for insert with check (author_id = auth.uid());

-- Backfill the counters for anything already in the table.
update complaints set comment_count = 0, corroboration_count = 0, dispute_count = 0
where comment_count <> 0 or corroboration_count <> 0 or dispute_count <> 0;
