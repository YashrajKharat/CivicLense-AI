-- CivicLense 0004
-- Everything fixed against a live database, folded back into the repo, plus the
-- staff approval workflow. Written to be safe to run more than once.

-- ============================================================
-- 1. Data fixes found in production
-- ============================================================

-- Seed inserted zones with no conflict guard, so re-running it created
-- duplicates and any `where name = 'Zone 5'` subquery started failing.
update wards w
set zone_id = (select min(z2.id) from zones z2
               where z2.name = (select name from zones where id = w.zone_id))
where w.zone_id is not null;

delete from zones z
where z.id > (select min(z2.id) from zones z2 where z2.name = z.name);

do $$ begin
  alter table zones add constraint zones_name_unique unique (name);
exception when duplicate_table or duplicate_object then null;
end $$;

-- The seeded wards were three small rectangles that left most of Mumbai
-- uncovered, so a genuine report from Dadar resolved to no ward and 404'd.
-- This is a demo catch-all; replace it with real MCGM GeoJSON for anything real.
insert into zones (name) values ('Zone 5')
on conflict (name) do nothing;

insert into wards (code, name, zone_id, geom) values
  ('MUMBAI', 'Mumbai (catch-all)',
   (select id from zones where name = 'Zone 5' limit 1),
   st_geogfromtext('MULTIPOLYGON(((72.75 18.85, 73.05 18.85, 73.05 19.30, 72.75 19.30, 72.75 18.85)))'))
on conflict (code) do nothing;

-- 0001 and 0002 each defined resolve_responsibility. Both signatures could end
-- up present, and the planner picking the older one returned the wrong shape.
drop function if exists public.resolve_responsibility(geography, int) cascade;

create or replace function resolve_responsibility(p_point geography, p_category int)
returns table (
  ward_id int, ward_code text, zone_id int, zone_name text, authority text,
  asset_code text, asset_name text,
  department_id int, department_name text,
  contract_id int, contract_no text, agency text, contract_ends date
)
language sql stable as $$
  select
    w.id, w.code, z.id, z.name, coalesce(d.authority, 'MCGM'),
    a.code, a.name,
    coalesce(j.department_id, cat.default_department_id), d.name,
    ct.id, ct.contract_no, ct.agency, ct.ends_on
  from wards w
  left join zones z on z.id = w.zone_id
  left join categories cat on cat.id = p_category
  left join jurisdictions j on j.ward_id = w.id and j.category_id = p_category
  left join departments d on d.id = coalesce(j.department_id, cat.default_department_id)
  left join lateral (
    select code, name from assets
    where ward_id = w.id order by st_distance(geom, p_point) limit 1
  ) a on true
  left join contracts ct
    on st_intersects(ct.coverage, p_point)
   and ct.department_id = coalesce(j.department_id, cat.default_department_id)
   and current_date between ct.starts_on and ct.ends_on
  where st_intersects(w.geom, p_point)
  -- A specific ward must win over the catch-all when both contain the point.
  order by st_area(w.geom::geometry) asc
  limit 1;
$$;

-- ============================================================
-- 2. Staff onboarding and approval
-- ============================================================

do $$ begin
  create type staff_request_status as enum ('pending', 'approved', 'rejected');
exception when duplicate_object then null;
end $$;

create table if not exists staff_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  email text not null,
  full_name text not null,
  employee_id text,
  requested_role app_role not null default 'officer',
  department_id int references departments(id),
  designation text,
  phone text,
  justification text,
  status staff_request_status not null default 'pending',
  decided_by uuid references profiles(id),
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz default now(),
  unique (user_id)
);
create index if not exists staff_applications_pending
  on staff_applications (status, created_at desc) where status = 'pending';

-- An officer exists as a row long before they are allowed to work, so the
-- account and the authorisation are tracked separately.
alter table officers
  add column if not exists approved_by uuid references profiles(id),
  add column if not exists approved_at timestamptz,
  add column if not exists designation text,
  add column if not exists employee_id text;

alter table officers alter column active set default false;

-- Government email is the credential that gates a staff request. Citizens are
-- unaffected — they sign up with any address, including Google.
create or replace function is_government_email(addr text) returns boolean
language sql immutable as $$
  select addr ~* '@([a-z0-9-]+\.)*(gov\.in|nic\.in)$';
$$;

alter table staff_applications
  drop constraint if exists staff_applications_gov_email;
alter table staff_applications
  add constraint staff_applications_gov_email check (is_government_email(email));

-- Approval is the only thing that grants a role. Nothing in the client can.
create or replace function approve_staff_application(
  p_application uuid, p_approver uuid, p_note text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  app staff_applications;
  approver_role app_role;
begin
  select role into approver_role from profiles where id = p_approver;
  if approver_role <> 'global_admin' then
    raise exception 'Only a global administrator can approve staff.';
  end if;

  select * into app from staff_applications where id = p_application for update;
  if app is null then raise exception 'No such application.'; end if;
  if app.status <> 'pending' then raise exception 'Already %.', app.status; end if;

  update profiles set role = app.requested_role, full_name = app.full_name
  where id = app.user_id;

  if app.requested_role in ('officer', 'dept_admin') then
    insert into officers (id, department_id, active, approved_by, approved_at, designation, employee_id)
    values (app.user_id, app.department_id, true, p_approver, now(), app.designation, app.employee_id)
    on conflict (id) do update
      set department_id = excluded.department_id,
          active = true,
          approved_by = excluded.approved_by,
          approved_at = now(),
          designation = excluded.designation,
          employee_id = excluded.employee_id;
  end if;

  update staff_applications
  set status = 'approved', decided_by = p_approver, decided_at = now(), decision_note = p_note
  where id = p_application;

  insert into audit_logs (actor, action, entity, entity_id, after)
  values (p_approver, 'staff.approved', 'staff_applications', p_application::text,
          jsonb_build_object('role', app.requested_role, 'user_id', app.user_id));
end $$;

create or replace function reject_staff_application(
  p_application uuid, p_approver uuid, p_note text
) returns void
language plpgsql security definer set search_path = public as $$
declare approver_role app_role;
begin
  select role into approver_role from profiles where id = p_approver;
  if approver_role <> 'global_admin' then
    raise exception 'Only a global administrator can reject staff.';
  end if;

  update staff_applications
  set status = 'rejected', decided_by = p_approver, decided_at = now(), decision_note = p_note
  where id = p_application and status = 'pending';

  -- A rejected applicant keeps their account as an ordinary resident rather
  -- than being locked out; they may still want to report a pothole.
  insert into audit_logs (actor, action, entity, entity_id, after)
  values (p_approver, 'staff.rejected', 'staff_applications', p_application::text,
          jsonb_build_object('note', p_note));
end $$;

-- ============================================================
-- 3. Suspending an approved officer
-- ============================================================
create or replace function set_officer_active(
  p_officer uuid, p_active boolean, p_actor uuid
) returns void
language plpgsql security definer set search_path = public as $$
declare actor_role app_role;
begin
  select role into actor_role from profiles where id = p_actor;
  if actor_role not in ('global_admin', 'dept_admin') then
    raise exception 'Not permitted.';
  end if;

  update officers set active = p_active where id = p_officer;

  insert into audit_logs (actor, action, entity, entity_id, after)
  values (p_actor, case when p_active then 'officer.reinstated' else 'officer.suspended' end,
          'officers', p_officer::text, jsonb_build_object('active', p_active));
end $$;

-- ============================================================
-- 4. Access
-- ============================================================
alter table staff_applications enable row level security;

drop policy if exists "applicants read own" on staff_applications;
create policy "applicants read own" on staff_applications for select
  using (user_id = auth.uid());

drop policy if exists "global admins read all applications" on staff_applications;
create policy "global admins read all applications" on staff_applications for select
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'global_admin'));

drop policy if exists "applicants create own" on staff_applications;
create policy "applicants create own" on staff_applications for insert
  with check (user_id = auth.uid() and is_government_email(email));
