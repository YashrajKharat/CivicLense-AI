-- CivicLense 0009 — contact details where they are needed
--
-- Email lives in auth.users, which meant joining the auth schema from a dozen
-- queries. Mirroring it onto profiles keeps every query in the public schema
-- and gives one place to reason about who can see a contact address.

alter table profiles
  add column if not exists email text,
  add column if not exists phone text;

-- Backfill from the auth table.
update profiles p
set email = u.email
from auth.users u
where u.id = p.id and p.email is distinct from u.email;

-- Keep it in step. An email change in Supabase Auth should not leave a stale
-- address on an officer's record.
create or replace function sync_profile_email() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.profiles set email = new.email where id = new.id;
  return new;
end $$;

drop trigger if exists on_auth_user_email_changed on auth.users;
create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row execute function sync_profile_email();

-- The insert trigger from 0002 predates this column, so it is extended here
-- rather than left to backfill on the next email change.
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, email, role, language)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'name',
      split_part(new.email, '@', 1)
    ),
    new.email,
    'citizen',
    coalesce(new.raw_user_meta_data->>'language', 'en')
  )
  on conflict (id) do update set email = excluded.email;
  return new;
end $$;

create index if not exists profiles_email on profiles(email);

-- Officers may carry a work number separate from the personal one on their
-- staff application.
alter table officers add column if not exists work_phone text;

update officers o
set work_phone = a.phone
from staff_applications a
where a.user_id = o.id and o.work_phone is null and a.phone is not null;

-- ============================================================
-- Who may read a contact address
-- ============================================================
-- Staff addresses are official and visible to any signed-in staff member.
-- A resident's address is visible only to the people handling their complaint —
-- never to other residents, and never on a group page, where several people's
-- reports are aggregated and a name would leak by association.
create or replace view staff_directory as
select p.id, p.full_name, p.email, p.role,
       o.department_id, d.name as department, d.code as department_code,
       o.designation, o.employee_id, o.work_phone, o.active, o.approved_at
from profiles p
join officers o on o.id = p.id
left join departments d on d.id = o.department_id
where p.role in ('officer', 'super_admin');
