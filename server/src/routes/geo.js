import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { wrap } from "../middleware/errors.js";
import { resolveResponsibility } from "../services/responsibility.js";
import { query } from "../db/pool.js";
import { signedUrl } from "../services/storage.js";
import { reverseGeocode, searchAddress } from "../services/geocode.js";

const router = Router();

const schema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  category: z.coerce.number().int().nullable().optional(),
});

/* GET /api/geo/responsibility?lat=&lng=&category= */
router.get(
  "/responsibility",
  requireAuth,
  wrap(async (req, res) => {
    const { lat, lng, category } = schema.parse(req.query);
    res.json(await resolveResponsibility({ lat, lng, categoryId: category ?? null }));
  })
);

/**
 * GET /api/geo/nearby?lat=&lng=&radius=
 * Public civic issues around a point, for the resident map. Deliberately thin:
 * category, severity, status and coordinates only. No reporter name, no
 * description — a neighbour should see that a problem exists, not who raised it.
 */
router.get(
  "/nearby",
  requireAuth,
  wrap(async (req, res) => {
    const { lat, lng, radius } = z
      .object({
        lat: z.coerce.number().min(-90).max(90),
        lng: z.coerce.number().min(-180).max(180),
        radius: z.coerce.number().min(100).max(10000).default(2000),
      })
      .parse(req.query);

    const { rows } = await query(
      `select c.ref, cat.name as category, c.severity, c.status, c.created_at,
              st_y(c.location::geometry) as lat, st_x(c.location::geometry) as lng,
              round(st_distance(c.location, st_setsrid(st_makepoint($2,$1),4326)::geography))::int as distance_m,
              w.code as ward_code,
              cl.ref as cluster_ref, cl.report_count,
              (select storage_path from complaint_images i
               where i.complaint_id = c.id and i.role = 'report' limit 1) as image_path
       from complaints c
       left join categories cat on cat.id = c.category_id
       left join wards w on w.id = c.ward_id
       left join clusters cl on cl.id = c.cluster_id
       where st_dwithin(c.location, st_setsrid(st_makepoint($2,$1),4326)::geography, $3)
         and c.status <> 'rejected'
       order by distance_m asc
       limit 200`,
      [lat, lng, radius]
    );

    const { rows: clusters } = await query(
      `select cl.ref, cat.name as category, cl.report_count, cl.radius_m, cl.is_hotspot,
              st_y(cl.centroid::geometry) as lat, st_x(cl.centroid::geometry) as lng
       from clusters cl
       left join categories cat on cat.id = cl.category_id
       where st_dwithin(cl.centroid, st_setsrid(st_makepoint($2,$1),4326)::geography, $3)
         and cl.status <> 'resolved'`,
      [lat, lng, radius]
    );

    res.json({
      complaints: await Promise.all(
        rows.map(async (r) => ({
          ...r,
          image_url: r.image_path ? await signedUrl(r.image_path, 3600) : null,
          image_path: undefined,
        }))
      ),
      clusters,
      summary: {
        total: rows.length,
        open: rows.filter((r) => !["resolved", "rejected"].includes(r.status)).length,
        critical: rows.filter((r) => r.severity === "critical").length,
      },
    });
  })
);

/**
 * GET /api/geo/address?lat=&lng=
 * A convenience for the report form. The coordinate is what gets stored, so a
 * failure here degrades to "no address" rather than blocking anything.
 */
router.get(
  "/address",
  requireAuth,
  wrap(async (req, res) => {
    const { lat, lng } = z
      .object({ lat: z.coerce.number(), lng: z.coerce.number() })
      .parse(req.query);

    try {
      res.json(await reverseGeocode(lat, lng));
    } catch {
      res.json({ full: null, short: null, unavailable: true });
    }
  })
);

/* GET /api/geo/search?q=&lat=&lng= */
router.get(
  "/search",
  requireAuth,
  wrap(async (req, res) => {
    const { q, lat, lng } = z
      .object({
        q: z.string().min(3).max(120),
        lat: z.coerce.number().optional(),
        lng: z.coerce.number().optional(),
      })
      .parse(req.query);

    try {
      res.json({ results: await searchAddress(q, { lat, lng }) });
    } catch {
      // Search is a convenience over dragging the pin, so a failure degrades
      // to an empty list rather than an error the resident has to deal with.
      res.json({ results: [], unavailable: true });
    }
  })
);

/**
 * GET /api/geo/duplicates?lat=&lng=&category=
 *
 * Before a resident files, tell them whether the same problem is already
 * reported here. A duplicate is not wasted — it adds a witness — but somebody
 * should be able to decide that knowingly rather than by accident, and seeing
 * "eleven neighbours already reported this" is more reassuring than a silent
 * confirmation screen.
 */
router.get(
  "/duplicates",
  requireAuth,
  wrap(async (req, res) => {
    const { lat, lng, category, radius } = z
      .object({
        lat: z.coerce.number(),
        lng: z.coerce.number(),
        category: z.coerce.number().int().nullable().optional(),
        radius: z.coerce.number().min(50).max(1000).default(250),
      })
      .parse(req.query);

    const point = "st_setsrid(st_makepoint($2,$1),4326)::geography";

    const { rows: clusters } = await query(
      `select cl.ref, cat.name as category, cl.report_count, cl.citizen_count,
              cl.first_reported, cl.last_reported, cl.is_hotspot,
              st_y(cl.centroid::geometry) as lat, st_x(cl.centroid::geometry) as lng,
              round(st_distance(cl.centroid, ${point}))::int as distance_m
       from clusters cl
       left join categories cat on cat.id = cl.category_id
       where st_dwithin(cl.centroid, ${point}, $3)
         and cl.status <> 'resolved'
         and ($4::int is null or cl.category_id = $4)
       order by distance_m asc
       limit 5`,
      [lat, lng, radius, category ?? null]
    );

    const { rows: nearby } = await query(
      `select c.ref, cat.name as category, c.status, c.created_at,
              st_y(c.location::geometry) as lat, st_x(c.location::geometry) as lng,
              round(st_distance(c.location, ${point}))::int as distance_m,
              (select storage_path from complaint_images i
               where i.complaint_id = c.id and i.role = 'report' limit 1) as image_path
       from complaints c
       left join categories cat on cat.id = c.category_id
       where st_dwithin(c.location, ${point}, $3)
         and c.status not in ('resolved','rejected')
         and ($4::int is null or c.category_id = $4)
       order by distance_m asc
       limit 20`,
      [lat, lng, radius, category ?? null]
    );

    res.json({
      clusters,
      nearby: await Promise.all(
        nearby.map(async (r) => ({
          ...r,
          image_url: r.image_path ? await signedUrl(r.image_path, 3600) : null,
          image_path: undefined,
        }))
      ),
      // The headline number: how many people are already on this.
      already_reported: nearby.length,
      strongest: clusters[0] || null,
    });
  })
);

/**
 * GET /api/geo/public-stats
 *
 * City-wide totals for the landing page. Public — no session, because the
 * landing page is what somebody sees before they have one.
 *
 * The card carried a "live" badge over invented figures. Either the badge goes
 * or the figures become real, and real is better: a resident deciding whether
 * to bother reporting something is exactly the person who should see how many
 * reports actually get closed.
 *
 * Only aggregates. Nothing here identifies a report, a person or a place.
 */
router.get(
  "/public-stats",
  wrap(async (_req, res) => {
    const { rows } = await query(
      `select
         count(*) filter (where status <> 'withdrawn')::int                       as total,
         count(*) filter (where status = 'resolved')::int                         as resolved,
         count(*) filter (where status not in ('resolved','rejected','withdrawn'))::int as open,
         count(*) filter (where status = 'verification')::int                     as awaiting_resident,
         count(distinct citizen_id)::int                                          as residents,
         round(avg(extract(epoch from (resolved_at - created_at)) / 86400.0)
               filter (where resolved_at is not null)::numeric, 1)                as avg_days
       from complaints`
    );

    const { rows: cats } = await query(
      `select cat.name as label, count(*)::int as n
       from complaints c
       join categories cat on cat.id = c.category_id
       where c.status <> 'withdrawn'
       group by cat.name order by n desc limit 3`
    );

    const d = rows[0];

    res.json({
      ...d,
      resolution_rate: d.total ? Math.round((d.resolved / d.total) * 100) : 0,
      top_categories: cats,
      at: new Date().toISOString(),
    });
  })
);

export default router;
