-- CivicLense — workflow, accountability and reporting additions.

-- ============ complaint additions ============
alter table complaints
  add column if not exists address text,
  add column if not exists description_translated text,
  add column if not exists last_escalated_at timestamptz,
  add column if not exists review_decision text check (review_decision in ('accepted','rejected')),
  add column if not exists review_note text,
  add column if not exists reviewed_by uuid references profiles(id),
  add column if not exists reviewed_at timestamptz;

create index if not exists complaints_officer_idx on complaints(assigned_officer, status);
create index if not exists complaints_sla_idx on complaints(sla_deadline) where resolved_at is null;
create index if not exists complaints_review_idx on complaints(authenticity) where review_decision is null;

alter table resolution_proofs
  add column if not exists ai_verdict_summary text;

-- ============ rewards ============
create table if not exists reward_events (
  id bigserial primary key,
  citizen_id uuid references profiles(id) on delete cascade,
  reason text not null,
  points int not null,
  complaint_id bigint references complaints(id) on delete set null,
  at timestamptz default now()
);
create index if not exists reward_events_citizen_idx on reward_events(citizen_id, at desc);

-- ============ reporting ============
create table if not exists generated_reports (
  id uuid primary key default gen_random_uuid(),
  requested_by uuid references profiles(id),
  department_id int references departments(id),
  period_from date not null,
  period_to date not null,
  sections text[] not null,
  data jsonb not null,
  narrative text,
  created_at timestamptz default now()
);

create table if not exists daily_briefs (
  id bigserial primary key,
  department_id int references departments(id),
  brief_date date not null,
  items jsonb not null,
  created_at timestamptz default now(),
  unique (department_id, brief_date)
);
-- a single global brief (department_id null) needs its own uniqueness guarantee
create unique index if not exists daily_briefs_global
  on daily_briefs (brief_date) where department_id is null;

-- ============ notification read state ============
create index if not exists notifications_unread_idx
  on notifications(user_id, created_at desc) where read_at is null;

-- ============ officer workload view ============
create or replace view officer_workload as
select o.id,
       p.full_name,
       o.department_id,
       count(c.id) filter (where c.status not in ('resolved','rejected')) as open_cases,
       count(c.id) filter (where c.status = 'resolved')                    as resolved_cases,
       round(100.0 * count(c.id) filter (where c.resolved_at <= c.sla_deadline)
             / nullif(count(c.id) filter (where c.resolved_at is not null), 0)) as sla_compliance
from officers o
join profiles p on p.id = o.id
left join complaints c on c.assigned_officer = o.id
where o.active
group by o.id, p.full_name, o.department_id;

-- ============ points are earned, never set directly ============
-- Awarding happens in reward_events; profiles.points is a derived mirror kept
-- in step by this trigger so a stray UPDATE cannot inflate someone's standing.
create or replace function sync_points() returns trigger language plpgsql as $$
begin
  update profiles
  set points = (select coalesce(sum(points),0) from reward_events where citizen_id = new.citizen_id)
  where id = new.citizen_id;
  return new;
end $$;

drop trigger if exists reward_events_sync on reward_events;
create trigger reward_events_sync after insert on reward_events
  for each row execute function sync_points();

-- ============ RLS for the new tables ============
alter table reward_events enable row level security;
alter table notifications enable row level security;

create policy "citizens read own rewards" on reward_events for select
  using (citizen_id = auth.uid());
create policy "users read own notifications" on notifications for select
  using (user_id = auth.uid());
create policy "users update own notifications" on notifications for update
  using (user_id = auth.uid());

-- officers may read complaints assigned to them regardless of department scoping
create policy "officers read assigned" on complaints for select
  using (assigned_officer = auth.uid());

-- ============ profile bootstrap (required for Google sign-in) ============
-- OAuth users never touch a registration form, so the profile row has to be
-- created by the database the moment the auth user exists. Without this,
-- a Google sign-in lands on a dashboard with no profile and no role.
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, role, language)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'name',
      split_part(new.email, '@', 1)
    ),
    'citizen',
    coalesce(new.raw_user_meta_data->>'language', 'en')
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- backfill anyone who signed up before this trigger existed
insert into public.profiles (id, full_name, role, language)
select u.id,
       coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', split_part(u.email,'@',1)),
       'citizen', 'en'
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null;

-- residents may read their own profile; the OAuth callback polls this
create policy "read own profile" on profiles for select using (id = auth.uid());
create policy "update own profile" on profiles for update using (id = auth.uid());
