import { Router } from "express";
import { z } from "zod";
import { query } from "../db/pool.js";
import { requireAuth } from "../middleware/auth.js";
import { wrap, notFound, badRequest } from "../middleware/errors.js";
import { signedUrl } from "../services/storage.js";

const router = Router();

/**
 * The public record.
 *
 * The product's argument is that responsibility is visible. Until now it was
 * visible only to the people doing the work, which is a strange position for a
 * transparency tool — a resident could see their own report and nothing else,
 * and had to take on trust that anything happens to anybody else's.
 *
 * No session required. The reporter is never named, coordinates are rounded to
 * roughly a street, and withdrawn or rejected reports do not appear.
 */

/* ── The feed (requires auth) ────────────────────────────────────────── */
router.get(
  "/reports",
  requireAuth,
  wrap(async (req, res) => {
    const { status, ward, category, sort } = z
      .object({
        status: z.string().optional(),
        ward: z.string().optional(),
        category: z.string().optional(),
        sort: z.enum(["recent", "discussed", "overdue"]).default("recent"),
      })
      .parse(req.query);

    const order = {
      recent: "created_at desc",
      // What people are actually talking about, which is not always the newest.
      discussed: "corroboration_count desc, comment_count desc, created_at desc",
      overdue: "overdue desc, created_at asc",
    }[sort];

    const { rows } = await query(
      `select * from public_reports
       where ($1::text is null or $1 = '' or
              ($1 = 'open' and status not in ('resolved')) or status::text = $1)
         and ($2::text is null or $2 = '' or ward_code = $2)
         and ($3::text is null or $3 = '' or category = $3)
       order by ${order}
       limit 60`,
      [status || null, ward || null, category || null]
    );

    const { rows: totals } = await query(
      `select count(*)::int                                       as total,
              count(*) filter (where status = 'resolved')::int    as resolved,
              count(*) filter (where overdue)::int                as overdue
       from public_reports`
    );

    res.json({ reports: rows, totals: totals[0] });
  })
);

/* ── One report, with its thread (requires auth) ─────────────────────── */
router.get(
  "/reports/:ref",
  requireAuth,
  wrap(async (req, res) => {
    const { rows } = await query(`select * from public_reports where ref = $1`, [req.params.ref]);
    if (!rows[0]) throw notFound("Report");

    const { rows: comments } = await query(
      `select cm.id, cm.kind, cm.body, cm.is_official, cm.created_at,
              p.full_name, p.avatar_path
       from complaint_comments cm
       left join profiles p on p.id = cm.author_id
       where cm.complaint_id = (select id from complaints where ref = $1)
         and not cm.hidden
       order by cm.created_at asc`,
      [req.params.ref]
    );

    const { rows: photo } = await query(
      `select i.storage_path
       from complaint_images i
       join complaints c on c.id = i.complaint_id
       where c.ref = $1 and i.role = 'report' limit 1`,
      [req.params.ref]
    );

    res.json({
      report: rows[0],
      image_url: photo[0] ? await signedUrl(photo[0].storage_path, 3600) : null,
      comments: await Promise.all(
        comments.map(async (c) => ({
          ...c,
          // First name and initial only. A full name against a street address
          // and a timestamp identifies somebody.
          author: c.full_name
            ? `${c.full_name.split(" ")[0]} ${(c.full_name.split(" ")[1] || "")[0] || ""}.`.trim()
            : "A resident",
          avatar_url: c.avatar_path ? await signedUrl(c.avatar_path, 86400) : null,
          full_name: undefined,
          avatar_path: undefined,
        }))
      ),
    });
  })
);

/* ── Leaderboards (requires auth) ────────────────────────────────────── */
router.get(
  "/leaderboard",
  requireAuth,
  wrap(async (_req, res) => {
    const [residents, officers] = await Promise.all([
      query(`select * from resident_leaderboard order by position limit 20`),
      query(`select * from officer_leaderboard order by on_time_rate desc nulls last, resolved desc limit 20`),
    ]);

    res.json({
      residents: await Promise.all(
        residents.rows.map(async (r) => ({
          ...r,
          avatar_url: r.avatar_path ? await signedUrl(r.avatar_path, 86400) : null,
          avatar_path: undefined,
        }))
      ),
      officers: officers.rows,
      // Both rankings are stated, because a leaderboard whose rule is not
      // obvious invites people to guess at it — usually wrongly.
      basis: {
        residents:
          "Points from verified contributions. A duplicate earns nothing, and confirming " +
          "a fix earns more than filing one.",
        officers:
          "Closing within each complaint's own deadline, not how many were closed. " +
          "Volume is somebody else's decision; being on time is the officer's.",
      },
    });
  })
);

/* ── Commenting needs a session ─────────────────────────────────────────── */
router.post(
  "/reports/:ref/comments",
  requireAuth,
  wrap(async (req, res) => {
    const { kind, body } = z
      .object({
        kind: z.enum(["corroborate", "detail", "dispute", "resolved_already"]),
        body: z.string().trim().min(2).max(800),
      })
      .parse(req.body);

    const { rows } = await query(
      `select id, citizen_id, status from complaints where ref = $1`,
      [req.params.ref]
    );
    if (!rows[0]) throw notFound("Report");
    if (["withdrawn", "rejected"].includes(rows[0].status)) {
      throw badRequest("This report is closed to comments.");
    }

    // Staff comments carry weight a neighbour's does not, and a resident should
    // be able to tell them apart without reading the name.
    const isOfficial = ["officer", "super_admin", "global_admin"].includes(req.user.role);

    try {
      await query(
        `insert into complaint_comments (complaint_id, author_id, kind, body, is_official)
         values ($1,$2,$3,$4,$5)`,
        [rows[0].id, req.user.id, kind, body, isOfficial]
      );
    } catch (err) {
      // The partial unique index. One corroboration each, or a single resident
      // could push a report up the queue on their own.
      if (err.code === "23505") {
        throw badRequest("You have already said you have seen this one.");
      }
      throw err;
    }

    res.status(201).json({ ok: true });
  })
);

/* ── Moderation ────────────────────────────────────────────────────────── */
router.post(
  "/comments/:id/hide",
  requireAuth,
  wrap(async (req, res) => {
    if (!["super_admin", "global_admin"].includes(req.user.role)) {
      throw badRequest("Only an administrator can hide a comment.");
    }

    const { reason } = z.object({ reason: z.string().min(3).max(300) }).parse(req.body);

    // Hidden, not deleted. A removed comment that leaves no trace is
    // indistinguishable from one that was never made.
    await query(
      `update complaint_comments
       set hidden = true, hidden_by = $2, hidden_reason = $3
       where id = $1`,
      [req.params.id, req.user.id, reason]
    );

    await query(
      `insert into audit_logs (actor, action, entity, entity_id, after)
       values ($1, 'comment.hidden', 'complaint_comments', $2, $3)`,
      [req.user.id, req.params.id, JSON.stringify({ reason })]
    );

    res.json({ ok: true });
  })
);

export default router;
