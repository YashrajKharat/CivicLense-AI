-- CivicLense 0005 — three-tier staff hierarchy
--
--   global_admin   city-wide. Appoints super admins. Seeded by hand.
--        ↓ approves
--   super_admin    one department. Appoints officers in that department.
--        ↓ approves
--   officer        field staff.
--
-- Each tier appoints only the tier directly beneath it. Enforced here, in the
-- database, so the API is not the only thing standing between a request and a
-- role. `dept_admin` becomes `super_admin` — same idea, clearer name.

-- ============================================================
-- 1. Add the new role value
-- ============================================================
-- ALTER TYPE ... ADD VALUE cannot be used later in the same transaction that
-- creates it, so this runs on its own and the rest follows below.

do $$ begin
  alter type app_role add value if not exists 'super_admin';
exception when duplicate_object then null;
end $$;

commit;

-- ============================================================
-- 2. Migrate existing department admins
-- ============================================================
update profiles set role = 'super_admin' where role = 'dept_admin';
update staff_applications set requested_role = 'super_admin' where requested_role = 'dept_admin';

-- ============================================================
-- 3. Who may approve whom
-- ============================================================
create or replace function can_approve(actor_role app_role, target_role app_role)
returns boolean language sql immutable as $$
  select (actor_role = 'global_admin' and target_role = 'super_admin')
      or (actor_role = 'super_admin'  and target_role = 'officer');
$$;

-- A super admin is department-scoped, so an officer request must belong to the
-- same department. A global admin has no such limit.
create or replace function approve_staff_application(
  p_application uuid, p_approver uuid, p_note text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  app            staff_applications;
  approver_role  app_role;
  approver_dept  int;
begin
  select p.role, o.department_id into approver_role, approver_dept
  from profiles p left join officers o on o.id = p.id
  where p.id = p_approver;

  select * into app from staff_applications where id = p_application for update;
  if app is null then raise exception 'No such application.'; end if;
  if app.status <> 'pending' then raise exception 'Already %.', app.status; end if;

  if not can_approve(approver_role, app.requested_role) then
    raise exception 'A % cannot approve a %.', approver_role, app.requested_role;
  end if;

  if approver_role = 'super_admin' and app.department_id is distinct from approver_dept then
    raise exception 'You can only approve officers in your own department.';
  end if;

  update profiles
  set role = app.requested_role, full_name = app.full_name
  where id = app.user_id;

  insert into officers (id, department_id, active, approved_by, approved_at, designation, employee_id)
  values (app.user_id, app.department_id, true, p_approver, now(), app.designation, app.employee_id)
  on conflict (id) do update
    set department_id = excluded.department_id,
        active        = true,
        approved_by   = excluded.approved_by,
        approved_at   = now(),
        designation   = excluded.designation,
        employee_id   = excluded.employee_id;

  update staff_applications
  set status = 'approved', decided_by = p_approver, decided_at = now(), decision_note = p_note
  where id = p_application;

  insert into audit_logs (actor, action, entity, entity_id, after)
  values (p_approver, 'staff.approved', 'staff_applications', p_application::text,
          jsonb_build_object('role', app.requested_role, 'user_id', app.user_id,
                             'approver_role', approver_role));
end $$;

create or replace function reject_staff_application(
  p_application uuid, p_approver uuid, p_note text
) returns void
language plpgsql security definer set search_path = public as $$
declare
  app           staff_applications;
  approver_role app_role;
  approver_dept int;
begin
  select p.role, o.department_id into approver_role, approver_dept
  from profiles p left join officers o on o.id = p.id
  where p.id = p_approver;

  select * into app from staff_applications where id = p_application for update;
  if app is null then raise exception 'No such application.'; end if;

  if not can_approve(approver_role, app.requested_role) then
    raise exception 'A % cannot decide a % request.', approver_role, app.requested_role;
  end if;

  if approver_role = 'super_admin' and app.department_id is distinct from approver_dept then
    raise exception 'You can only decide officer requests in your own department.';
  end if;

  update staff_applications
  set status = 'rejected', decided_by = p_approver, decided_at = now(), decision_note = p_note
  where id = p_application;

  -- A rejected applicant keeps their account as an ordinary resident rather
  -- than being locked out; they may still want to report a pothole.
  insert into audit_logs (actor, action, entity, entity_id, after)
  values (p_approver, 'staff.rejected', 'staff_applications', p_application::text,
          jsonb_build_object('note', p_note, 'approver_role', approver_role));
end $$;

-- ============================================================
-- 4. Nobody requests global admin through the application
-- ============================================================
alter table staff_applications drop constraint if exists staff_applications_role_check;
alter table staff_applications add constraint staff_applications_role_check
  check (requested_role in ('officer', 'super_admin'));

-- ============================================================
-- 5. Queue scoped to the approver
-- ============================================================
-- A global admin sees super admin requests; a super admin sees officer requests
-- for their own department. Neither sees the other's queue.
create or replace function pending_applications_for(p_user uuid)
returns setof staff_applications
language sql stable as $$
  select a.*
  from staff_applications a
  join profiles p on p.id = p_user
  left join officers o on o.id = p_user
  where a.status = 'pending'
    and can_approve(p.role, a.requested_role)
    and (p.role = 'global_admin' or a.department_id = o.department_id)
  order by a.created_at desc;
$$;

-- ============================================================
-- 6. Suspension follows the same chain
-- ============================================================
create or replace function set_officer_active(
  p_officer uuid, p_active boolean, p_actor uuid
) returns void
language plpgsql security definer set search_path = public as $$
declare
  actor_role   app_role;
  actor_dept   int;
  target_role  app_role;
  target_dept  int;
begin
  select p.role, o.department_id into actor_role, actor_dept
  from profiles p left join officers o on o.id = p.id where p.id = p_actor;

  select p.role, o.department_id into target_role, target_dept
  from profiles p left join officers o on o.id = p.id where p.id = p_officer;

  if not can_approve(actor_role, target_role) then
    raise exception 'A % cannot suspend a %.', actor_role, target_role;
  end if;

  if actor_role = 'super_admin' and target_dept is distinct from actor_dept then
    raise exception 'You can only manage officers in your own department.';
  end if;

  update officers set active = p_active where id = p_officer;

  insert into audit_logs (actor, action, entity, entity_id, after)
  values (p_actor,
          case when p_active then 'officer.reinstated' else 'officer.suspended' end,
          'officers', p_officer::text,
          jsonb_build_object('active', p_active, 'actor_role', actor_role));
end $$;

-- ============================================================
-- 7. RLS follows the same rule
-- ============================================================
drop policy if exists "global admins read all applications" on staff_applications;
drop policy if exists "approvers read their queue" on staff_applications;

create policy "approvers read their queue" on staff_applications for select
  using (exists (
    select 1
    from profiles p
    left join officers o on o.id = p.id
    where p.id = auth.uid()
      and can_approve(p.role, staff_applications.requested_role)
      and (p.role = 'global_admin' or staff_applications.department_id = o.department_id)
  ));
