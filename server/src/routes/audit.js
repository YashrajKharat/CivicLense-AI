import { Router } from "express";
import { query } from "../db/pool.js";
import { requireAuth, requireMinRole } from "../middleware/auth.js";
import { wrap } from "../middleware/errors.js";

const router = Router();

/* Read only. There is deliberately no POST, PATCH or DELETE on this resource. */
router.get(
  "/",
  requireAuth,
  requireMinRole("super_admin"),
  wrap(async (req, res) => {
    const { rows } = await query(
      `select a.id, a.action, a.entity, a.entity_id, a.at, p.full_name as actor_name,
              case a.action
                when 'complaint.status' then 'Status changed to ' || (a.after->>'status')
                when 'officer.assign'   then 'Assigned ' || coalesce(a.entity_id, '')
                when 'assign.override'  then 'Overrode the suggested officer'
                when 'sla.breach'       then 'SLA breached on ' || coalesce(a.entity_id, '')
                when 'proof.upload'     then 'Uploaded resolution proof'
                else a.action
              end as description
       from audit_logs a
       left join profiles p on p.id = a.actor
       order by a.at desc
       limit 100`
    );
    res.json({ entries: rows });
  })
);

export default router;
