# Roles and permissions

Four roles, enforced twice: in `requireRole` middleware and again by row-level security in
Postgres. The middleware gives a clean error message; RLS is the actual boundary.

| Role | Sees | Can do |
|---|---|---|
| `citizen` | Only their own complaints | File reports, confirm or reject a fix, earn points |
| `officer` | Complaints assigned to them, plus their department's queue | Accept, start, send back, upload proof |
| `dept_admin` | Everything in their department | Assign officers, review flagged images, generate reports, use the assistant |
| `global_admin` | Everything | All of the above across every department |

## What each role cannot do

- A **citizen** cannot see another citizen's report, even in the same group. Group pages show
  counts and a radius, never other people's names.
- An **officer** cannot close a complaint. Uploading proof moves it to `verification`; only the
  citizen's confirmation moves it to `resolved`.
- A **dept_admin** cannot read another department's complaints. Their assistant snapshot is
  scoped the same way, so the model cannot leak across the boundary either.
- **Nobody** can update or delete `audit_logs`. There is no write endpoint and no RLS policy
  granting `update` or `delete` — including for `global_admin`.

## The one deliberate asymmetry

Officers can read complaints assigned to them regardless of department, because work is sometimes
routed across a boundary during an escalation. The policy `officers read assigned` grants exactly
that and nothing more.

## Creating staff accounts

Officer and administrator accounts are not self-service. Create the auth user, then:

```sql
update profiles set role = 'officer', full_name = 'Priya Nair' where id = '<uuid>';
insert into officers (id, department_id, base_location, specializations)
values ('<uuid>', (select id from departments where code = 'ROADS'),
        st_setsrid(st_makepoint(72.9010, 19.0720), 4326)::geography,
        array['road_surface']);
```
