import { query } from "../db/pool.js";

const MATCH_THRESHOLD = 0.62;

/**
 * Duplicate detection on five signals rather than distance alone:
 * distance, recency, category, text similarity and image similarity.
 * Scoring lives in the SQL function find_cluster_candidate().
 */
export async function attachToCluster(client, complaint) {
  const { rows } = await client.query(
    `select * from find_cluster_candidate(
       st_setsrid(st_makepoint($1,$2),4326)::geography, $3, $4, $5, $6, $7::interval
     )`,
    [
      complaint.lng, complaint.lat, complaint.categoryId,
      complaint.description || "", complaint.embedding,
      complaint.radiusMeters ?? 200, complaint.window ?? "72 hours",
    ]
  );

  const candidate = rows[0];

  if (candidate && Number(candidate.score) >= MATCH_THRESHOLD) {
    await client.query(
      `update clusters set
         report_count   = report_count + 1,
         citizen_count  = (select count(distinct citizen_id) from complaints where cluster_id = $1) + 1,
         last_reported  = now(),
         centroid       = coalesce(
                            st_centroid(
                              (select st_collect(location::geometry) from complaints where cluster_id = $1)
                            )::geography,
                            centroid,
                            st_setsrid(st_makepoint($2,$3),4326)::geography
                          )
       where id = $1`,
      [candidate.cluster_id, complaint.lng, complaint.lat]
    );
    return { clusterId: candidate.cluster_id, matchScore: Math.round(candidate.score * 100), isNew: false };
  }

  const { rows: created } = await client.query(
    `insert into clusters (category_id, department_id, centroid, radius_m,
                           report_count, citizen_count, first_reported, last_reported)
     values ($1, $2, st_setsrid(st_makepoint($3,$4),4326)::geography, 150, 1, 1, now(), now())
     returning id`,
    [complaint.categoryId, complaint.departmentId, complaint.lng, complaint.lat]
  );

  return { clusterId: created[0].id, matchScore: 100, isNew: true };
}

/**
 * Flags groups whose report rate is accelerating, so an area can be surfaced
 * before it qualifies as a hotspot on volume alone.
 */
export async function detectEmerging() {
  const { rows } = await query(
    `with daily as (
       select cluster_id, date_trunc('day', created_at) as day, count(*) as n
       from complaints
       where created_at > now() - interval '5 days' and cluster_id is not null
       group by 1, 2
     ),
     slope as (
       select cluster_id,
              regr_slope(n, extract(epoch from day)) as trend,
              sum(n) as total
       from daily group by cluster_id
     )
     update clusters c
     set is_emerging = true,
         trend_pct = round((s.trend * 86400 / nullif(s.total,0) * 100)::numeric, 1)
     from slope s
     where c.id = s.cluster_id and s.trend > 0 and s.total >= 5 and c.is_hotspot = false
     returning c.id, c.trend_pct`
  );
  return rows;
}
