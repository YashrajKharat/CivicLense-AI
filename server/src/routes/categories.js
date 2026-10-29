import { Router } from "express";
import { z } from "zod";
import { query } from "../db/pool.js";
import { requireAuth, requireMinRole } from "../middleware/auth.js";
import { wrap, badRequest, notFound } from "../middleware/errors.js";

const router = Router();

/* Public read: the report form needs the active list. */
router.get(
  "/",
  wrap(async (req, res) => {
    const includeInactive = req.query.all === "true";

    const { rows } = await query(
      `select c.id, c.code, c.name, c.description, c.base_severity, c.active,
              c.responsible_party, c.updated_at,
              d.id as department_id, d.name as department, d.code as department_code,
              u.total, u.open, u.last_used
       from categories c
       left join departments d on d.id = c.default_department_id
       left join category_usage u on u.id = c.id
       where ($1::bool is true or c.active)
       order by d.name nulls last, c.name`,
      [includeInactive]
    );

    res.json({ categories: rows });
  })
);

/* Everything below is administrative. */
router.use(requireAuth, requireMinRole("super_admin"));

const bodySchema = z.object({
  code: z.string().min(2).max(30).regex(/^[A-Z0-9_]+$/, "Use capitals, digits and underscores only"),
  name: z.string().min(2).max(80),
  description: z.string().max(300).optional(),
  default_department_id: z.number().int(),
  base_severity: z.number().int().min(0).max(100),
  responsible_party: z.enum(["contractor", "establishment", "department"]),
});

router.post(
  "/",
  wrap(async (req, res) => {
    const input = bodySchema.parse(req.body);

    // A department super admin can only add categories that route to their own
    // department — otherwise they could quietly move work onto someone else.
    if (req.user.role === "super_admin" && input.default_department_id !== req.user.departmentId) {
      throw badRequest("You can only add categories that route to your own department.");
    }

    const { rows: existing } = await query(`select id, active from categories where code = $1`, [input.code]);
    if (existing[0]) {
      throw badRequest(
        existing[0].active
          ? "A category with that code already exists."
          : "That code belongs to a deactivated category. Reactivate it instead of creating a duplicate."
      );
    }

    const { rows } = await query(
      `insert into categories
         (code, name, description, default_department_id, base_severity, responsible_party, created_by)
       values ($1,$2,$3,$4,$5,$6,$7)
       returning id, code, name`,
      [input.code, input.name, input.description ?? null, input.default_department_id,
       input.base_severity, input.responsible_party, req.user.id]
    );

    // A new category needs SLA rules or every complaint under it inherits the
    // fallback deadline silently.
    await query(
      `insert into sla_rules (category_id, severity, hours, escalate_after_hours)
       values ($1,'critical',12,12), ($1,'high',24,24), ($1,'medium',72,48), ($1,'low',168,96)`,
      [rows[0].id]
    );

    res.status(201).json({ category: rows[0] });
  })
);

router.patch(
  "/:id",
  wrap(async (req, res) => {
    const input = bodySchema.partial().omit({ code: true }).parse(req.body);

    const { rows: current } = await query(
      `select id, default_department_id from categories where id = $1`, [req.params.id]
    );
    if (!current[0]) throw notFound("Category");

    if (req.user.role === "super_admin" && current[0].default_department_id !== req.user.departmentId) {
      throw badRequest("That category belongs to another department.");
    }

    const { rows } = await query(
      `update categories set
         name = coalesce($2, name),
         description = coalesce($3, description),
         default_department_id = coalesce($4, default_department_id),
         base_severity = coalesce($5, base_severity),
         responsible_party = coalesce($6, responsible_party),
         created_by = $7
       where id = $1
       returning id, code, name`,
      [req.params.id, input.name ?? null, input.description ?? null,
       input.default_department_id ?? null, input.base_severity ?? null,
       input.responsible_party ?? null, req.user.id]
    );

    res.json({ category: rows[0] });
  })
);

/**
 * Deactivate rather than delete. Complaints reference the category, and
 * removing it would orphan their history — so it disappears from the report
 * form while existing reports keep their classification.
 */
router.post(
  "/:id/active",
  wrap(async (req, res) => {
    const { active } = z.object({ active: z.boolean() }).parse(req.body);

    const { rows: current } = await query(
      `select c.default_department_id, u.open
       from categories c
       left join category_usage u on u.id = c.id
       where c.id = $1`,
      [req.params.id]
    );
    if (!current[0]) throw notFound("Category");

    if (req.user.role === "super_admin" && current[0].default_department_id !== req.user.departmentId) {
      throw badRequest("That category belongs to another department.");
    }

    await query(`update categories set active = $2, created_by = $3 where id = $1`,
      [req.params.id, active, req.user.id]);

    res.json({
      ok: true,
      note:
        !active && current[0].open > 0
          ? `${current[0].open} open complaints keep this category. Residents will no longer see it.`
          : null,
    });
  })
);

export default router;
