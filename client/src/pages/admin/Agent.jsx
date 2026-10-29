import { useEffect, useRef, useState } from "react";
import { api } from "../../lib/api.js";
import { streamAgent } from "../../lib/agentStream.js";
import { Label, Badge, Loading, ErrorNote, Empty, Tile } from "../../components/Primitives.jsx";
import { Icon } from "../../components/Icons.jsx";
import { when } from "../../lib/format.js";

const EXAMPLES = [
  "Which ward has the worst backlog right now, and why?",
  "Find overdue critical complaints and propose officers for the worst three",
  "Which contractor has the most overdue linked complaints?",
  "Summarise the emerging hotspots and what is driving them",
];

export default function Agent() {
  const [task, setTask] = useState("");
  const [events, setEvents] = useState([]);
  const [answer, setAnswer] = useState(null);
  const [proposals, setProposals] = useState([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState(null);
  const [pending, setPending] = useState([]);
  const [history, setHistory] = useState([]);
  const abortRef = useRef(null);
  const endRef = useRef(null);

  const loadSidebars = () => {
    api.agentProposals().then((r) => setPending(r.proposals)).catch(() => {});
    api.agentRuns().then((r) => setHistory(r.runs)).catch(() => {});
  };

  useEffect(() => { loadSidebars(); }, []);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [events]);
  useEffect(() => () => abortRef.current?.(), []);

  function run(text) {
    const prompt = (text ?? task).trim();
    if (!prompt || running) return;

    setTask(prompt);
    setEvents([]);
    setAnswer(null);
    setProposals([]);
    setError(null);
    setRunning(true);

    abortRef.current = streamAgent(prompt, {
      onEvent: (e) => {
        if (e.type === "answer" || (e.type === "done" && e.answer)) setAnswer(e.answer);
        if (e.type === "proposal") setProposals((p) => [...p, e.proposal]);
        if (e.type === "failed") setError(e.error);
        if (e.type === "done" || e.type === "failed") {
          setRunning(false);
          // A failed run produced no proposals and wrote no history, so there is
          // nothing new to fetch. Refreshing anyway burned the rate limit
          // whenever the provider was down and the user retried.
          if (e.type === "done") loadSidebars();
        }
        setEvents((list) => [...list, e]);
      },
      onError: (message) => { setError(message); setRunning(false); },
      onClose: () => setRunning(false),
    });
  }

  async function decide(id, decision) {
    await api.decideProposal(id, decision);
    setProposals((list) => list.map((p) => (p.id === id ? { ...p, status: decision } : p)));
    loadSidebars();
  }

  return (
    <div className="fade-in">
      <div className="row row--between row--wrap" style={{ gap: 16 }}>
        <div>
          <Label>Operations agent</Label>
          <h1 className="display d-md" style={{ marginTop: 4 }}>Ask it to investigate</h1>
        </div>
        {running && <Badge tone="info">Running</Badge>}
      </div>

      <p className="prose" style={{ marginTop: 10 }}>
        The agent queries live records step by step and shows its working. It can read anything in
        your scope, and it can propose an assignment, an escalation or a report — but every change
        waits for you to approve it, under your name.
      </p>

      <div className="dash" style={{ marginTop: "var(--sp-5)" }}>
        <div className="stack-4">
          <section className="card card--pad">
            <textarea
              className="input"
              rows={3}
              value={task}
              onChange={(e) => setTask(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) run(); }}
              placeholder="What should it look into?"
              disabled={running}
            />

            <div className="row row--between row--wrap" style={{ marginTop: 12, gap: 10 }}>
              <span className="label">⌘↵ to run</span>
              {running ? (
                <button className="btn btn--ghost" onClick={() => { abortRef.current?.(); setRunning(false); }}>
                  Stop watching
                </button>
              ) : (
                <button className="btn" onClick={() => run()} disabled={!task.trim()}>
                  <Icon.sparkle width={16} height={16} /> Run agent
                </button>
              )}
            </div>

            {!events.length && !running && (
              <div style={{ marginTop: 16 }}>
                <Label>Try</Label>
                <div className="row row--wrap" style={{ gap: 8, marginTop: 8 }}>
                  {EXAMPLES.map((ex) => (
                    <button key={ex} className="btn btn--ghost btn--sm" onClick={() => run(ex)}>{ex}</button>
                  ))}
                </div>
              </div>
            )}
          </section>

          {error && <ErrorNote onRetry={() => run()}>{error}</ErrorNote>}

          {events.length > 0 && (
            <section className="card card--pad">
              <Label>Working</Label>
              <div style={{ marginTop: 14 }}>
                {events.map((e, i) => <Step key={i} event={e} />)}
                {running && (
                  <div className="row" style={{ color: "var(--muted)", paddingTop: 10 }}>
                    <span className="spin" style={{ display: "inline-flex" }}><Icon.clock width={15} height={15} /></span>
                    <span className="label">thinking</span>
                  </div>
                )}
                <div ref={endRef} />
              </div>
            </section>
          )}

          {proposals.length > 0 && (
            <section className="stack-4">
              {proposals.map((p) => <ProposalCard key={p.id} proposal={p} onDecide={decide} />)}
            </section>
          )}

          {answer && <AnswerCard answer={answer} />}
        </div>

        <aside className="stack-4">
          <section className="card card--pad">
            <div className="row row--between">
              <h2 className="h h-lg">Awaiting approval</h2>
              {pending.length > 0 && <Badge tone="accent">{pending.length}</Badge>}
            </div>

            {pending.length === 0 ? (
              <p className="prose" style={{ fontSize: 14, marginTop: 8 }}>
                Nothing waiting. Proposals expire after 24 hours, because one reasoned against
                yesterday's data is not worth acting on.
              </p>
            ) : (
              <div style={{ marginTop: 8 }}>
                {pending.map((p) => (
                  <div key={p.id} className="listrow" style={{ alignItems: "flex-start" }}>
                    <Tile icon={Icon.alert} tone="accent" />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600 }}>{p.preview?.summary || p.tool}</div>
                      <div className="label" style={{ marginTop: 3 }}>{when(p.created_at)} · {p.proposed_by}</div>
                      <div className="row" style={{ marginTop: 8, gap: 6 }}>
                        <button className="btn btn--sm" onClick={() => decide(p.id, "approved")}>Approve</button>
                        <button className="btn btn--ghost btn--sm" onClick={() => decide(p.id, "rejected")}>Reject</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="card card--pad">
            <h2 className="h h-lg">Recent runs</h2>
            {history.length === 0 ? (
              <p className="prose" style={{ fontSize: 14, marginTop: 8 }}>No runs yet.</p>
            ) : (
              <div style={{ marginTop: 8 }}>
                {history.slice(0, 8).map((r) => (
                  <button
                    key={r.id}
                    className="listrow"
                    style={{ alignItems: "flex-start" }}
                    onClick={() => run(r.task)}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="truncate" style={{ fontSize: 14 }}>{r.task}</div>
                      <div className="row" style={{ gap: 8, marginTop: 4 }}>
                        <Badge tone={r.status === "done" ? "ok" : r.status === "running" ? "info" : "warn"}>
                          {r.status}
                        </Badge>
                        <span className="label">
                          {r.steps_used} steps · {Math.round((r.duration_ms || 0) / 1000)}s
                        </span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </section>

          <section className="card card--pad" style={{ background: "var(--ink-900)", borderColor: "var(--ink-line)", color: "var(--on-dark)" }}>
            <Label style={{ color: "var(--record)" }}>What it cannot do</Label>
            <ul style={{ margin: "10px 0 0", paddingLeft: 18, fontSize: 13, color: "var(--on-dark-2)" }}>
              <li>Resolve or close a complaint — only the resident who filed it can</li>
              <li>Reject a resident's report</li>
              <li>Edit the audit log or change anyone's role</li>
              <li>Read another department's records</li>
              <li>Execute any change without your approval</li>
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}

function Step({ event }) {
  if (event.type === "run_started") {
    return <div className="label" style={{ paddingBottom: 10 }}>Run started</div>;
  }

  if (event.type === "step" && event.kind === "call") {
    return (
      <div style={{ paddingBottom: 12 }}>
        <div className="row" style={{ gap: 8 }}>
          <Badge tone="pending">step {event.step}</Badge>
          <span className="ref">{event.tool}</span>
        </div>
        {event.thought && <p className="prose" style={{ fontSize: 14, marginTop: 6 }}>{event.thought}</p>}
        {event.args && Object.keys(event.args).length > 0 && (
          <div className="mono" style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>
            {JSON.stringify(event.args)}
          </div>
        )}
      </div>
    );
  }

  if (event.type === "result") {
    const rows = countRows(event.result);
    return (
      <details style={{ paddingBottom: 12 }}>
        <summary className="label" style={{ cursor: "pointer" }}>
          returned {rows === null ? "a result" : `${rows} row${rows === 1 ? "" : "s"}`}
        </summary>
        <pre
          className="mono"
          style={{
            marginTop: 8, padding: 12, background: "var(--surface-2)", borderRadius: "var(--r)",
            fontSize: 11, maxHeight: 240, overflow: "auto",
          }}
        >
          {JSON.stringify(event.result, null, 2)}
        </pre>
      </details>
    );
  }

  if (event.type === "step" && event.kind === "error") {
    return (
      <div style={{ paddingBottom: 12 }}>
        <Badge tone="warn">step {event.step} · corrected</Badge>
        <p className="prose" style={{ fontSize: 13, marginTop: 6 }}>{event.note}</p>
      </div>
    );
  }

  if (event.type === "proposal") {
    return (
      <div style={{ paddingBottom: 12 }}>
        <Badge tone="accent">proposed</Badge>
        <p className="prose" style={{ fontSize: 14, marginTop: 6 }}>{event.proposal.preview?.summary}</p>
      </div>
    );
  }

  return null;
}

function ProposalCard({ proposal, onDecide }) {
  const decided = proposal.status && proposal.status !== "pending";

  return (
    <section className="card card--pad" style={{ borderLeft: "3px solid var(--accent)" }}>
      <div className="row row--between row--wrap" style={{ gap: 10 }}>
        <Label style={{ color: "var(--accent)" }}>Needs your approval</Label>
        {decided && <Badge tone={proposal.status === "approved" ? "ok" : "pending"}>{proposal.status}</Badge>}
      </div>

      <h3 className="h h-lg" style={{ marginTop: 8 }}>{proposal.preview?.summary}</h3>

      {proposal.preview?.reason && (
        <p className="prose" style={{ marginTop: 8 }}>{proposal.preview.reason}</p>
      )}

      {proposal.preview?.current && (
        <div className="label" style={{ marginTop: 8 }}>Currently: {proposal.preview.current}</div>
      )}

      {!decided && (
        <div className="row" style={{ marginTop: 16, gap: 10 }}>
          <button className="btn" onClick={() => onDecide(proposal.id, "approved")}>Approve and apply</button>
          <button className="btn btn--ghost" onClick={() => onDecide(proposal.id, "rejected")}>Reject</button>
        </div>
      )}

      <p className="label" style={{ marginTop: 12 }}>
        Approving records the change against your name in the audit log.
      </p>
    </section>
  );
}

function AnswerCard({ answer }) {
  return (
    <section className="card card--pad fade-in" style={{ borderLeft: "3px solid var(--record)" }}>
      <Label style={{ color: "var(--record)" }}>Answer</Label>
      <h2 className="display d-sm" style={{ marginTop: 8 }}>{answer.headline}</h2>

      {answer.findings?.length > 0 && (
        <table className="table table--stack" style={{ marginTop: 16 }}>
          <tbody>
            {answer.findings.map((f, i) => (
              <tr key={i}>
                <td data-label="Finding" style={{ fontWeight: 500 }}>{f.label}</td>
                <td data-label="Note" className="muted">{f.note}</td>
                <td data-label="Value" className="mono" style={{ textAlign: "right" }}>{f.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p className="prose" style={{ marginTop: 16 }}>{answer.reading}</p>

      <p className="label" style={{ marginTop: 16 }}>
        Every figure above came from a query you can see in the working. Verify before acting.
      </p>
    </section>
  );
}

/** Best-effort row count so the collapsed step summary says something useful. */
function countRows(result) {
  if (!result || typeof result !== "object") return null;
  if (typeof result.count === "number") return result.count;
  const list = Object.values(result).find(Array.isArray);
  return list ? list.length : null;
}