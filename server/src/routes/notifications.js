import { Router } from "express";
import { query } from "../db/pool.js";
import { requireAuth } from "../middleware/auth.js";
import { wrap } from "../middleware/errors.js";

const router = Router();
router.use(requireAuth);

router.get(
  "/",
  wrap(async (req, res) => {
    const { rows } = await query(
      `select n.id, n.kind, n.title, n.body, n.read_at, n.created_at, c.ref as complaint_ref
       from notifications n
       left join complaints c on c.id = n.complaint_id
       where n.user_id = $1
       order by n.created_at desc limit 50`,
      [req.user.id]
    );
    res.json({ notifications: rows, unread: rows.filter((n) => !n.read_at).length });
  })
);

router.post(
  "/read",
  wrap(async (req, res) => {
    await query(
      `update notifications set read_at = now() where user_id = $1 and read_at is null`,
      [req.user.id]
    );
    res.json({ ok: true });
  })
);

export default router;
