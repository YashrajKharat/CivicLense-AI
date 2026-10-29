# The operations agent

`/admin/agent` — an agent that investigates live records step by step and proposes actions.

It is not the chat assistant. `/assistant` answers one question from a pre-built snapshot. The
agent decides for itself what to look at, runs several queries in sequence, and can put a change
in front of you for approval.

## The safety model

This is a governance system whose entire claim is that nothing happens without a name attached.
The agent is built to that standard, structurally rather than by instruction:

**Reads execute. Writes only ever propose.** A write tool has no `run()` at all — it has
`preview()`, which produces an approval card. There is no code path by which the agent changes a
row. Approval is what executes, and the audit entry names the human who approved it, plus the run
it came from.

**Some capabilities simply do not exist.** There is no tool to resolve or close a complaint, reject
a resident's report, edit the audit log, or change a role. They are absent rather than guarded,
because an absent capability cannot be argued around by a clever prompt.

**Scope is enforced in SQL, not in the prompt.** Every query takes the caller's department as a
parameter. A department admin's agent cannot read another department's rows even if it is
convinced it should.

**The loop is bounded structurally.** Eight steps, a 90-second wall clock, 4,000-character tool
results, and loop detection on repeated identical calls. A runaway agent here is an incident, not
a curiosity, so the ceiling is not something the model is asked to respect.

**Proposals expire after 24 hours.** One reasoned about against yesterday's data has stopped being
a good suggestion, so it lapses rather than ageing quietly into a bad decision.

## Tools

Eight read tools: `search_complaints`, `get_complaint`, `list_clusters`, `department_stats`,
`officer_workload`, `contract_performance`, `ward_breakdown`, `suggest_officer`.

Three proposal tools: `propose_assignment`, `propose_escalation`, `propose_report`.

`GET /api/agent/tools` returns the live catalogue, which is also what the model is shown.

## Why JSON actions rather than native function calling

Native tool calling is shaped differently on Gemini, on OpenAI-compatible endpoints and on Ollama,
and support across free tiers is uneven. One JSON contract behaves identically on all four
backends, and `parseJSON` already survives the ways weak models mangle output — fences, preambles,
trailing chatter. The cost is a little prompt overhead; the benefit is that switching
`AI_PROVIDER` does not change the agent's behaviour.

Weak models do misbehave. The runner treats that as ordinary: an unknown tool name, invalid
arguments or a repeated call are each fed back as a correction and the run continues, rather than
failing the whole thing.

## Watching it work

The console streams over SSE. You see each step's reasoning, the tool called, the arguments and an
expandable raw result. That is deliberate — an answer you cannot trace is an answer you should not
act on, and the working is how you decide whether to believe the summary.

## Persistence

`agent_runs`, `agent_steps` and `agent_proposals` record everything. `agent_steps` has no update or
delete policy, for the same reason `audit_logs` has none: a record you can edit is not a record.

## Example

> "Find overdue critical complaints and propose officers for the worst three"

```
1  search_complaints  { severity: "critical", overdue_only: true }   → 7 rows
2  suggest_officer    { ref: "CP-10482" }                            → 5 candidates
3  propose_assignment { ref: "CP-10482", officer_id: "…", reason: … } → approval card
4  suggest_officer    { ref: "CP-10203" }                            → 5 candidates
5  propose_assignment { … }                                          → approval card
6  answer
```

Nothing was assigned. Two cards are waiting for you.

## Configuration

```
AGENT_MAX_STEPS=8        # step ceiling per run
AGENT_TIMEOUT_MS=90000   # wall clock per run
```

Rate limited to 6 runs per minute per instance, since each run is several model calls.
