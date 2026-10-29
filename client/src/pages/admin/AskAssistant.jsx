import { useState } from "react";
import { api } from "../../lib/api.js";
import { Label, ErrorNote, Panel } from "../../components/Primitives.jsx";
import { Icon } from "../../components/Icons.jsx";

const SUGGESTIONS = [
  "Which ward needs attention first?",
  "Summarise today's critical issues",
  "Which contractor is underperforming?",
  "Where is officer workload unbalanced?",
];

export default function AskAssistant() {
  const [q, setQ] = useState("");
  const [answer, setAnswer] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function run(text) {
    const question = text ?? q;
    if (!question.trim()) return;
    setQ(question);
    setBusy(true);
    setAnswer(null);
    setError(null);
    try {
      setAnswer(await api.ask(question));
    } catch (e) {
      setError(e.message || "The assistant did not respond.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <div className="askbar">
        <Icon.sparkle width={16} height={16} style={{ color: "var(--accent)", flex: "none" }} />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && run()}
          placeholder="Ask about wards, groups, contracts or officers"
          aria-label="Ask the assistant"
        />
        <button className="btn btn--sm" onClick={() => run()} disabled={busy}>
          {busy ? "Reading…" : "Ask"}
        </button>
      </div>

      {/* Quiet chips, so the Ask button stays the only accent in this block. */}
      <div className="row row--wrap" style={{ gap: 6, marginTop: "var(--s-3)" }}>
        {SUGGESTIONS.map((s) => (
          <button key={s} className="chip" onClick={() => run(s)}>{s}</button>
        ))}
      </div>

      {error && <div style={{ marginTop: "var(--s-4)" }}><ErrorNote onRetry={() => run()}>{error}</ErrorNote></div>}

      {/* When the question is not one of the four it knows, it says so and
          lists them rather than answering something else. */}
      {answer?.unmatched && (
        <div
          style={{
            marginTop: "var(--s-4)", padding: "var(--s-4)",
            background: "var(--surface-2)", borderRadius: "var(--r)",
          }}
        >
          <strong style={{ fontSize: "var(--t-sm)" }}>{answer.headline}</strong>
          <p className="prose" style={{ fontSize: "var(--t-sm)", marginTop: "var(--s-2)" }}>
            {answer.reading}
          </p>
          <div className="row row--wrap" style={{ gap: 6, marginTop: "var(--s-3)" }}>
            {answer.findings.map((f) => (
              <button key={f.label} className="chip" onClick={() => run(f.label)}>
                {f.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {answer && !answer.unmatched && (
        <div className="fade-in" style={{ marginTop: "var(--s-4)" }}>
          <Panel title={answer.headline} action={<Label>grounded in live records</Label>}>
            {answer.findings?.length > 0 && (
              <div style={{ display: "grid", gap: 1, background: "var(--line)", borderRadius: "var(--r)", overflow: "hidden", marginBottom: "var(--s-4)" }}>
                {answer.findings.map((f, i) => (
                  <div
                    key={i}
                    className="row row--between"
                    style={{ background: "var(--surface)", padding: "var(--s-3) var(--s-4)", gap: "var(--s-4)", flexWrap: "wrap" }}
                  >
                    <span style={{ fontSize: "var(--t-sm)", fontWeight: 500 }}>
                      {f.label}
                      {f.note && <span className="muted" style={{ fontWeight: 400 }}> — {f.note}</span>}
                    </span>
                    <span className="mono" style={{ fontSize: "var(--t-sm)", fontWeight: 600 }}>{f.value}</span>
                  </div>
                ))}
              </div>
            )}

            <p className="prose">{answer.reading}</p>

            {answer.action && (
              <div style={{ marginTop: "var(--s-4)", paddingTop: "var(--s-4)", borderTop: "1px solid var(--line)" }}>
                <Label>Recommended</Label>
                <p style={{ margin: "4px 0 0", fontSize: "var(--t-sm)" }}>{answer.action}</p>
              </div>
            )}

            <p className="label" style={{ marginTop: "var(--s-4)" }}>
              Every figure came from a query, not from memory. Verify before acting.
            </p>
          </Panel>
        </div>
      )}
    </section>
  );
}
