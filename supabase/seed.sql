-- ============================================================
-- CivicLense — full demo dataset
--
-- Run AFTER migrations 0001 … 0006. Safe to re-run: everything is
-- guarded or keyed, and complaints are only generated when the table
-- is empty.
--
-- Creates real, login-able accounts. Seeding `profiles` alone is not
-- enough — every profile is a foreign key onto auth.users, and without
-- that row the account cannot sign in and the insert fails anyway.
--
--   Password for every seeded account:  CivicLense@2026
--
--   superadmin@mcgm.gov.in    global_admin   the whole city
--   roads.head@mcgm.gov.in    super_admin    Roads & Infrastructure
--   waste.head@mcgm.gov.in    super_admin    Solid Waste Management
--   water.head@mcgm.gov.in    super_admin    Water Supply
--   health.head@mcgm.gov.in   super_admin    Public Health
--   12 officers, 15 residents — see section 7
-- ============================================================

create extension if not exists pgcrypto;

-- ============================================================
-- 1. Departments
-- ============================================================
insert into departments (code, name, authority, sla_hours) values
  ('ROADS',   'Roads & Infrastructure', 'MCGM',                  '{"critical":12,"high":24,"medium":72,"low":168}'),
  ('SWM',     'Solid Waste Management', 'MCGM',                  '{"critical":8,"high":24,"medium":48,"low":120}'),
  ('WATER',   'Water Supply',           'MCGM',                  '{"critical":6,"high":18,"medium":48,"low":120}'),
  ('DRAIN',   'Storm Water Drains',     'MCGM',                  '{"critical":6,"high":18,"medium":48,"low":120}'),
  ('LIGHT',   'Street Lighting',        'MCGM',                  '{"critical":24,"high":48,"medium":96,"low":168}'),
  ('TRAFFIC', 'Traffic',                'Mumbai Traffic Police', '{"critical":6,"high":12,"medium":48,"low":120}'),
  ('HEALTH',  'Public Health',          'MCGM',                  '{"critical":12,"high":24,"medium":72,"low":168}'),
  ('FSSAI',   'Food Safety',            'FDA Maharashtra',       '{"critical":12,"high":48,"medium":96,"low":168}'),
  ('GARDEN',  'Gardens & Open Spaces',  'MCGM',                  '{"critical":48,"high":96,"medium":168,"low":336}'),
  ('ENCROACH','Encroachment Removal',   'MCGM',                  '{"critical":24,"high":48,"medium":120,"low":240}')
on conflict (code) do nothing;

-- ============================================================
-- 2. Zones and wards
-- ============================================================
insert into zones (name) values
  ('Zone 1 - South'), ('Zone 2 - South Central'), ('Zone 3 - West'),
  ('Zone 4 - Central'), ('Zone 5 - East'), ('Zone 6 - North East'),
  ('Zone 7 - North West')
on conflict (name) do nothing;

insert into wards (code, name, zone_id, geom) values
  ('A',       'Colaba / Fort',      (select id from zones where name like 'Zone 1%' limit 1),
   st_geogfromtext('MULTIPOLYGON(((72.80 18.90, 72.85 18.90, 72.85 18.95, 72.80 18.95, 72.80 18.90)))')),
  ('D',       'Malabar Hill',       (select id from zones where name like 'Zone 1%' limit 1),
   st_geogfromtext('MULTIPOLYGON(((72.79 18.95, 72.83 18.95, 72.83 18.99, 72.79 18.99, 72.79 18.95)))')),
  ('G-South', 'Worli / Prabhadevi', (select id from zones where name like 'Zone 2%' limit 1),
   st_geogfromtext('MULTIPOLYGON(((72.81 18.99, 72.85 18.99, 72.85 19.02, 72.81 19.02, 72.81 18.99)))')),
  ('G-North', 'Dadar / Mahim',      (select id from zones where name like 'Zone 2%' limit 1),
   st_geogfromtext('MULTIPOLYGON(((72.82 19.02, 72.87 19.02, 72.87 19.06, 72.82 19.06, 72.82 19.02)))')),
  ('F-North', 'Matunga / Sion',     (select id from zones where name like 'Zone 2%' limit 1),
   st_geogfromtext('MULTIPOLYGON(((72.85 19.02, 72.89 19.02, 72.89 19.06, 72.85 19.06, 72.85 19.02)))')),
  ('H-West',  'Bandra West',        (select id from zones where name like 'Zone 3%' limit 1),
   st_geogfromtext('MULTIPOLYGON(((72.81 19.05, 72.85 19.05, 72.85 19.09, 72.81 19.09, 72.81 19.05)))')),
  ('K-West',  'Andheri West',       (select id from zones where name like 'Zone 3%' limit 1),
   st_geogfromtext('MULTIPOLYGON(((72.81 19.10, 72.86 19.10, 72.86 19.16, 72.81 19.16, 72.81 19.10)))')),
  ('K-East',  'Andheri East',       (select id from zones where name like 'Zone 7%' limit 1),
   st_geogfromtext('MULTIPOLYGON(((72.86 19.10, 72.91 19.10, 72.91 19.16, 72.86 19.16, 72.86 19.10)))')),
  ('L',       'Kurla',              (select id from zones where name like 'Zone 5%' limit 1),
   st_geogfromtext('MULTIPOLYGON(((72.87 19.06, 72.92 19.06, 72.92 19.10, 72.87 19.10, 72.87 19.06)))')),
  ('M-East',  'Chembur / Govandi',  (select id from zones where name like 'Zone 5%' limit 1),
   st_geogfromtext('MULTIPOLYGON(((72.89 19.02, 72.95 19.02, 72.95 19.07, 72.89 19.07, 72.89 19.02)))')),
  ('N',       'Ghatkopar',          (select id from zones where name like 'Zone 6%' limit 1),
   st_geogfromtext('MULTIPOLYGON(((72.89 19.07, 72.95 19.07, 72.95 19.12, 72.89 19.12, 72.89 19.07)))')),
  ('S',       'Bhandup / Powai',    (select id from zones where name like 'Zone 6%' limit 1),
   st_geogfromtext('MULTIPOLYGON(((72.89 19.12, 72.95 19.12, 72.95 19.18, 72.89 19.18, 72.89 19.12)))'))
on conflict (code) do nothing;

-- ============================================================
-- 3. Categories
-- ============================================================
insert into categories (code, name, default_department_id, base_severity) values
  ('POTHOLE',      'Pothole',                 (select id from departments where code='ROADS'),    45),
  ('ROADCRACK',    'Road crack',              (select id from departments where code='ROADS'),    30),
  ('MANHOLE',      'Open manhole',            (select id from departments where code='ROADS'),    85),
  ('FOOTPATH',     'Broken footpath',         (select id from departments where code='ROADS'),    35),
  ('ROADOBST',     'Road obstruction',        (select id from departments where code='ROADS'),    55),
  ('GARBAGE',      'Garbage overflow',        (select id from departments where code='SWM'),      40),
  ('DUMPING',      'Illegal dumping',         (select id from departments where code='SWM'),      50),
  ('DEADANIMAL',   'Dead animal',             (select id from departments where code='SWM'),      65),
  ('DEBRIS',       'Construction debris',     (select id from departments where code='SWM'),      40),
  ('LEAK',         'Water leakage',           (select id from departments where code='WATER'),    55),
  ('PIPELINE',     'Broken pipeline',         (select id from departments where code='WATER'),    70),
  ('NOWATER',      'No water supply',         (select id from departments where code='WATER'),    60),
  ('CONTAMINATED', 'Contaminated water',      (select id from departments where code='WATER'),    90),
  ('FLOOD',        'Flooding',                (select id from departments where code='DRAIN'),    80),
  ('DRAINBLOCK',   'Blocked drain',           (select id from departments where code='DRAIN'),    55),
  ('STREETLIGHT',  'Broken streetlight',      (select id from departments where code='LIGHT'),    30),
  ('EXPOSEDWIRE',  'Exposed wire',            (select id from departments where code='LIGHT'),    90),
  ('DAMAGEDPOLE',  'Damaged electrical pole', (select id from departments where code='LIGHT'),    75),
  ('SIGNAL',       'Damaged traffic signal',  (select id from departments where code='TRAFFIC'),  75),
  ('SIGNBOARD',    'Missing road sign',       (select id from departments where code='TRAFFIC'),  35),
  ('PARKING',      'Illegal parking',         (select id from departments where code='TRAFFIC'),  30),
  ('STAGNANT',     'Stagnant water',          (select id from departments where code='HEALTH'),   60),
  ('MOSQUITO',     'Mosquito breeding',       (select id from departments where code='HEALTH'),   60),
  ('TOILET',       'Public toilet unusable',  (select id from departments where code='HEALTH'),   50),
  ('FOODSTALL',    'Unhygienic food stall',   (select id from departments where code='FSSAI'),    60),
  ('FOODSTORAGE',  'Improper food storage',   (select id from departments where code='FSSAI'),    65),
  ('TREEFALL',     'Fallen tree',             (select id from departments where code='GARDEN'),   70),
  ('PARKDAMAGE',   'Damaged park equipment',  (select id from departments where code='GARDEN'),   30),
  ('HAWKER',       'Illegal hawking',         (select id from departments where code='ENCROACH'), 35),
  ('ENCROACHMENT', 'Footpath encroachment',   (select id from departments where code='ENCROACH'), 40),
  ('OTHER',        'Other',                   (select id from departments where code='ROADS'),    30)
on conflict (code) do nothing;

-- Jurisdiction override: food safety belongs to the state FDA, not the
-- corporation, so those complaints route elsewhere in every ward.
insert into jurisdictions (ward_id, category_id, department_id, authority)
select w.id, c.id, d.id, 'FDA Maharashtra'
from wards w
cross join categories c
cross join departments d
where c.code in ('FOODSTALL','FOODSTORAGE') and d.code = 'FSSAI'
on conflict do nothing;

-- ============================================================
-- 4. SLA rules
-- ============================================================
delete from sla_rules;
-- Every branch of the UNION needs the cast: the first branch sets the column
-- type for the whole statement, and an untyped literal there resolves to text.
insert into sla_rules (category_id, severity, hours, escalate_after_hours)
select id, 'critical'::severity,  12, 12 from categories union all
select id, 'high'::severity,      24, 24 from categories union all
select id, 'medium'::severity,    72, 48 from categories union all
select id, 'low'::severity,      168, 96 from categories;

-- ============================================================
-- 5. Contracts
-- ============================================================
insert into contracts (contract_no, scope, agency, department_id, coverage, starts_on, ends_on, sla_hours) values
  ('RM-2026-014','Road maintenance - east','ABC Infrastructure Pvt Ltd',
   (select id from departments where code='ROADS'),
   st_geogfromtext('MULTIPOLYGON(((72.87 19.02, 72.95 19.02, 72.95 19.12, 72.87 19.12, 72.87 19.02)))'),
   '2026-01-01','2027-12-31',72),
  ('RM-2026-021','Road maintenance - west','Konkan Roadworks Ltd',
   (select id from departments where code='ROADS'),
   st_geogfromtext('MULTIPOLYGON(((72.80 19.02, 72.87 19.02, 72.87 19.16, 72.80 19.16, 72.80 19.02)))'),
   '2026-03-01','2028-02-29',72),
  ('SW-2026-017','Waste collection - east','XYZ Waste Services',
   (select id from departments where code='SWM'),
   st_geogfromtext('MULTIPOLYGON(((72.87 19.02, 72.95 19.02, 72.95 19.12, 72.87 19.12, 72.87 19.02)))'),
   '2026-04-01','2027-03-31',24),
  ('SW-2025-009','Waste collection - south','Sahyadri Sanitation',
   (select id from departments where code='SWM'),
   st_geogfromtext('MULTIPOLYGON(((72.79 18.90, 72.87 18.90, 72.87 19.02, 72.79 19.02, 72.79 18.90)))'),
   '2025-10-01','2026-09-30',24),
  ('WS-2026-004','Water mains maintenance','Aquaflow Engineering',
   (select id from departments where code='WATER'),
   st_geogfromtext('MULTIPOLYGON(((72.80 18.90, 72.95 18.90, 72.95 19.18, 72.80 19.18, 72.80 18.90)))'),
   '2026-01-15','2028-01-14',48),
  ('SL-2025-008','Street lighting - north','Lumen Civic Works',
   (select id from departments where code='LIGHT'),
   st_geogfromtext('MULTIPOLYGON(((72.86 19.06, 72.95 19.06, 72.95 19.18, 72.86 19.18, 72.86 19.06)))'),
   '2025-09-01','2026-08-31',48),
  ('SL-2026-012','Street lighting - west','Lumen Civic Works',
   (select id from departments where code='LIGHT'),
   st_geogfromtext('MULTIPOLYGON(((72.80 19.02, 72.86 19.02, 72.86 19.16, 72.80 19.16, 72.80 19.02)))'),
   '2026-02-01','2027-01-31',48),
  ('DR-2026-003','Storm drain desilting','Monsoon Drainage Co',
   (select id from departments where code='DRAIN'),
   st_geogfromtext('MULTIPOLYGON(((72.80 18.90, 72.95 18.90, 72.95 19.18, 72.80 19.18, 72.80 18.90)))'),
   '2026-04-01','2026-10-31',24),
  ('GA-2026-006','Garden upkeep','Greenscape Services',
   (select id from departments where code='GARDEN'),
   st_geogfromtext('MULTIPOLYGON(((72.80 18.90, 72.95 18.90, 72.95 19.18, 72.80 19.18, 72.80 18.90)))'),
   '2026-01-01','2026-12-31',96)
on conflict (contract_no) do nothing;

-- ============================================================
-- 6. Assets
-- ============================================================
insert into assets (code, name, kind, ward_id, geom) values
  ('RD-M-0442','LBS Marg service road','road',(select id from wards where code='M-East'),
   st_geogfromtext('LINESTRING(72.905 19.045, 72.925 19.058)')),
  ('RD-N-0118','Ghatkopar Link Road','road',(select id from wards where code='N'),
   st_geogfromtext('LINESTRING(72.905 19.085, 72.930 19.098)')),
  ('RD-K-0507','Andheri Link Road','road',(select id from wards where code='K-West'),
   st_geogfromtext('LINESTRING(72.828 19.118, 72.845 19.142)')),
  ('RD-G-0233','Senapati Bapat Marg','road',(select id from wards where code='G-North'),
   st_geogfromtext('LINESTRING(72.832 19.028, 72.850 19.045)')),
  ('DR-L-0071','Kurla nullah','drain',(select id from wards where code='L'),
   st_geogfromtext('LINESTRING(72.882 19.070, 72.902 19.085)')),
  ('MK-N-0012','Ghatkopar market square','market',(select id from wards where code='N'),
   st_geogfromtext('POINT(72.908 19.086)')),
  ('MK-M-0004','Govandi station market','market',(select id from wards where code='M-East'),
   st_geogfromtext('POINT(72.922 19.045)'))
on conflict (code) do nothing;

-- ============================================================
-- 7. Accounts
-- auth.users first; the on_auth_user_created trigger fills profiles,
-- then roles and officer records are set here.
-- ============================================================
do $$
declare
  person record;
  uid uuid;
  pwd text := crypt('CivicLense@2026', gen_salt('bf'));
begin
  for person in
    select * from (values
      ('superadmin@mcgm.gov.in',  'Meera Kulkarni',  'global_admin', null),
      ('roads.head@mcgm.gov.in',  'Anil Deshpande',  'super_admin',  'ROADS'),
      ('waste.head@mcgm.gov.in',  'Farida Qureshi',  'super_admin',  'SWM'),
      ('water.head@mcgm.gov.in',  'Sunil Patil',     'super_admin',  'WATER'),
      ('health.head@mcgm.gov.in', 'Rekha Nair',      'super_admin',  'HEALTH'),
      ('r.kumar@mcgm.gov.in',     'Rajesh Kumar',    'officer',      'ROADS'),
      ('p.nair@mcgm.gov.in',      'Priya Nair',      'officer',      'ROADS'),
      ('v.shinde@mcgm.gov.in',    'Vikram Shinde',   'officer',      'ROADS'),
      ('i.shaikh@mcgm.gov.in',    'Imran Shaikh',    'officer',      'SWM'),
      ('s.gaikwad@mcgm.gov.in',   'Sneha Gaikwad',   'officer',      'SWM'),
      ('m.pawar@mcgm.gov.in',     'Mahesh Pawar',    'officer',      'SWM'),
      ('a.deshmukh@mcgm.gov.in',  'Anita Deshmukh',  'officer',      'WATER'),
      ('k.rane@mcgm.gov.in',      'Kiran Rane',      'officer',      'WATER'),
      ('d.jadhav@mcgm.gov.in',    'Deepak Jadhav',   'officer',      'DRAIN'),
      ('n.fernandes@mcgm.gov.in', 'Nisha Fernandes', 'officer',      'LIGHT'),
      ('t.more@mcgm.gov.in',      'Tushar More',     'officer',      'HEALTH'),
      ('g.bhosale@mcgm.gov.in',   'Ganesh Bhosale',  'officer',      'TRAFFIC'),
      ('iffat.khan@example.com',  'Iffat Khan',      'citizen',      null),
      ('juveriya@example.com',    'Juveriya Sayyed', 'citizen',      null),
      ('simran.w@example.com',    'Simran Waghmare', 'citizen',      null),
      ('gauri.k@example.com',     'Gauri Khatokar',  'citizen',      null),
      ('rohit.m@example.com',     'Rohit Mhatre',    'citizen',      null),
      ('ayesha.s@example.com',    'Ayesha Shaikh',   'citizen',      null),
      ('nikhil.p@example.com',    'Nikhil Prabhu',   'citizen',      null),
      ('divya.r@example.com',     'Divya Raut',      'citizen',      null),
      ('arif.h@example.com',      'Arif Hussain',    'citizen',      null),
      ('sneha.d@example.com',     'Sneha Dalvi',     'citizen',      null),
      ('omkar.j@example.com',     'Omkar Joshi',     'citizen',      null),
      ('fatima.a@example.com',    'Fatima Ansari',   'citizen',      null),
      ('pranav.s@example.com',    'Pranav Sawant',   'citizen',      null),
      ('leena.t@example.com',     'Leena Thakur',    'citizen',      null),
      ('yash.k@example.com',      'Yash Kadam',      'citizen',      null)
    ) as t(email, full_name, role, dept)
  loop
    select id into uid from auth.users where email = person.email;

    if uid is null then
      uid := gen_random_uuid();

      insert into auth.users (
        instance_id, id, aud, role, email, encrypted_password,
        email_confirmed_at, created_at, updated_at,
        raw_app_meta_data, raw_user_meta_data,
        confirmation_token, recovery_token, email_change_token_new, email_change
      ) values (
        '00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated',
        person.email, pwd, now(), now() - interval '60 days', now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        jsonb_build_object('full_name', person.full_name),
        '', '', '', ''
      );

      -- Newer Supabase needs an identity row before a password login works.
      insert into auth.identities (
        id, user_id, identity_data, provider, provider_id,
        last_sign_in_at, created_at, updated_at
      ) values (
        gen_random_uuid(), uid,
        jsonb_build_object('sub', uid::text, 'email', person.email),
        'email', person.email, now(), now(), now()
      ) on conflict do nothing;
    end if;

    insert into profiles (id, full_name, role, language)
    values (uid, person.full_name, person.role::app_role, 'en')
    on conflict (id) do update
      set full_name = excluded.full_name, role = excluded.role;

    -- Staff get an approved officer record. The global admin does not: it is
    -- seeded rather than appointed, and belongs to no single department.
    if person.role in ('officer', 'super_admin') then
      insert into officers (id, department_id, base_location, active, approved_at, designation, employee_id)
      values (
        uid,
        (select id from departments where code = person.dept),
        st_setsrid(st_makepoint(72.82 + random() * 0.12, 18.92 + random() * 0.24), 4326)::geography,
        true, now() - interval '45 days',
        case person.role when 'super_admin' then 'Ward Officer' else 'Junior Engineer' end,
        'MCGM' || lpad((floor(random() * 9000) + 1000)::text, 4, '0')
      )
      on conflict (id) do update
        set department_id = excluded.department_id,
            active = true,
            approved_at = coalesce(officers.approved_at, excluded.approved_at);
    end if;
  end loop;

  update officers
  set approved_by = (select id from profiles where role = 'global_admin' limit 1)
  where approved_by is null;
end $$;

-- ============================================================
-- 7b. Pending staff requests
--
-- Two waiting on the global admin (super admin requests) and three waiting on
-- department super admins (officer requests), so both approval queues have
-- something in them rather than showing an empty state on first load.
-- ============================================================
do $$
declare
  person record;
  uid uuid;
  pwd text := crypt('CivicLense@2026', gen_salt('bf'));
begin
  for person in
    select * from (values
      ('traffic.head@mcgm.gov.in', 'Sanjay Bhosle',  'super_admin', 'TRAFFIC', 'Deputy Engineer'),
      ('light.head@mcgm.gov.in',   'Neha Kamath',    'super_admin', 'LIGHT',   'Ward Officer'),
      ('a.borkar@mcgm.gov.in',     'Ajay Borkar',    'officer',     'ROADS',   'Junior Engineer'),
      ('r.pillai@mcgm.gov.in',     'Reshma Pillai',  'officer',     'SWM',     'Sanitary Inspector'),
      ('s.kale@mcgm.gov.in',       'Sagar Kale',     'officer',     'WATER',   'Junior Engineer')
    ) as t(email, full_name, role, dept, designation)
  loop
    select id into uid from auth.users where email = person.email;

    if uid is null then
      uid := gen_random_uuid();

      insert into auth.users (
        instance_id, id, aud, role, email, encrypted_password,
        email_confirmed_at, created_at, updated_at,
        raw_app_meta_data, raw_user_meta_data,
        confirmation_token, recovery_token, email_change_token_new, email_change
      ) values (
        '00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated',
        person.email, pwd, now(), now() - interval '4 days', now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        jsonb_build_object('full_name', person.full_name),
        '', '', '', ''
      );

      insert into auth.identities (
        id, user_id, identity_data, provider, provider_id,
        last_sign_in_at, created_at, updated_at
      ) values (
        gen_random_uuid(), uid,
        jsonb_build_object('sub', uid::text, 'email', person.email),
        'email', person.email, now(), now(), now()
      ) on conflict do nothing;
    end if;

    -- An applicant is an ordinary resident until somebody approves them.
    insert into profiles (id, full_name, role, language)
    values (uid, person.full_name, 'citizen'::app_role, 'en')
    on conflict (id) do update set full_name = excluded.full_name;

    insert into staff_applications
      (user_id, email, full_name, employee_id, requested_role, department_id,
       designation, phone, justification, status, created_at)
    values (
      uid, person.email, person.full_name,
      'MCGM' || lpad((floor(random()*9000)+1000)::text, 4, '0'),
      person.role::app_role,
      (select id from departments where code = person.dept),
      person.designation, '+91 98' || lpad((floor(random()*90000000)+10000000)::text, 8, '0'),
      'Transferred into this posting this month and need access to the complaint queue.',
      'pending', now() - ((random()*3+1) || ' days')::interval
    )
    on conflict (user_id) do nothing;
  end loop;
end $$;

-- ============================================================
-- 8. Complaints
-- Generated only when the table is empty, so re-running does not pile up.
-- ============================================================
do $$
declare
  scattered int := 180;
  i int; k int;
  cat record; ward_row record;
  citizen_id uuid; officer_id uuid;
  lat double precision; lng double precision;
  sev severity; st complaint_status;
  created timestamptz; resolved timestamptz; age_days numeric;
  spot jsonb;
  hotspots jsonb := '[
    {"lat":19.0860,"lng":72.9080,"cat":"GARBAGE","n":26},
    {"lat":19.0720,"lng":72.9010,"cat":"POTHOLE","n":22},
    {"lat":19.0560,"lng":72.9020,"cat":"LEAK","n":14},
    {"lat":19.1190,"lng":72.8460,"cat":"DUMPING","n":12},
    {"lat":19.0280,"lng":72.8420,"cat":"DRAINBLOCK","n":11}
  ]'::jsonb;
begin
  if (select count(*) from complaints) > 0 then
    raise notice 'Complaints already present - skipping generation.';
    return;
  end if;

  perform setseed(0.4242);

  -- 8a. Tight clusters around five hotspots, so grouping is visible on the map.
  for spot in select * from jsonb_array_elements(hotspots) loop
    select * into cat from categories where code = (spot->>'cat');

    for k in 1..(spot->>'n')::int loop
      select id into citizen_id from profiles where role = 'citizen' order by random() limit 1;
      select o.id into officer_id from officers o
        where o.department_id = cat.default_department_id order by random() limit 1;

      lat := (spot->>'lat')::double precision + (random() - 0.5) * 0.0028;
      lng := (spot->>'lng')::double precision + (random() - 0.5) * 0.0028;

      age_days := power(random(), 1.7) * 20;
      created := now() - (age_days || ' days')::interval;
      sev := (array['low','medium','medium','high','high','critical'])[floor(random()*6+1)]::severity;

      st := case
              when random() < 0.35 then 'resolved'
              when random() < 0.55 then 'work_started'
              when random() < 0.75 then 'assigned'
              else 'under_review'
            end::complaint_status;

      resolved := case when st = 'resolved' then created + ((random()*90+4) || ' hours')::interval end;

      insert into complaints (
        citizen_id, description_original, description_lang, location, ward_id, address,
        category_id, department_id, ai_confidence, severity, severity_score,
        authenticity, authenticity_confidence, assigned_officer, status,
        created_at, updated_at, resolved_at
      ) values (
        citizen_id,
        (array['Been like this for weeks, nobody has come.',
               'Getting worse after the rain.',
               'Right outside the school gate.',
               'Third time I am reporting this.',
               null, null])[floor(random()*6+1)],
        'en',
        st_setsrid(st_makepoint(lng, lat), 4326)::geography,
        (select id from wards
         where st_intersects(geom, st_setsrid(st_makepoint(lng, lat), 4326)::geography)
         order by st_area(geom::geometry) asc limit 1),
        cat.name || ' near ' ||
          (array['the market','the station','the school','the bus stop','the junction'])[floor(random()*5+1)],
        cat.id, cat.default_department_id,
        floor(random()*22+76), sev, floor(random()*60+30),
        case when random() < 0.05 then 'possibly_ai_generated' else 'likely_genuine' end::authenticity,
        floor(random()*25+72),
        case when st <> 'under_review' then officer_id end,
        st, created, coalesce(resolved, created), resolved
      );
    end loop;
  end loop;

  -- 8b. Scattered reports across every ward and category.
  for i in 1..scattered loop
    select * into cat from categories order by random() limit 1;
    select * into ward_row from wards where code <> 'MUMBAI' order by random() limit 1;
    select id into citizen_id from profiles where role = 'citizen' order by random() limit 1;
    select o.id into officer_id from officers o
      where o.department_id = cat.default_department_id order by random() limit 1;

    lng := st_xmin(ward_row.geom::geometry) +
           random() * (st_xmax(ward_row.geom::geometry) - st_xmin(ward_row.geom::geometry));
    lat := st_ymin(ward_row.geom::geometry) +
           random() * (st_ymax(ward_row.geom::geometry) - st_ymin(ward_row.geom::geometry));

    age_days := power(random(), 1.6) * 75;
    created := now() - (age_days || ' days')::interval;
    sev := (array['low','low','medium','medium','high','critical'])[floor(random()*6+1)]::severity;

    -- Older reports are far more likely to be closed.
    st := case
            when random() < least(0.82, age_days / 75.0 + 0.15) then 'resolved'
            when random() < 0.4 then 'verification'
            when random() < 0.6 then 'work_started'
            when random() < 0.8 then 'assigned'
            else 'submitted'
          end::complaint_status;

    resolved := case when st = 'resolved' then created + ((random()*120+3) || ' hours')::interval end;

    insert into complaints (
      citizen_id, description_original, description_lang, location, ward_id, address,
      category_id, department_id, ai_confidence, severity, severity_score,
      authenticity, authenticity_confidence, assigned_officer, status,
      created_at, updated_at, resolved_at
    ) values (
      citizen_id, null, 'en',
      st_setsrid(st_makepoint(lng, lat), 4326)::geography,
      ward_row.id,
      cat.name || ', ' || ward_row.name,
      cat.id, cat.default_department_id,
      floor(random()*24+74), sev, floor(random()*65+25),
      case when random() < 0.04 then 'possibly_ai_generated' else 'likely_genuine' end::authenticity,
      floor(random()*26+70),
      case when st <> 'submitted' then officer_id end,
      st, created, coalesce(resolved, created), resolved
    );
  end loop;

  raise notice 'Generated % complaints.', (select count(*) from complaints);
end $$;

-- ============================================================
-- 9. Clusters, built from proximity
-- ============================================================
insert into clusters (category_id, department_id, centroid, radius_m,
                      report_count, citizen_count, first_reported, last_reported,
                      is_hotspot, trend_pct)
select c.category_id, c.department_id,
       st_centroid(st_collect(c.location::geometry))::geography,
       150, count(*), count(distinct c.citizen_id),
       min(c.created_at), max(c.created_at),
       count(*) >= 12,
       round((random()*70+10)::numeric, 1)
from complaints c
where c.cluster_id is null and c.location is not null
group by c.category_id, c.department_id,
         round(st_x(c.location::geometry)::numeric, 3),
         round(st_y(c.location::geometry)::numeric, 3)
having count(*) > 1;

update complaints c
set cluster_id = cl.id
from clusters cl
where c.cluster_id is null
  and c.category_id = cl.category_id
  and st_dwithin(c.location, cl.centroid, cl.radius_m);

-- Radius in a second pass: it measures distance from the centroid, and the
-- centroid is itself an aggregate — nesting the two is not allowed.
with spreads as (
  select c.cluster_id,
         round(max(st_distance(c.location, cl.centroid))::numeric)::int as spread
  from complaints c
  join clusters cl on cl.id = c.cluster_id
  group by c.cluster_id
)
update clusters cl
set radius_m = greatest(120, spreads.spread)
from spreads where cl.id = spreads.cluster_id;

update clusters set is_emerging = true
where not is_hotspot and report_count between 4 and 11;

-- ============================================================
-- 10. Proof of work and resident verification
-- ============================================================
insert into resolution_proofs
  (complaint_id, officer_id, notes, ai_scene_match, ai_change_detected,
   ai_verdict, ai_verdict_summary, admin_verified_by, admin_verified_at)
select c.id, c.assigned_officer,
       'Work completed and site cleared.',
       floor(random()*18+80), true, 'likely_completed',
       'Same viewpoint in both photographs. The reported defect is no longer present.',
       (select id from profiles where role = 'super_admin' order by random() limit 1),
       c.resolved_at
from complaints c
where c.status = 'resolved' and c.assigned_officer is not null;

insert into complaint_feedback (complaint_id, citizen_id, resolved, rating, at)
select c.id, c.citizen_id, random() > 0.12, floor(random()*2+4)::int,
       c.resolved_at + interval '3 hours'
from complaints c
where c.status = 'resolved'
on conflict (complaint_id) do nothing;

-- Anyone who said it was not fixed gets their complaint reopened, which is
-- exactly what the product promises.
update complaints c
set status = 'reopened'::complaint_status, resolved_at = null, escalation_level = 1
from complaint_feedback f
where f.complaint_id = c.id and f.resolved = false;

-- ============================================================
-- 11. Status history, so timelines are not empty
-- ============================================================
insert into complaint_status_history (complaint_id, from_status, to_status, actor, at)
select c.id, 'submitted'::complaint_status, 'ai_analysis'::complaint_status,
       c.citizen_id, c.created_at + interval '20 seconds'
from complaints c;

insert into complaint_status_history (complaint_id, from_status, to_status, actor, at)
select c.id, 'ai_analysis'::complaint_status, 'assigned'::complaint_status,
       c.assigned_officer, c.created_at + interval '2 hours'
from complaints c where c.assigned_officer is not null;

insert into complaint_status_history (complaint_id, from_status, to_status, actor, at)
select c.id, 'work_started'::complaint_status, 'resolved'::complaint_status,
       c.assigned_officer, c.resolved_at
from complaints c where c.status = 'resolved';

-- ============================================================
-- 12. Badges and points
-- ============================================================
insert into badges (code, name, criteria) values
  ('FIRST',    'First report',       '{"valid_reports":1}'),
  ('WATCHER',  'Civic watcher',      '{"valid_reports":10}'),
  ('GUARDIAN', 'Community guardian', '{"valid_reports":50}'),
  ('FINDER',   'Group finder',       '{"clusters_started":1}'),
  ('VERIFIER', 'Verifier',           '{"resolved":5}')
on conflict (code) do nothing;

insert into reward_events (citizen_id, reason, points, complaint_id, at)
select c.citizen_id, 'valid_report', 10, c.id, c.created_at
from complaints c where c.status <> 'rejected';

insert into reward_events (citizen_id, reason, points, complaint_id, at)
select f.citizen_id, 'confirmed_resolution', 20, f.complaint_id, f.at
from complaint_feedback f where f.resolved;

insert into citizen_badges (citizen_id, badge_id)
select p.id, b.id
from profiles p join badges b on b.code = 'FIRST'
where p.role = 'citizen'
  and exists (select 1 from complaints c where c.citizen_id = p.id)
on conflict do nothing;

insert into citizen_badges (citizen_id, badge_id)
select p.id, b.id
from profiles p join badges b on b.code = 'WATCHER'
where p.role = 'citizen'
  and (select count(*) from complaints c where c.citizen_id = p.id) >= 10
on conflict do nothing;

-- ============================================================
-- 13. Notifications
-- ============================================================
insert into notifications (user_id, kind, title, body, complaint_id, created_at, read_at)
select c.citizen_id, 'routed', 'Department assigned',
       c.ref || ' was routed to ' || d.name || '.',
       c.id, c.created_at + interval '3 minutes',
       case when random() > 0.4 then c.created_at + interval '1 hour' end
from complaints c
join departments d on d.id = c.department_id
where c.created_at > now() - interval '20 days';

insert into notifications (user_id, kind, title, body, complaint_id, created_at)
select c.citizen_id, 'verify', 'Confirm the fix',
       'The officer has marked ' || c.ref || ' complete. Tell us whether it is actually fixed.',
       c.id, c.updated_at
from complaints c where c.status = 'verification';

-- ============================================================
-- 14. Audit trail
-- ============================================================
insert into audit_logs (actor, action, entity, entity_id, after, at)
select c.assigned_officer, 'officer.assign', 'complaints', c.ref,
       jsonb_build_object('officer_id', c.assigned_officer),
       c.created_at + interval '2 hours'
from complaints c
where c.assigned_officer is not null and c.created_at > now() - interval '30 days';

insert into audit_logs (actor, action, entity, entity_id, after, at)
select null, 'sla.breach', 'complaints', c.ref,
       jsonb_build_object('escalation_level', 1), c.sla_deadline
from complaints c
where c.sla_deadline < now() and c.resolved_at is null;

-- ============================================================
-- Summary
-- ============================================================
do $$
declare s record;
begin
  select
    (select count(*) from departments)                          as departments,
    (select count(*) from categories)                           as categories,
    (select count(*) from wards)                                as wards,
    (select count(*) from contracts)                            as contracts,
    (select count(*) from profiles where role='global_admin')   as global_admins,
    (select count(*) from profiles where role='super_admin')    as super_admins,
    (select count(*) from profiles where role='officer')        as officers,
    (select count(*) from profiles where role='citizen')        as residents,
    (select count(*) from complaints)                           as complaints,
    (select count(*) from complaints where status='resolved')   as resolved,
    (select count(*) from complaints
       where sla_deadline < now() and resolved_at is null)      as overdue,
    (select count(*) from clusters)                             as clusters,
    (select count(*) from clusters where is_hotspot)            as hotspots,
    (select count(*) from staff_applications where status='pending') as pending_staff
  into s;

  raise notice E'\n=== CivicLense seed complete ===\ndepartments % | categories % | wards % | contracts %\nglobal admins % | super admins % | officers % | residents %\ncomplaints % (% resolved, % overdue)\nclusters % (% hotspots) | staff requests awaiting approval: %\n\nPassword for every account: CivicLense@2026\n  superadmin@mcgm.gov.in  global admin\n  roads.head@mcgm.gov.in  super admin, Roads\n  r.kumar@mcgm.gov.in     officer, Roads\n  iffat.khan@example.com  resident\n',
    s.departments, s.categories, s.wards, s.contracts,
    s.global_admins, s.super_admins, s.officers, s.residents,
    s.complaints, s.resolved, s.overdue, s.clusters, s.hotspots, s.pending_staff;
end $$;
