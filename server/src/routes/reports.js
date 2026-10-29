import { Router } from "express";
import { z } from "zod";
import { query } from "../db/pool.js";
import { requireAuth, requireMinRole } from "../middleware/auth.js";
import { wrap, notFound } from "../middleware/errors.js";
import { generateReport } from "../services/reports.js";
import { SECTIONS } from "../services/report-sections.js";

const router = Router();
router.use(requireAuth, requireMinRole("super_admin"));

const schema = z.object({
  from: z.string(),
  to: z.string(),
  departmentId: z.number().int().nullable().optional(),
  sections: z
    .array(z.enum(["volume", "categories", "wards", "sla", "verification", "agencies"]))
    .min(1),
});

router.post(
  "/",
  wrap(async (req, res) => {
    const input = schema.parse(req.body);
    const departmentId = req.user.role === "global_admin" ? input.departmentId ?? null : req.user.departmentId;

    res.json(
      await generateReport({
        from: input.from,
        to: input.to,
        departmentId,
        sections: input.sections,
        requestedBy: req.user.id,
      })
    );
  })
);

router.get(
  "/",
  wrap(async (req, res) => {
    const { rows } = await query(
      `select r.id, r.period_from, r.period_to, r.sections, r.created_at,
              d.name as department, p.full_name as requested_by
       from generated_reports r
       left join departments d on d.id = r.department_id
       left join profiles p on p.id = r.requested_by
       order by r.created_at desc limit 30`
    );
    res.json({ reports: rows });
  })
);

/** What a report can contain. Driven from the section definitions, so adding
 *  one is a single change rather than three places that drift apart. */
router.get(
  "/sections",
  wrap(async (_req, res) => {
    res.json({
      sections: Object.entries(SECTIONS).map(([id, s]) => ({ id, label: s.label })),
    });
  })
);

router.get(
  "/:id",
  wrap(async (req, res) => {
    const { rows } = await query(`select * from generated_reports where id = $1`, [req.params.id]);
    if (!rows[0]) throw notFound("Report");
    res.json(rows[0]);
  })
);

export default router;