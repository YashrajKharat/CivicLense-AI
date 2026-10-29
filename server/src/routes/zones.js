import { Router } from "express";
import { z } from "zod";
import { query } from "../db/pool.js";
import { requireAuth, requireMinRole } from "../middleware/auth.js";
import { wrap, notFound, badRequest } from "../middleware/errors.js";

const router = Router();
router.use(requireAuth, requireMinRole("super_admin"));

/**
 * Work zones — everything open within a radius, whatever the category.
 *
 * Clusters group the same problem reported repeatedly, which answers "is this
 * one fault or many". Zones answer a different question: who do I send, and
 * what will they find when they get there. A street with a pothole, a bin and a
 * dead streetlight is three clusters and one visit.
 *
 * Ordered by priority rather than size. A zone's score comes from its worst
 * member first, then how long the oldest has waited, then how many reports it
 * holds — volume last, because a busy street generates reports a quiet one
 * never will, and scheduling by count sends crews where the people are rather
 * than where the danger is.
 */
router.get(
  "/",
  wrap(async (req, res) => {
    const { ward, unassigned } = req.query;

    const { rows } = await query(
      `select * from work_zone_detail
       where ($1::text is null or $1 = '' or ward_code = $1)
         and ($2::text <> 'true' or officer is null)
       order by priority_score desc, open_count desc
       limit 100`,
      [ward || null, unassigned || ""]
    );

    res.json({
      zones: rows,
      // Stated so nobody has to infer the ordering from the list.
      ordering: "Most urgent first — worst report in the zone, then how long it has waited.",
    });
  })
);

/** Rebuilt on demand; it is a full recompute over a few hundred rows. */
router.post(
  "/rebuild",
  wrap(async (req, res) => {
    const { radius } = z
      .object({ radius: z.coerce.number().min(100).max(1000).default(250) })
      .parse(req.body);

    const { rows } = await query(`select rebuild_work_zones($1) as built`, [radius]);
    res.json({ built: rows[0].built, radius });
  })
);

/**
 * One officer for the whole zone.
 *
 * Every open report inside it is assigned at once — that is the entire point.
 * Assigning them one at a time is what sent three officers to the same street.
 */
router.post(
  "/:ref/assign",
  wrap(async (req, res) => {
    const { officerId } = z.object({ officerId: z.string().uuid() }).parse(req.body);

    const { rows } = await query(`select id, open_count from work_zones where ref = $1`, [
      req.params.ref,
    ]);
    if (!rows[0]) throw notFound("Zone");

    const { rows: officer } = await query(
      `select o.id, o.department_id, p.full_name
       from officers o join profiles p on p.id = o.id
       where o.id = $1 and o.active`,
      [officerId]
    );
    if (!officer[0]) throw badRequest("That officer is not active.");

    const { rows: assigned } = await query(
      `update complaints
       set assigned_officer = $2,
           status = case when status in ('submitted','ai_analysis','under_review')
                         then 'assigned' else status end
       where work_zone_id = $1
         and status not in ('resolved','rejected','withdrawn')
       returning ref`,
      [rows[0].id, officerId]
    );

    await query(
      `update work_zones set assigned_officer = $2, assigned_at = now() where id = $1`,
      [rows[0].id, officerId]
    );

    await query(
      `insert into audit_logs (actor, action, entity, entity_id, after)
       values ($1, 'zone.assigned', 'work_zones', $2, $3)`,
      [req.user.id, req.params.ref,
       JSON.stringify({ officer: officer[0].full_name, complaints: assigned.length })]
    );

    res.json({
      ok: true,
      officer: officer[0].full_name,
      assigned: assigned.length,
      refs: assigned.map((r) => r.ref),
    });
  })
);

export default router;
