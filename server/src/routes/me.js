import { Router } from "express";
import { z } from "zod";
import { query } from "../db/pool.js";
import { requireAuth } from "../middleware/auth.js";
import { wrap, badRequest } from "../middleware/errors.js";
import multer from "multer";
import { createClient } from "@supabase/supabase-js";
import { uploadImage, signedUrl } from "../services/storage.js";

const router = Router();
router.use(requireAuth);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 4 * 1024 * 1024 },
  fileFilter: (_req, file, cb) =>
    file.mimetype.startsWith("image/") ? cb(null, true) : cb(badRequest("Choose an image.")),
});

const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/* GET /api/me — profile, role and, for citizens, their civic record. */
router.get(
  "/",
  wrap(async (req, res) => {
    const { rows } = await query(
      `select p.id, p.full_name, p.role, p.language, p.points, p.email, p.phone,
              p.city, p.state, p.area, p.pincode, p.citizen_ref, p.avatar_path,
              d.id as department_id, d.name as department_name
       from profiles p
       left join officers o on o.id = p.id
       left join departments d on d.id = o.department_id
       where p.id = $1`,
      [req.user.id]
    );

    const profile = rows[0];
    if (profile) {
      profile.avatar_url = profile.avatar_path ? await signedUrl(profile.avatar_path, 86400) : null;
      delete profile.avatar_path;
    }
    if (profile?.role !== "citizen") return res.json({ profile });

    const [stats, badges] = await Promise.all([
      query(
        `select count(*)::int as reports,
                count(*) filter (where status='resolved')::int as resolved,
                count(distinct cluster_id) filter (where is_duplicate = false)::int as groups_started,
                -- Sent so a badge keyed on critical reports can show progress
                -- rather than silently reading zero. No seeded badge uses it yet.
                count(*) filter (where severity = 'critical')::int as critical,
                (select count(*)::int from complaint_feedback where citizen_id = $1) as confirmations
         from complaints where citizen_id = $1`,
        [req.user.id]
      ),
      query(
        `select b.code, b.name, b.criteria, cb.earned_at
         from badges b
         left join citizen_badges cb on cb.badge_id = b.id and cb.citizen_id = $1
         order by (cb.earned_at is null), b.id`,
        [req.user.id]
      ),
    ]);

    res.json({ profile, stats: stats.rows[0], badges: badges.rows });
  })
);

router.patch(
  "/",
  wrap(async (req, res) => {
    // Everything except the name is optional. A resident should be able to use
    // the app without handing over an address, so nothing here is required.
    const input = z
      .object({
        full_name: z.string().min(1).max(120).optional(),
        language: z.enum(["en", "hi", "mr"]).optional(),
        phone: z.string().max(20).optional().nullable(),
        city: z.string().max(80).optional().nullable(),
        state: z.string().max(80).optional().nullable(),
        area: z.string().max(120).optional().nullable(),
        pincode: z.string().max(10).optional().nullable(),
      })
      .parse(req.body);

    await query(
      `update profiles set
         full_name = coalesce($2, full_name),
         language  = coalesce($3, language),
         phone     = coalesce($4, phone),
         city      = coalesce($5, city),
         state     = coalesce($6, state),
         area      = coalesce($7, area),
         pincode   = coalesce($8, pincode)
       where id = $1`,
      [req.user.id, input.full_name ?? null, input.language ?? null, input.phone ?? null,
       input.city ?? null, input.state ?? null, input.area ?? null, input.pincode ?? null]
    );
    res.json({ ok: true });
  })
);

/* POST /api/me/avatar */
router.post(
  "/avatar",
  upload.single("photo"),
  wrap(async (req, res) => {
    if (!req.file) throw badRequest("Choose a photo.");

    const stored = await uploadImage({
      buffer: req.file.buffer,
      mimeType: req.file.mimetype,
      prefix: `avatars/${req.user.id}`,
      role: "avatar",
    });

    await query(`update profiles set avatar_path = $2 where id = $1`, [req.user.id, stored.path]);
    res.json({ avatar_url: await signedUrl(stored.path, 86400) });
  })
);

/* POST /api/me/password */
router.post(
  "/password",
  wrap(async (req, res) => {
    const { password } = z.object({ password: z.string().min(8).max(72) }).parse(req.body);

    const { error } = await admin.auth.admin.updateUserById(req.user.id, { password });
    if (error) throw badRequest("The password could not be changed. Try a different one.");

    await query(
      `insert into audit_logs (actor, action, entity, entity_id)
       values ($1, 'account.password_changed', 'profiles', $1::text)`,
      [req.user.id]
    );

    res.json({ ok: true });
  })
);

/**
 * POST /api/me/signout-all
 *
 * Revokes every refresh token, so a session left open on a shared or lost
 * device stops working. The caller is signed out too — there is no way to keep
 * one session alive while killing the rest, and pretending otherwise would be
 * worse than saying so.
 */
router.post(
  "/signout-all",
  wrap(async (req, res) => {
    const { error } = await admin.auth.admin.signOut(req.user.id, "global");
    if (error) throw badRequest("Sessions could not be revoked. Try again.");

    await query(
      `insert into audit_logs (actor, action, entity, entity_id)
       values ($1, 'account.signed_out_everywhere', 'profiles', $1::text)`,
      [req.user.id]
    );

    res.json({ ok: true });
  })
);

/**
 * DELETE /api/me
 *
 * Reports are public civic records and other residents' complaints are grouped
 * with them, so they are not destroyed — the person is detached from them.
 * Saying this plainly is fairer than a checkbox implying everything vanishes.
 */
router.delete(
  "/",
  wrap(async (req, res) => {
    const { confirm } = z.object({ confirm: z.literal("DELETE") }).parse(req.body);
    if (confirm !== "DELETE") throw badRequest("Type DELETE to confirm.");

    if (req.user.role !== "citizen") {
      throw badRequest("Staff accounts are closed by an administrator, not from here.");
    }

    await query(`select anonymise_citizen($1)`, [req.user.id]);
    await admin.auth.admin.deleteUser(req.user.id);

    res.json({ ok: true });
  })
);

/* GET /api/me/dashboard — everything the resident dashboard paints on load. */
router.get(
  "/dashboard",
  wrap(async (req, res) => {
    const id = req.user.id;

    const [stats, reports, byCategory, weekly, home, city] = await Promise.all([
      query(
        `select count(*)::int as reports,
                count(*) filter (where status = 'resolved')::int as resolved,
                count(*) filter (where sla_deadline < now() and resolved_at is null)::int as overdue,
                round(avg(extract(epoch from (resolved_at - created_at)) / 86400.0)::numeric, 1) as avg_days,
                (select count(*)::int from complaint_feedback where citizen_id = $1) as confirmations
         from complaints where citizen_id = $1`,
        [id]
      ),
      query(
        `select c.ref, c.status, c.severity, c.created_at, c.address,
                w.code as ward_code, cat.name as category
         from complaints c
         left join wards w on w.id = c.ward_id
         left join categories cat on cat.id = c.category_id
         where c.citizen_id = $1
         order by c.created_at desc limit 5`,
        [id]
      ),
      query(
        `select cat.name as label, count(*)::int as value
         from complaints c left join categories cat on cat.id = c.category_id
         where c.citizen_id = $1
         group by cat.name order by value desc limit 6`,
        [id]
      ),
      query(
        `select to_char(d.day, 'Dy') as label,
                count(c.id) filter (where c.id is not null)::int as filed,
                count(c.id) filter (where c.status = 'resolved')::int as resolved
         from generate_series(now() - interval '6 days', now(), '1 day') d(day)
         left join complaints c
           on date_trunc('day', c.created_at) = date_trunc('day', d.day)
          and c.citizen_id = $1
         group by d.day order by d.day`,
        [id]
      ),
      query(
        `select st_y(location::geometry) as lat, st_x(location::geometry) as lng
         from complaints where citizen_id = $1 order by created_at desc limit 1`,
        [id]
      ),
      query(
        `select count(*) filter (where status not in ('resolved','rejected'))::int as open,
                (select count(distinct ward_id)::int from complaints)               as wards,
                round(100.0 * count(*) filter (where status = 'resolved')
                      / nullif(count(*), 0), 1)                                     as resolution_rate
         from complaints where created_at > now() - interval '30 days'`
      ),
    ]);

    /* Nearby means near this resident's most recent report. Without one we have
       no location to anchor to, so the panel is simply empty rather than guessing. */
    let nearby = [];
    if (home.rows[0]) {
      const { lat, lng } = home.rows[0];
      const result = await query(
        `select c.ref, c.status, cat.name as category,
                round(st_distance(c.location, st_setsrid(st_makepoint($2,$3),4326)::geography))::int as distance_m
         from complaints c
         left join categories cat on cat.id = c.category_id
         where c.citizen_id <> $1
           and c.status not in ('resolved','rejected')
           and st_dwithin(c.location, st_setsrid(st_makepoint($2,$3),4326)::geography, 1000)
         order by distance_m asc limit 5`,
        [id, lng, lat]
      );
      nearby = result.rows;
    }

    const total = byCategory.rows.reduce((sum, r) => sum + r.value, 0) || 1;
    const s = stats.rows[0];

    res.json({
      stats: {
        ...s,
        resolved_pct: s.reports ? Math.round((s.resolved / s.reports) * 100) : 0,
      },
      reports: reports.rows,
      by_category: byCategory.rows.map((r) => ({ ...r, pct: Math.round((r.value / total) * 100) })),
      weekly: weekly.rows,
      nearby,
      city: city.rows[0],
    });
  })
);

export default router;
