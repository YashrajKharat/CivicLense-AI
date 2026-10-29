-- CivicLense 0016 — work zones
--
-- Clusters group reports of the same category in the same place, which is right
-- for spotting a recurring problem and wrong for dispatching anybody.
--
-- A street with a pothole, an overflowing bin and a dead streetlight produces
-- three clusters in three departments, and three officers are sent to the same
-- hundred metres. Each does one job and drives past the other two.
--
-- A zone is the other cut of the same data: everything open within a radius,
-- regardless of category. Clusters answer "is this one problem or many"; zones
-- answer "who should I send, and what will they find when they arrive".
--
-- Both are kept. They are different questions and collapsing them into one
-- would lose whichever answer the other was giving.

-- Safe to re-run. The first attempt failed partway through on a column-name
-- collision, so some of this may already exist.
drop view if exists work_zone_detail;

create table if not exists work_zones (
  id serial primary key,
  ref text unique not null default 'WZ-' || nextval('clusters_id_seq'),
  ward_id int references wards(id),
  centroid geography(point, 4326) not null,
  radius_m int not null default 250,

  open_count int not null default 0,
  department_count int not null default 0,
  -- The worst thing in the zone. A zone is scheduled by its most urgent member,
  -- not by how many reports it holds — twenty low-priority items should not
  -- outrank one exposed wire.
  top_severity severity,
  priority_score int not null default 0,

  assigned_officer uuid references profiles(id),
  assigned_at timestamptz,

  first_reported timestamptz,
  last_reported timestamptz,
  updated_at timestamptz default now()
);

create index if not exists work_zones_geo on work_zones using gist(centroid);
create index if not exists work_zones_priority on work_zones(priority_score desc);

-- work_zone_id, not zone_id.
--
-- complaints.zone_id already exists and has since 0001 — it points at the
-- administrative zones table (Zone 1 South, Zone 2 West). `add column if not
-- exists` silently did nothing, so the old foreign key stayed and every insert
-- failed with "Key (zone_id)=(1) is not present in table zones".
--
-- Two different meanings of "zone" in one schema is unfortunate, but renaming
-- the original would break the ward hierarchy, the responsibility resolver and
-- the seed. The new one takes the longer name.
alter table complaints add column if not exists work_zone_id int references work_zones(id);
create index if not exists complaints_work_zone on complaints(work_zone_id);

-- ============================================================
-- Building the zones
-- ============================================================
-- Rebuilt rather than incrementally maintained. There are hundreds of open
-- reports, not millions, and a rebuild is both simpler to reason about and
-- immune to the drift that incremental grouping accumulates.
create or replace function rebuild_work_zones(p_radius int default 250)
returns int language plpgsql as $$
declare
  built int := 0;
  seed record;
  -- Named new_zone rather than zone_id. plpgsql resolves an ambiguous name to
  -- the column, so `set zone_id = zone_id` would have assigned the column to
  -- itself and left every complaint unassigned — the function would report
  -- building zones while grouping nothing.
  new_zone int;
begin
  update complaints set work_zone_id = null;
  delete from work_zones;

  -- Seeded by severity, so the most urgent report in an area anchors its zone
  -- and the radius is measured from the thing that matters most.
  for seed in
    select c.id, c.location, c.ward_id, c.created_at
    from complaints c
    where c.status not in ('resolved','rejected','withdrawn')
      and c.location is not null
      and c.work_zone_id is null
    order by case c.severity
               when 'critical' then 0 when 'high' then 1
               when 'medium' then 2 else 3 end,
             c.created_at asc
  loop
    -- Skip anything already swept into a zone by an earlier, more severe seed.
    continue when (select c2.work_zone_id from complaints c2 where c2.id = seed.id) is not null;

    insert into work_zones (ward_id, centroid, radius_m)
    values (seed.ward_id, seed.location, p_radius)
    returning id into new_zone;

    update complaints
    set work_zone_id = new_zone
    where status not in ('resolved','rejected','withdrawn')
      and location is not null
      and work_zone_id is null
      and st_dwithin(location, seed.location, p_radius);

    built := built + 1;
  end loop;

  -- Recompute each zone from what actually landed in it.
  update work_zones z set
    centroid = sub.centre,
    open_count = sub.n,
    department_count = sub.depts,
    top_severity = sub.worst,
    first_reported = sub.first_seen,
    last_reported = sub.last_seen,
    updated_at = now()
  from (
    select c.work_zone_id,
           st_centroid(st_collect(c.location::geometry))::geography as centre,
           count(*)::int as n,
           count(distinct c.department_id)::int as depts,
           -- max, not min. The enum is declared ('low','medium','high','critical'),
           -- so min() returns the *least* severe member — a zone containing an
           -- exposed wire and a faded sign would have been scheduled as though
           -- the sign were the worst of it.
           max(c.severity) as worst,
           min(c.created_at) as first_seen,
           max(c.created_at) as last_seen
    from complaints c
    where c.work_zone_id is not null
    group by c.work_zone_id
  ) sub
  where z.id = sub.work_zone_id;

  -- Priority is the zone's worst member, then how long the oldest has waited,
  -- then how many separate reports it holds — in that order. Volume is the
  -- weakest of the three: a busy street generates reports a quiet one never
  -- will, and scheduling by count sends crews where the people are rather than
  -- where the danger is.
  update work_zones set priority_score = least(100,
      case top_severity
        when 'critical' then 70 when 'high' then 50
        when 'medium' then 30 else 15 end
    + least(20, extract(days from (now() - first_reported))::int)
    + least(10, open_count)
  );

  delete from work_zones where open_count = 0;

  return built;
end $$;

-- ============================================================
-- What an officer would find on arrival
-- ============================================================
create or replace view work_zone_detail as
select z.id, z.ref, z.priority_score, z.open_count, z.department_count,
       z.top_severity, z.radius_m, z.first_reported,
       w.code as ward_code, w.name as ward_name,
       st_y(z.centroid::geometry) as lat,
       st_x(z.centroid::geometry) as lng,
       p.full_name as officer,
       (select json_agg(json_build_object(
          'ref', c.ref, 'category', cat.name, 'severity', c.severity,
          'department', d.name, 'status', c.status,
          'overdue', (c.sla_deadline < now() and c.resolved_at is null)
        ) order by case c.severity
                     when 'critical' then 0 when 'high' then 1
                     when 'medium' then 2 else 3 end)
        from complaints c
        left join categories cat on cat.id = c.category_id
        left join departments d on d.id = c.department_id
        where c.work_zone_id = z.id) as items
from work_zones z
left join wards w on w.id = z.ward_id
left join profiles p on p.id = z.assigned_officer;

select rebuild_work_zones();
