import { Router } from "express";
import { z } from "zod";
import { query } from "../db/pool.js";
import { requireAuth, requireMinRole } from "../middleware/auth.js";
import { wrap, notFound } from "../middleware/errors.js";
import { signedUrl } from "../services/storage.js";

const router = Router();
router.use(requireAuth, requireMinRole("super_admin"));

/**
 * Images the vision module could not vouch for. Nothing here has been rejected —
 * a flag routes a photo to a person, it does not decide anything.
 */
router.get(
  "/",
  wrap(async (req, res) => {
    const scope = req.user.role === "global_admin" ? null : req.user.departmentId;
    const { rows } = await query(
      `select c.ref, c.authenticity, c.authenticity_confidence, c.created_at,
              cat.name as category, w.code as ward_code, p.full_name as citizen_name,
              a.raw_response->'authenticity_notes' as notes,
              i.storage_path
       from complaints c
       left join categories cat on cat.id = c.category_id
       left join wards w on w.id = c.ward_id
       left join profiles p on p.id = c.citizen_id
       left join complaint_ai_analysis a on a.complaint_id = c.id
       left join complaint_images i on i.complaint_id = c.id and i.role = 'report'
       where c.authenticity <> 'likely_genuine'
         and c.review_decision is null
         and ($1::int is null or c.department_id = $1)
       order by c.created_at asc`,
      [scope]
    );

    const items = await Promise.all(
      rows.map(async (r) => ({ ...r, image_url: r.storage_path ? await signedUrl(r.storage_path) : null }))
    );

    res.json({ items });
  })
);

/* POST /api/review/:ref — a human decides. Always logged against their name. */
router.post(
  "/:ref",
  wrap(async (req, res) => {
    const { decision, note } = z
      .object({ decision: z.enum(["accepted", "rejected"]), note: z.string().max(1000).optional() })
      .parse(req.body);

    const { rows } = await query(
      `update complaints
       set review_decision = $2, review_note = $3, reviewed_by = $4, reviewed_at = now(),
           status = case when $2 = 'rejected' then 'rejected'::complaint_status else status end
       where ref = $1 returning id`,
      [req.params.ref, decision, note || null, req.user.id]
    );
    if (!rows[0]) throw notFound("Complaint");

    await query(
      `insert into audit_logs (actor, action, entity, entity_id, after)
       values ($1, 'review.decision', 'complaints', $2, $3)`,
      [req.user.id, req.params.ref, JSON.stringify({ decision, note })]
    );

    res.json({ ok: true });
  })
);

export default router;
