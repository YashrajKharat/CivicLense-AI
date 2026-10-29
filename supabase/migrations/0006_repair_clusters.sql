-- Clusters created before their centroid was computed cannot be plotted, and
-- Leaflet throws on a null coordinate rather than skipping the marker — so one
-- bad row blanked the entire command centre map.
--
-- Recompute what can be recovered, delete what cannot.
--
-- The centroid and the radius have to be worked out in separate passes: the
-- radius is the greatest distance from each complaint to the centroid, and the
-- centroid is itself an aggregate, so computing both in one SELECT nests one
-- aggregate inside another and Postgres refuses.

-- Pass 1 — centroid per cluster.
with centres as (
  select c.cluster_id,
         st_centroid(st_collect(c.location::geometry))::geography as centre
  from complaints c
  where c.cluster_id is not null
    and c.location is not null
  group by c.cluster_id
)
update clusters cl
set centroid = centres.centre
from centres
where cl.id = centres.cluster_id
  and cl.centroid is null;

-- Pass 2 — radius, now that every cluster has a fixed point to measure from.
with spreads as (
  select c.cluster_id,
         round(max(st_distance(c.location, cl.centroid))::numeric)::int as spread
  from complaints c
  join clusters cl on cl.id = c.cluster_id
  where c.location is not null
    and cl.centroid is not null
  group by c.cluster_id
)
update clusters cl
set radius_m = greatest(120, spreads.spread)
from spreads
where cl.id = spreads.cluster_id;

-- Anything still without a centroid has no located complaints behind it.
update complaints
set cluster_id = null
where cluster_id in (select id from clusters where centroid is null);

delete from clusters where centroid is null;

-- Stop it recurring: a cluster is meaningless without a position.
alter table clusters alter column centroid set not null;
