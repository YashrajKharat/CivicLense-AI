import { Router } from "express";
import { query } from "../db/pool.js";
import { requireAuth, requireMinRole } from "../middleware/auth.js";
import { wrap } from "../middleware/errors.js";
import { buildDailyBrief } from "../services/insights.js";

const router = Router();
router.use(requireAuth, requireMinRole("super_admin"));

/* GET /api/insights — today's brief, generated on demand if the job has not run. */
router.get(
  "/",
  wrap(async (req, res) => {
    const scope = req.user.role === "global_admin" ? null : req.user.departmentId;

    const { rows } = await query(
      `select items, created_at from daily_briefs
       where brief_date = current_date and department_id is not distinct from $1`,
      [scope]
    );

    // No cache read. The brief used to be an expensive model call, so it was
    // stored once a day — a sensible trade then. It is now a handful of
    // aggregate queries taking milliseconds, and a cached brief is a stale one:
    // an administrator opening it at four o'clock was reading this morning's
    // figures with today's date on them.
    const brief = await buildDailyBrief(scope);
    res.json({ ...brief, generated_at: new Date().toISOString(), cached: false });
  })
);

/* POST /api/insights/refresh */
router.post(
  "/refresh",
  wrap(async (req, res) => {
    const scope = req.user.role === "global_admin" ? null : req.user.departmentId;
    const brief = await buildDailyBrief(scope);
    res.json({ ...brief, generated_at: new Date().toISOString() });
  })
);

export default router;
