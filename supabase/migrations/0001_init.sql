-- CivicLense AI — Supabase / PostgreSQL + PostGIS schema
-- Drop Mongo. One database. PostGIS is what makes clustering and jurisdiction real.

create extension if not exists postgis;
create extension if not exists pg_trgm;      -- text similarity for duplicate detection
create extension if not exists vector;       -- image/text embeddings for cluster matching

-- ============ identity & org ============
create type app_role as enum ('citizen','officer','dept_admin','global_admin');

create table profiles (
  id uuid primary key references auth.users on delete cascade,
  role app_role not null default 'citizen',
  full_name text,
  phone text,
  language char(2) not null default 'en',      -- en | hi | mr
  points int not null default 0,
  created_at timestamptz default now()
);

create table departments (
  id serial primary key,
  code text unique not null,                   -- ROADS, SWM, WATER, LIGHT, TRAFFIC, HEALTH, FSSAI
  name text not null,
  authority text not null default 'MCGM',      -- jurisdiction is configurable, not hardcoded
  sla_hours jsonb not null default '{"critical":12,"high":24,"medium":72,"low":168}'
);

create table officers (
  id uuid primary key references profiles(id) on delete cascade,
  department_id int references departments(id),
  base_location geography(point,4326),
  specializations text[] default '{}',
  active boolean default true
);

-- ============ geography ============
create table zones (id serial primary key, name text not null, geom geography(multipolygon,4326));
create table wards (
  id serial primary key, code text unique not null, name text,
  zone_id int references zones(id), geom geography(multipolygon,4326)
);
create index wards_geom_idx on wards using gist(geom);

-- which department owns which category in which ward — configurable jurisdiction
create table jurisdictions (
  id serial primary key,
  ward_id int references wards(id),
  category_id int,
  department_id int references departments(id),
  authority text,
  unique (ward_id, category_id)
);

create table assets (
  id serial primary key, code text unique, name text, kind text,   -- road, drain, pole, bin
  ward_id int references wards(id), geom geography(geometry,4326)
);
create index assets_geom_idx on assets using gist(geom);

-- ============ contracts (entered by admins, never scraped) ============
create table contracts (
  id serial primary key,
  contract_no text unique not null,
  scope text not null,
  agency text not null,
  department_id int references departments(id),
  coverage geography(multipolygon,4326),
  responsible_officer uuid references profiles(id),
  starts_on date not null, ends_on date not null,
  sla_hours int default 72,
  document_url text
);
create index contracts_geom_idx on contracts using gist(coverage);
create table contract_assets (contract_id int references contracts(id), asset_id int references assets(id),
  primary key (contract_id, asset_id));

-- ============ taxonomy ============
create table categories (
  id serial primary key, code text unique, name text, parent_id int references categories(id),
  default_department_id int references departments(id), base_severity int default 30
);

-- ============ complaints ============
create type complaint_status as enum
  ('submitted','ai_analysis','under_review','accepted','assigned','work_started',
   'work_completed','verification','resolved','reopened','rejected');
create type severity as enum ('low','medium','high','critical');
create type authenticity as enum ('likely_genuine','possibly_ai_generated','possibly_manipulated','undetermined');

create table complaints (
  id bigserial primary key,
  ref text unique not null default 'CP-' || nextval('complaints_id_seq'),
  citizen_id uuid references profiles(id),
  description_original text, description_lang char(2), description_canonical text,
  location geography(point,4326) not null,
  address text, ward_id int references wards(id), zone_id int references zones(id),
  asset_id int references assets(id),
  category_id int references categories(id),
  department_id int references departments(id),
  contract_id int references contracts(id),
  ai_confidence numeric(5,2), severity severity, severity_score int,
  authenticity authenticity, authenticity_confidence numeric(5,2),
  cluster_id bigint, is_duplicate boolean default false,
  assigned_officer uuid references officers(id),
  status complaint_status not null default 'submitted',
  sla_deadline timestamptz, escalation_level int default 0,
  created_at timestamptz default now(), updated_at timestamptz default now(), resolved_at timestamptz
);
create index complaints_geo_idx on complaints using gist(location);
create index complaints_status_idx on complaints(status, created_at desc);
create index complaints_desc_trgm on complaints using gin(description_canonical gin_trgm_ops);

create type image_role as enum ('report','before','after');
create table complaint_images (
  id bigserial primary key, complaint_id bigint references complaints(id) on delete cascade,
  storage_path text not null, role image_role default 'report',
  embedding vector(512),                       -- for image-similarity duplicate matching
  exif jsonb, uploaded_by uuid references profiles(id), created_at timestamptz default now()
);

create table complaint_ai_analysis (
  complaint_id bigint primary key references complaints(id) on delete cascade,
  model text, raw_response jsonb, severity_factors jsonb,
  summary text, analysed_at timestamptz default now()
);

create table complaint_status_history (
  id bigserial primary key, complaint_id bigint references complaints(id) on delete cascade,
  from_status complaint_status, to_status complaint_status, actor uuid references profiles(id),
  note text, at timestamptz default now()
);

-- ============ clustering ============
create table clusters (
  id bigserial primary key,
  ref text unique not null default 'CL-' || nextval('clusters_id_seq'),
  category_id int references categories(id), department_id int references departments(id),
  centroid geography(point,4326), radius_m int,
  report_count int default 0, citizen_count int default 0,
  first_reported timestamptz, last_reported timestamptz,
  trend_pct numeric(6,2), is_hotspot boolean default false, is_emerging boolean default false,
  contract_id int references contracts(id), summary text, recommended_action text,
  status complaint_status default 'submitted'
);
create index clusters_geo_idx on clusters using gist(centroid);
alter table complaints add constraint complaints_cluster_fk
  foreign key (cluster_id) references clusters(id);

-- ============ resolution & accountability ============
create table resolution_proofs (
  id bigserial primary key, complaint_id bigint references complaints(id) on delete cascade,
  before_image_id bigint references complaint_images(id),
  after_image_id bigint references complaint_images(id),
  officer_id uuid references officers(id), notes text,
  ai_scene_match numeric(5,2), ai_change_detected boolean, ai_verdict text,
  admin_verified_by uuid references profiles(id), admin_verified_at timestamptz,
  created_at timestamptz default now()
);

create table complaint_feedback (
  complaint_id bigint primary key references complaints(id) on delete cascade,
  citizen_id uuid references profiles(id), resolved boolean not null,
  rating int check (rating between 1 and 5), comment text, at timestamptz default now()
);

create table sla_rules (
  id serial primary key, category_id int references categories(id), severity severity,
  hours int not null, escalate_after_hours int
);

create table notifications (
  id bigserial primary key, user_id uuid references profiles(id), kind text,
  title text, body text, complaint_id bigint references complaints(id),
  read_at timestamptz, created_at timestamptz default now()
);

create table badges (id serial primary key, code text unique, name text, criteria jsonb);
create table citizen_badges (citizen_id uuid references profiles(id), badge_id int references badges(id),
  earned_at timestamptz default now(), primary key (citizen_id, badge_id));

create table audit_logs (
  id bigserial primary key, actor uuid references profiles(id), action text not null,
  entity text, entity_id text, before jsonb, after jsonb,
  ip inet, at timestamptz default now()
);
-- append-only: no update/delete policy is ever granted on audit_logs

-- ============ duplicate / cluster matching ============
-- Five signals: distance, time, category, text similarity, image similarity.
create or replace function find_cluster_candidate(
  p_point geography, p_category int, p_text text, p_embedding vector(512),
  p_radius int default 200, p_window interval default '72 hours'
) returns table (cluster_id bigint, score numeric)
language sql stable as $$
  select c.id,
         ( 0.35 * (1 - least(st_distance(c.centroid, p_point) / p_radius, 1))
         + 0.20 * (case when c.category_id = p_category then 1 else 0 end)
         + 0.20 * coalesce(similarity(c.summary, p_text), 0)
         + 0.25 * coalesce(1 - (min(ci.embedding <=> p_embedding)), 0)
         )::numeric as score
  from clusters c
  left join complaints cp on cp.cluster_id = c.id
  left join complaint_images ci on ci.complaint_id = cp.id and ci.role = 'report'
  where st_dwithin(c.centroid, p_point, p_radius)
    and c.last_reported > now() - p_window
    and c.status <> 'resolved'
  group by c.id
  order by score desc
  limit 1;
$$;

-- resolve a dropped pin to ward + department + contract in one query (the Responsibility Spine)
create or replace function resolve_responsibility(p_point geography, p_category int)
returns table (ward_id int, ward_code text, zone_id int, department_id int,
               department_name text, contract_id int, contract_no text, agency text)
language sql stable as $$
  select w.id, w.code, w.zone_id, coalesce(j.department_id, cat.default_department_id),
         d.name, ct.id, ct.contract_no, ct.agency
  from wards w
  left join categories cat on cat.id = p_category
  left join jurisdictions j on j.ward_id = w.id and j.category_id = p_category
  left join departments d on d.id = coalesce(j.department_id, cat.default_department_id)
  left join contracts ct on st_intersects(ct.coverage, p_point)
       and ct.department_id = coalesce(j.department_id, cat.default_department_id)
       and current_date between ct.starts_on and ct.ends_on
  where st_intersects(w.geom, p_point)
  limit 1;
$$;

-- ============ RLS ============
alter table complaints enable row level security;
alter table profiles enable row level security;
alter table audit_logs enable row level security;

create policy "citizens read own" on complaints for select
  using (citizen_id = auth.uid());
create policy "citizens insert own" on complaints for insert
  with check (citizen_id = auth.uid());
create policy "officers read own department" on complaints for select
  using (exists (select 1 from officers o where o.id = auth.uid() and o.department_id = complaints.department_id));
create policy "dept admins read own department" on complaints for select
  using (exists (select 1 from profiles p join officers o on o.id = p.id
                 where p.id = auth.uid() and p.role = 'dept_admin' and o.department_id = complaints.department_id));
create policy "global admins read all" on complaints for select
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'global_admin'));
create policy "audit is read only" on audit_logs for select
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('dept_admin','global_admin')));

-- SLA deadline on insert
create or replace function set_sla() returns trigger language plpgsql as $$
begin
  new.sla_deadline := now() + (
    coalesce((select hours from sla_rules where category_id = new.category_id and severity = new.severity),
      case new.severity when 'critical' then 12 when 'high' then 24 when 'medium' then 72 else 168 end)
  ) * interval '1 hour';
  return new;
end $$;
create trigger complaints_sla before insert on complaints
  for each row execute function set_sla();

-- status changes always write history + audit
create or replace function log_status() returns trigger language plpgsql as $$
begin
  if new.status is distinct from old.status then
    insert into complaint_status_history(complaint_id, from_status, to_status, actor)
      values (new.id, old.status, new.status, auth.uid());
    insert into audit_logs(actor, action, entity, entity_id, before, after)
      values (auth.uid(), 'complaint.status', 'complaints', new.id::text,
              jsonb_build_object('status', old.status), jsonb_build_object('status', new.status));
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger complaints_status after update on complaints
  for each row execute function log_status();

-- ============ analysis staging ============
-- Vision runs before the complaint row exists, so the result is parked here
-- until the citizen actually submits. Rows expire after a day.
create table pending_analyses (
  id uuid primary key default gen_random_uuid(),
  citizen_id uuid references profiles(id) on delete cascade,
  payload jsonb not null,
  storage_path text,
  created_at timestamptz default now()
);
create index pending_analyses_expiry on pending_analyses(created_at);

-- ============ richer responsibility resolution ============
-- Returns the whole accountability chain in one spatial query.
-- This is the query the Responsibility Spine renders.
drop function if exists resolve_responsibility(geography, int);
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
    where ward_id = w.id
    order by st_distance(geom, p_point)
    limit 1
  ) a on true
  left join contracts ct
    on st_intersects(ct.coverage, p_point)
   and ct.department_id = coalesce(j.department_id, cat.default_department_id)
   and current_date between ct.starts_on and ct.ends_on
  where st_intersects(w.geom, p_point)
  limit 1;
$$;

-- housekeeping: drop stale staged analyses
create or replace function purge_pending_analyses() returns void
language sql as $$ delete from pending_analyses where created_at < now() - interval '1 day'; $$;
