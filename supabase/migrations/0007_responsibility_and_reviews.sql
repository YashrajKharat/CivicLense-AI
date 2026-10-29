-- CivicLense 0007 — who is actually answerable, and what the resident thought
--
-- Two gaps this closes.
--
-- 1. "Responsible party" was only ever a maintenance contractor. That is right
--    for a pothole — some agency is paid to keep that road intact — but wrong
--    for a dirty kitchen, where the answerable party is the establishment and
--    the person whose licence is on the wall. Both are now modelled, and the
--    Responsibility Spine resolves to whichever applies.
--
-- 2. A thumbs up closed a complaint but recorded nothing about the quality of
--    the work. Residents can now leave a written review, which is what turns a
--    closure rate into something an administrator can actually trust.

-- ============================================================
-- 1. Establishments — the answerable party when there is no contract
-- ============================================================
create type establishment_kind as enum (
  'restaurant', 'food_stall', 'shop', 'market', 'construction_site',
  'housing_society', 'clinic', 'other'
);

create table if not exists establishments (
  id serial primary key,
  name text not null,
  kind establishment_kind not null default 'other',
  owner_name text,
  owner_phone text,
  licence_no text,                       -- FSSAI, shop & establishment, etc.
  licence_authority text,
  licence_expires date,
  ward_id int references wards(id),
  address text,
  location geography(point,4326),
  active boolean default true,
  created_at timestamptz default now()
);
create index if not exists establishments_geo on establishments using gist(location);
create index if not exists establishments_ward on establishments(ward_id);

alter table complaints
  add column if not exists establishment_id int references establishments(id);
create index if not exists complaints_establishment on complaints(establishment_id);

-- Which categories point at an establishment rather than a contract. A dirty
-- food stall has an owner; a pothole has a contractor. Keeping this in a table
-- rather than in code means a new category does not need a deploy.
alter table categories
  add column if not exists responsible_party text not null default 'contractor'
    check (responsible_party in ('contractor', 'establishment', 'department'));

update categories set responsible_party = 'establishment'
where code in ('FOODSTALL','FOODSTORAGE','HAWKER','ENCROACHMENT','DEBRIS');

update categories set responsible_party = 'department'
where code in ('NOWATER','TOILET','PARKDAMAGE');

-- ============================================================
-- 2. Resolution follows whichever party is answerable
-- ============================================================
drop function if exists resolve_responsibility(geography, int) cascade;

create or replace function resolve_responsibility(p_point geography, p_category int)
returns table (
  ward_id int, ward_code text, zone_id int, zone_name text, authority text,
  asset_code text, asset_name text,
  department_id int, department_name text,
  responsible_party text,
  contract_id int, contract_no text, agency text, contract_ends date,
  establishment_id int, establishment_name text, establishment_kind text,
  owner_name text, licence_no text, licence_authority text, licence_expires date
)
language sql stable as $$
  with ward as (
    select w.id, w.code, w.zone_id
    from wards w
    where st_intersects(w.geom, p_point)
    -- A specific ward must win over the city-wide catch-all.
    order by st_area(w.geom::geometry) asc
    limit 1
  ),
  cat as (select * from categories where id = p_category)
  select
    ward.id, ward.code, z.id, z.name, coalesce(d.authority, 'MCGM'),
    a.code, a.name,
    coalesce(j.department_id, cat.default_department_id), d.name,
    coalesce(cat.responsible_party, 'contractor'),
    ct.id, ct.contract_no, ct.agency, ct.ends_on,
    e.id, e.name, e.kind::text, e.owner_name, e.licence_no, e.licence_authority, e.licence_expires
  from ward
  left join zones z on z.id = ward.zone_id
  left join cat on true
  left join jurisdictions j on j.ward_id = ward.id and j.category_id = p_category
  left join departments d on d.id = coalesce(j.department_id, cat.default_department_id)
  left join lateral (
    select code, name from assets
    where ward_id = ward.id
    order by st_distance(geom, p_point)
    limit 1
  ) a on true
  -- Contract: only for categories a maintenance agency is paid to cover.
  left join lateral (
    select c2.id, c2.contract_no, c2.agency, c2.ends_on
    from contracts c2
    where coalesce(cat.responsible_party, 'contractor') = 'contractor'
      and st_intersects(c2.coverage, p_point)
      and c2.department_id = coalesce(j.department_id, cat.default_department_id)
      and current_date between c2.starts_on and c2.ends_on
    limit 1
  ) ct on true
  -- Establishment: nearest licensed premises within 80m, for categories where
  -- the answerable party is a business rather than a contractor.
  left join lateral (
    select e2.id, e2.name, e2.kind, e2.owner_name, e2.licence_no,
           e2.licence_authority, e2.licence_expires
    from establishments e2
    where cat.responsible_party = 'establishment'
      and e2.active
      and st_dwithin(e2.location, p_point, 80)
    order by st_distance(e2.location, p_point)
    limit 1
  ) e on true;
$$;

-- ============================================================
-- 3. Resident reviews
-- ============================================================
create table if not exists complaint_reviews (
  id bigserial primary key,
  complaint_id bigint references complaints(id) on delete cascade,
  citizen_id uuid references profiles(id) on delete cascade,
  rating int not null check (rating between 1 and 5),
  speed_rating int check (speed_rating between 1 and 5),
  quality_rating int check (quality_rating between 1 and 5),
  comment text,
  would_report_again boolean,
  created_at timestamptz default now(),
  unique (complaint_id)
);
create index if not exists complaint_reviews_recent on complaint_reviews (created_at desc);

-- A review belongs to the person who filed the complaint, and only once it is
-- actually resolved — otherwise it is a review of nothing.
alter table complaint_reviews enable row level security;

drop policy if exists "citizens write own reviews" on complaint_reviews;
create policy "citizens write own reviews" on complaint_reviews for insert
  with check (
    citizen_id = auth.uid()
    and exists (
      select 1 from complaints c
      where c.id = complaint_id and c.citizen_id = auth.uid() and c.status = 'resolved'
    )
  );

drop policy if exists "citizens read own reviews" on complaint_reviews;
create policy "citizens read own reviews" on complaint_reviews for select
  using (citizen_id = auth.uid());

drop policy if exists "staff read reviews" on complaint_reviews;
create policy "staff read reviews" on complaint_reviews for select
  using (exists (select 1 from profiles p where p.id = auth.uid()
                 and p.role in ('officer','super_admin','global_admin')));

-- Officer and agency scorecards read from here.
create or replace view officer_ratings as
select o.id as officer_id,
       count(r.id)::int                        as reviews,
       round(avg(r.rating)::numeric, 1)        as avg_rating,
       round(avg(r.speed_rating)::numeric, 1)  as avg_speed,
       round(avg(r.quality_rating)::numeric, 1) as avg_quality
from officers o
left join complaints c on c.assigned_officer = o.id
left join complaint_reviews r on r.complaint_id = c.id
group by o.id;

create or replace view agency_scorecard as
select ct.id as contract_id, ct.contract_no, ct.agency,
       count(distinct c.id)::int                                                  as linked,
       count(distinct c.id) filter (where c.status = 'resolved')::int             as resolved,
       count(distinct c.id) filter (where c.sla_deadline < now()
                                      and c.resolved_at is null)::int             as overdue,
       round(avg(r.rating)::numeric, 1)                                           as avg_rating,
       count(r.id)::int                                                           as reviews
from contracts ct
left join complaints c on c.contract_id = ct.id
left join complaint_reviews r on r.complaint_id = c.id
group by ct.id, ct.contract_no, ct.agency;

-- ============================================================
-- 4. Seed establishments, so food and encroachment complaints resolve
-- ============================================================
insert into establishments (name, kind, owner_name, owner_phone, licence_no, licence_authority, licence_expires, ward_id, address, location) values
  ('Sharma Snack Centre','food_stall','Ramesh Sharma','+91 98200 11223','11522004000234','FSSAI','2026-11-30',
   (select id from wards where code='N'), 'Ghatkopar market square',
   st_setsrid(st_makepoint(72.9081, 19.0861),4326)::geography),
  ('Gokul Family Restaurant','restaurant','Nitin Gokhale','+91 98200 33445','11519008800112','FSSAI','2027-03-31',
   (select id from wards where code='N'), 'LBS Marg, opposite the station',
   st_setsrid(st_makepoint(72.9092, 19.0870),4326)::geography),
  ('Al-Noor Bakery','shop','Imtiaz Ali','+91 98200 55667','11521003300998','FSSAI','2026-08-31',
   (select id from wards where code='L'), 'Kurla East main road',
   st_setsrid(st_makepoint(72.8830, 19.0705),4326)::geography),
  ('Sai Juice Corner','food_stall','Sunita Kadam','+91 98200 77889','11523001100455','FSSAI','2026-06-30',
   (select id from wards where code='M-East'), 'Govandi station road',
   st_setsrid(st_makepoint(72.9221, 19.0451),4326)::geography),
  ('Metro Chinese Corner','food_stall','Wei Lin Chen','+91 98200 99001','11520006600321','FSSAI','2027-01-31',
   (select id from wards where code='K-West'), 'Andheri Link Road',
   st_setsrid(st_makepoint(72.8285, 19.1185),4326)::geography),
  ('Shree Ganesh Construction','construction_site','Deepak Shetty','+91 98200 22334','MCGM/CC/2026/0871','MCGM Building Proposal','2027-06-30',
   (select id from wards where code='K-East'), 'Chakala plot 14',
   st_setsrid(st_makepoint(72.8702, 19.1122),4326)::geography),
  ('Sunrise Co-operative Housing Society','housing_society','Mrs. A. Fernandes (Secretary)','+91 98200 44556','MCGM/SOC/1998/2210','Registrar of Societies',null,
   (select id from wards where code='H-West'), 'Hill Road',
   st_setsrid(st_makepoint(72.8261, 19.0605),4326)::geography),
  ('Bandra Hawkers Zone A','market','Ward Market Committee','+91 98200 66778','MCGM/HWK/2025/0042','MCGM Markets','2026-12-31',
   (select id from wards where code='H-West'), 'Linking Road service lane',
   st_setsrid(st_makepoint(72.8340, 19.0700),4326)::geography)
on conflict do nothing;

-- Attach existing food and encroachment complaints to the nearest premises.
update complaints c
set establishment_id = e.id
from establishments e, categories cat
where c.category_id = cat.id
  and cat.responsible_party = 'establishment'
  and c.establishment_id is null
  and st_dwithin(c.location, e.location, 200);

-- ============================================================
-- 5. Backfill reviews for already-resolved complaints
-- ============================================================
insert into complaint_reviews
  (complaint_id, citizen_id, rating, speed_rating, quality_rating, comment, would_report_again, created_at)
select c.id, c.citizen_id,
       r.rating, greatest(1, r.rating - (random() < 0.3)::int), r.rating,
       (array[
         'Fixed properly, took longer than it should have.',
         'Officer came the next morning. No complaints.',
         'Patched but already cracking again.',
         'Quick work once it was assigned. The wait before that was the problem.',
         'Done well. Thank you.',
         null, null
       ])[floor(random()*7+1)],
       random() > 0.1,
       c.resolved_at + interval '6 hours'
from complaints c
join lateral (select floor(random()*2+4)::int as rating) r on true
where c.status = 'resolved'
  and c.resolved_at is not null
  and random() < 0.55          -- not everybody leaves a review
on conflict (complaint_id) do nothing;
