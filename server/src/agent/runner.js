import { complete, parseJSON, aiProvider } from "../services/ai/index.js";
import { query, transaction } from "../db/pool.js";
import { TOOLS } from "./tools.js";
import { planFor, runPlan, PLAN_LABELS } from "./planner.js";

const MAX_STEPS = Number(process.env.AGENT_MAX_STEPS || 8);
const MAX_RESULT_CHARS = 4000;
const TIMEOUT_MS = Number(process.env.AGENT_TIMEOUT_MS || 90_000);

/**
 * The agent loop.
 *
 * Bounded on purpose: a fixed step budget, a wall-clock timeout, truncated tool
 * results, and loop detection on repeated identical calls. A runaway agent in a
 * governance system is not a curiosity, it is an incident — so the ceiling is
 * structural rather than something the model is asked to respect.
 *
 * `onEvent` receives each step as it happens so the console can stream.
 */
export async function runAgent({ task, ctx, onEvent = () => {} }) {
  // The agent chooses which tool to call next from a free-form task, which is
  // the one thing here that genuinely needs a language model — everything else
  // was replaced with templates and queries. Without one it says so plainly
  // rather than failing halfway through a run.
  /**
   * Without a text provider, fall back to the rule-based planner.
   *
   * It used to give up here, so every run showed "unreadable result", zero
   * steps, red — which is a poor showing for a feature whose point is reasoning
   * over live data. The planner covers the questions administrators actually
   * ask, runs the same tools against the same database, and emits the same
   * events, so nothing downstream can tell the difference.
   */
  const usePlanner = !aiProvider.configured || aiProvider.name === "local" || aiProvider.name === "mock";

  if (usePlanner) {
    const plan = planFor(task);

    if (!plan) {
      onEvent({
        type: "failed",
        error:
          `Without a text provider the agent recognises a fixed set of tasks. Try one of: ` +
          PLAN_LABELS.join("; ") + ".",
      });
      return { ok: false };
    }

    const out = await runPlan({ plan, ctx, onEvent, TOOLS });
    onEvent({ type: "done", answer: out.answer, steps: out.steps });
    return { ok: true, ...out };
  }

  const started = Date.now();
  const transcript = [];
  const proposals = [];
  const seen = new Set();

  const { rows: created } = await query(
    `insert into agent_runs (requested_by, department_id, task, status)
     values ($1, $2, $3, 'running') returning id, created_at`,
    [ctx.userId, ctx.role === "global_admin" ? null : ctx.departmentId, task]
  );
  const runId = created[0].id;
  onEvent({ type: "run_started", runId });

  const finish = async (status, answer, error) => {
    await query(
      `update agent_runs set status = $2, answer = $3, error = $4,
              steps_used = $5, duration_ms = $6, finished_at = now()
       where id = $1`,
      [runId, status, answer ?? null, error ?? null, transcript.length, Date.now() - started]
    );
    onEvent({ type: status === "done" ? "answer" : "failed", runId, answer, error, proposals });
    return { runId, status, answer, error, proposals, steps: transcript.length };
  };

  const { systemPrompt, stepPrompt } = await import("./prompts.js");
  const system = systemPrompt(ctx);

  for (let step = 1; step <= MAX_STEPS; step += 1) {
    if (Date.now() - started > TIMEOUT_MS) {
      return finish("timeout", null, "The agent ran out of time before reaching an answer.");
    }

    let decision;
    try {
      const raw = await complete({
        system,
        messages: [{ role: "user", content: stepPrompt({ task, transcript, stepsLeft: MAX_STEPS - step }) }],
        maxTokens: 1200,
        temperature: 0,
      });
      decision = parseJSON(raw);
    } catch (err) {
      return finish("failed", null, err.message);
    }

    /* ---- final answer ---- */
    if (decision.answer) {
      await recordStep(runId, step, { kind: "answer", thought: decision.thought, answer: decision.answer });
      return finish("done", decision.answer);
    }

    /* ---- tool call ---- */
    const tool = TOOLS[decision.tool];
    if (!tool) {
      const note = `No tool named "${decision.tool}". Choose one from the catalogue.`;
      transcript.push({ kind: "note", step, note });
      await recordStep(runId, step, { kind: "error", thought: decision.thought, error: note });
      onEvent({ type: "step", step, kind: "error", note });
      continue;
    }

    const fingerprint = `${decision.tool}:${JSON.stringify(decision.args ?? {})}`;
    if (seen.has(fingerprint)) {
      const note = `You already called ${decision.tool} with those arguments. Use the earlier result or answer now.`;
      transcript.push({ kind: "note", step, note });
      await recordStep(runId, step, { kind: "error", thought: decision.thought, error: note });
      onEvent({ type: "step", step, kind: "error", note });
      continue;
    }
    seen.add(fingerprint);

    let args;
    try {
      args = tool.params.parse(decision.args ?? {});
    } catch (err) {
      const note = `Invalid arguments for ${decision.tool}: ${err.errors?.map((e) => `${e.path.join(".")} ${e.message}`).join("; ") || err.message}`;
      transcript.push({ kind: "note", step, note });
      await recordStep(runId, step, { kind: "error", thought: decision.thought, error: note });
      onEvent({ type: "step", step, kind: "error", note });
      continue;
    }

    onEvent({ type: "step", step, kind: "call", tool: decision.tool, thought: decision.thought, args });

    try {
      if (tool.readOnly) {
        const result = await tool.run(args, ctx);
        const serialised = truncate(JSON.stringify(result));
        transcript.push({ kind: "call", step, tool: decision.tool, args, result: serialised });
        await recordStep(runId, step, { kind: "call", tool: decision.tool, thought: decision.thought, args, result });
        onEvent({ type: "result", step, tool: decision.tool, result });
      } else {
        /* Writes stop here. The agent gets a receipt, a human gets a decision. */
        const preview = await tool.preview(args, ctx);
        const proposal = await createProposal({ runId, ctx, tool: decision.tool, args, preview });
        proposals.push(proposal);

        const receipt = `Approval ${proposal.id} created and is awaiting a human decision. Nothing has been changed.`;
        transcript.push({ kind: "call", step, tool: decision.tool, args, result: receipt });
        await recordStep(runId, step, {
          kind: "proposal", tool: decision.tool, thought: decision.thought, args, result: preview,
        });
        onEvent({ type: "proposal", step, proposal });
      }
    } catch (err) {
      const note = `${decision.tool} failed: ${err.message}`;
      transcript.push({ kind: "note", step, note });
      await recordStep(runId, step, { kind: "error", thought: decision.thought, error: note });
      onEvent({ type: "step", step, kind: "error", note });
    }
  }

  return finish("exhausted", null, `The agent used all ${MAX_STEPS} steps without reaching an answer.`);
}

const truncate = (text) =>
  text.length > MAX_RESULT_CHARS
    ? `${text.slice(0, MAX_RESULT_CHARS)}… [truncated — narrow your query if you need more]`
    : text;

function recordStep(runId, step, payload) {
  return query(
    `insert into agent_steps (run_id, step_no, kind, tool, thought, args, result, error)
     values ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [runId, step, payload.kind, payload.tool ?? null, payload.thought ?? null,
     payload.args ?? null, payload.result ?? payload.answer ?? null, payload.error ?? null]
  );
}

async function createProposal({ runId, ctx, tool, args, preview }) {
  const { rows } = await query(
    `insert into agent_proposals (run_id, proposed_by, tool, args, preview, status)
     values ($1,$2,$3,$4,$5,'pending') returning id, created_at`,
    [runId, ctx.userId, tool, args, preview]
  );
  return { id: rows[0].id, tool, args, preview, status: "pending" };
}

/* ============================================================
   Approval — where a proposal actually becomes a change.
   The acting user is the approver, never the agent. Every branch
   writes an audit row naming both the human and the run.
   ============================================================ */

export async function decideProposal({ proposalId, decision, note, user }) {
  return transaction(async (client) => {
    const { rows } = await client.query(
      `select p.*, r.department_id from agent_proposals p
       join agent_runs r on r.id = p.run_id
       where p.id = $1 for update`,
      [proposalId]
    );
    const proposal = rows[0];
    if (!proposal) throw new Error("That proposal no longer exists.");
    if (proposal.status !== "pending") throw new Error(`This proposal was already ${proposal.status}.`);

    if (decision === "rejected") {
      await client.query(
        `update agent_proposals set status = 'rejected', decided_by = $2, decided_at = now(), decision_note = $3
         where id = $1`,
        [proposalId, user.id, note ?? null]
      );
      await audit(client, user.id, "agent.proposal.rejected", proposalId, { tool: proposal.tool });
      return { status: "rejected" };
    }

    const args = proposal.args;
    let outcome;

    switch (proposal.tool) {
      case "propose_assignment": {
        const { rows: target } = await client.query(
          `select id, status from complaints where ref = $1`, [args.ref]
        );
        if (!target[0]) throw new Error("That complaint no longer exists.");

        await client.query(
          `update complaints set assigned_officer = $2, status = 'assigned' where id = $1`,
          [target[0].id, args.officer_id]
        );
        await client.query(
          `insert into complaint_status_history (complaint_id, from_status, to_status, actor, note)
           values ($1,$2,'assigned',$3,$4)`,
          [target[0].id, target[0].status, user.id, `Agent proposal approved: ${args.reason}`]
        );
        await audit(client, user.id, "officer.assign", args.ref, {
          officer_id: args.officer_id, via: "agent", run_id: proposal.run_id,
        });
        outcome = { assigned: args.ref };
        break;
      }

      case "propose_escalation": {
        const { rows: target } = await client.query(
          `select id, escalation_level from complaints where ref = $1`, [args.ref]
        );
        if (!target[0]) throw new Error("That complaint no longer exists.");

        const next = Math.min(target[0].escalation_level + 1, 2);
        await client.query(
          `update complaints set escalation_level = $2, last_escalated_at = now() where id = $1`,
          [target[0].id, next]
        );
        await audit(client, user.id, "complaint.escalated", args.ref, {
          from: target[0].escalation_level, to: next, via: "agent", run_id: proposal.run_id,
        });
        outcome = { escalated: args.ref, level: next };
        break;
      }

      case "propose_report": {
        const { generateReport } = await import("../services/reports.js");
        const report = await generateReport({
          from: args.from, to: args.to,
          departmentId: proposal.department_id,
          sections: args.sections, requestedBy: user.id,
        });
        await audit(client, user.id, "report.generated", report.id, { via: "agent", run_id: proposal.run_id });
        outcome = { report_id: report.id };
        break;
      }

      default:
        throw new Error(`No approval handler for ${proposal.tool}.`);
    }

    await client.query(
      `update agent_proposals set status = 'approved', decided_by = $2, decided_at = now(),
              decision_note = $3, outcome = $4
       where id = $1`,
      [proposalId, user.id, note ?? null, outcome]
    );
    await audit(client, user.id, "agent.proposal.approved", proposalId, { tool: proposal.tool, outcome });

    return { status: "approved", outcome };
  });
}

const audit = (client, actor, action, entityId, after) =>
  client.query(
    `insert into audit_logs (actor, action, entity, entity_id, after)
     values ($1,$2,'agent',$3,$4)`,
    [actor, action, String(entityId), JSON.stringify(after)]
  );
