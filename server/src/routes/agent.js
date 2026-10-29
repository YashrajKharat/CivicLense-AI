import { Router } from "express";
import { z } from "zod";
import { query } from "../db/pool.js";
import { requireAuth, requireMinRole } from "../middleware/auth.js";
import { wrap, badRequest, notFound } from "../middleware/errors.js";
import { runAgent, decideProposal } from "../agent/runner.js";
import { toolCatalogue } from "../agent/tools.js";

const router = Router();
router.use(requireAuth, requireMinRole("super_admin"));

/**
 * POST /api/agent/run
 * Streams the agent's steps over Server-Sent Events, because a run takes long
 * enough that a spinner with no detail is indistinguishable from a hang — and
 * because watching which tools it called is how an administrator decides
 * whether to trust the answer.
 */
router.post(
  "/run",
  wrap(async (req, res) => {
    const { task } = z.object({ task: z.string().min(5).max(500) }).parse(req.body);

    const { rows } = await query(
      `select p.full_name, d.name as department_name, d.id as department_id
       from profiles p
       left join officers o on o.id = p.id
       left join departments d on d.id = o.department_id
       where p.id = $1`,
      [req.user.id]
    );

    const ctx = {
      userId: req.user.id,
      userName: rows[0]?.full_name || "the administrator",
      role: req.user.role,
      departmentId: rows[0]?.department_id ?? null,
      departmentName: rows[0]?.department_name || "your",
    };

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    const send = (event) => res.write(`data: ${JSON.stringify(event)}\n\n`);

    // If the administrator navigates away mid-run we stop writing, but the run
    // still completes and is recorded — a half-executed agent is worse than one
    // that finished and was never read.
    let open = true;
    req.on("close", () => { open = false; });

    try {
      const result = await runAgent({ task, ctx, onEvent: (e) => open && send(e) });
      if (open) send({ type: "done", ...result });
    } catch (err) {
      if (open) send({ type: "failed", error: err.message });
    } finally {
      if (open) res.end();
    }
  })
);

/* POST /api/agent/proposals/:id — a named human accepts or rejects. */
router.post(
  "/proposals/:id",
  wrap(async (req, res) => {
    const { decision, note } = z
      .object({ decision: z.enum(["approved", "rejected"]), note: z.string().max(500).optional() })
      .parse(req.body);

    try {
      const result = await decideProposal({
        proposalId: req.params.id,
        decision,
        note,
        user: { id: req.user.id },
      });
      res.json(result);
    } catch (err) {
      throw badRequest(err.message);
    }
  })
);

/* GET /api/agent/proposals — anything still awaiting a decision. */
router.get(
  "/proposals",
  wrap(async (req, res) => {
    const scope = req.user.role === "global_admin" ? null : req.user.departmentId;
    const { rows } = await query(
      `select p.id, p.tool, p.args, p.preview, p.status, p.created_at,
              r.task, u.full_name as proposed_by
       from agent_proposals p
       join agent_runs r on r.id = p.run_id
       left join profiles u on u.id = p.proposed_by
       where p.status = 'pending' and ($1::int is null or r.department_id = $1)
       order by p.created_at desc
       limit 50`,
      [scope]
    );
    res.json({ proposals: rows });
  })
);

/* GET /api/agent/runs — history, so a run can be re-read after the fact. */
router.get(
  "/runs",
  wrap(async (req, res) => {
    const scope = req.user.role === "global_admin" ? null : req.user.departmentId;
    const { rows } = await query(
      `select r.id, r.task, r.status, r.answer, r.steps_used, r.duration_ms, r.created_at,
              u.full_name as requested_by,
              (select count(*)::int from agent_proposals p where p.run_id = r.id) as proposal_count
       from agent_runs r
       left join profiles u on u.id = r.requested_by
       where ($1::int is null or r.department_id = $1)
       order by r.created_at desc
       limit 25`,
      [scope]
    );
    res.json({ runs: rows });
  })
);

/* GET /api/agent/runs/:id — the full trace of one run. */
router.get(
  "/runs/:id",
  wrap(async (req, res) => {
    const { rows } = await query(`select * from agent_runs where id = $1`, [req.params.id]);
    if (!rows[0]) throw notFound("Run");

    const [steps, proposals] = await Promise.all([
      query(`select * from agent_steps where run_id = $1 order by step_no`, [req.params.id]),
      query(`select * from agent_proposals where run_id = $1 order by created_at`, [req.params.id]),
    ]);

    res.json({ run: rows[0], steps: steps.rows, proposals: proposals.rows });
  })
);

/* GET /api/agent/tools — what the agent can and cannot do, for the console. */
router.get("/tools", (_req, res) => res.json({ tools: toolCatalogue() }));

export default router;
