/**
 * Generates a realistic demo dataset: ~2,000 complaints across three wards with
 * believable clustering, a working SLA distribution, and enough resolved history
 * that the analytics charts are not empty on first load.
 *
 *   node supabase/seed_demo.js
 */
import "dotenv/config";
import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

const COUNT = Number(process.env.SEED_COUNT || 2000);
const DAYS = 90;

/* Hotspot centres — most reports land near one of these, which is what makes
   the clustering visible rather than uniform noise. */
const HOTSPOTS = [
  { name: "Ghatkopar Market", lat: 19.0860, lng: 72.9080, category: "Garbage overflow", weight: 0.22 },
  { name: "LBS Marg",         lat: 19.0720, lng: 72.9010, category: "Pothole",          weight: 0.18 },
  { name: "Chembur Camp",     lat: 19.0560, lng: 72.9020, category: "Water leakage",    weight: 0.12 },
  { name: "Andheri Station",  lat: 19.1190, lng: 72.8460, category: "Illegal dumping",  weight: 0.10 },
];

const SPREAD = ["Pothole", "Broken streetlight", "Stagnant water", "Open manhole", "Road crack"];
const SEVERITIES = ["low", "medium", "medium", "high", "high", "critical"];

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

function placeReport() {
  const roll = Math.random();
  let acc = 0;
  for (const h of HOTSPOTS) {
    acc += h.weight;
    if (roll < acc) {
      return {
        lat: h.lat + rand(-0.0016, 0.0016),
        lng: h.lng + rand(-0.0016, 0.0016),
        category: h.category,
      };
    }
  }
  return { lat: rand(19.04, 19.13), lng: rand(72.84, 72.95), category: pick(SPREAD) };
}

async function main() {
  const client = await pool.connect();
  console.log(`Seeding ${COUNT} complaints over ${DAYS} days…`);

  const { rows: categories } = await client.query(`select id, name, default_department_id from categories`);
  const { rows: citizens } = await client.query(`select id from profiles where role = 'citizen' limit 200`);
  const { rows: officers } = await client.query(`select id, department_id from officers`);

  if (!citizens.length) {
    console.error("No citizen profiles found. Create some accounts first, then re-run.");
    process.exit(1);
  }

  const byName = Object.fromEntries(categories.map((c) => [c.name, c]));
  let created = 0;

  for (let i = 0; i < COUNT; i += 1) {
    const spot = placeReport();
    const category = byName[spot.category] || categories[0];
    const severity = pick(SEVERITIES);
    const ageDays = Math.pow(Math.random(), 1.6) * DAYS; // recent-weighted
    const createdAt = new Date(Date.now() - ageDays * 864e5);

    // Older reports are far more likely to be closed.
    const closed = Math.random() < Math.min(0.85, ageDays / DAYS + 0.2);
    const officer = pick(officers.filter((o) => o.department_id === category.default_department_id)) || pick(officers);

    const resolvedAt = closed
      ? new Date(createdAt.getTime() + rand(2, 96) * 3600 * 1000)
      : null;

    await client.query(
      `insert into complaints
         (citizen_id, location, ward_id, category_id, department_id, ai_confidence,
          severity, severity_score, authenticity, authenticity_confidence,
          assigned_officer, status, created_at, resolved_at, sla_deadline)
       values ($1, st_setsrid(st_makepoint($2,$3),4326)::geography,
               (select id from wards where st_intersects(geom, st_setsrid(st_makepoint($2,$3),4326)::geography) limit 1),
               $4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,
               $13::timestamptz + (case $7 when 'critical' then 12 when 'high' then 24 when 'medium' then 72 else 168 end || ' hours')::interval)`,
      [
        pick(citizens).id, spot.lng, spot.lat,
        category.id, category.default_department_id,
        Math.round(rand(72, 98)), severity, Math.round(rand(20, 95)),
        Math.random() < 0.04 ? "possibly_ai_generated" : "likely_genuine",
        Math.round(rand(70, 97)),
        officer?.id ?? null,
        closed ? "resolved" : pick(["assigned", "accepted", "work_started", "under_review"]),
        createdAt, resolvedAt,
      ]
    );

    created += 1;
    if (created % 250 === 0) console.log(`  ${created}/${COUNT}`);
  }

  console.log("Building clusters from proximity…");
  await client.query(`
    insert into clusters (category_id, department_id, centroid, radius_m, report_count,
                          citizen_count, first_reported, last_reported, is_hotspot)
    select c.category_id, c.department_id,
           st_centroid(st_collect(c.location::geometry))::geography,
           greatest(120, round(max(st_distance(c.location, st_centroid(st_collect(c.location::geometry))::geography))::numeric)),
           count(*), count(distinct c.citizen_id), min(c.created_at), max(c.created_at),
           count(*) >= 15
    from complaints c
    where c.cluster_id is null
    group by c.category_id, c.department_id,
             round(st_x(c.location::geometry)::numeric, 3),
             round(st_y(c.location::geometry)::numeric, 3)
    having count(*) > 1
  `);

  await client.query(`
    update complaints c set cluster_id = cl.id
    from clusters cl
    where c.cluster_id is null
      and c.category_id = cl.category_id
      and st_dwithin(c.location, cl.centroid, cl.radius_m)
  `);

  const { rows: summary } = await client.query(`
    select (select count(*) from complaints) as complaints,
           (select count(*) from clusters) as clusters,
           (select count(*) from clusters where is_hotspot) as hotspots
  `);

  console.log("Done:", summary[0]);
  client.release();
  await pool.end();
}

main().catch((err) => { console.error(err); process.exit(1); });
