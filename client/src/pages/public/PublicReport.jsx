import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api } from "../../lib/api.js";
import { useAuth } from "../../lib/auth.jsx";
import {
  Panel, Badge, Label, SeverityBadge, StatusBadge, ErrorNote, SkeletonRows,
  VerificationBadge,
} from "../../components/Primitives.jsx";
import { Icon } from "../../components/Icons.jsx";

/**
 * What a neighbour can add.
 *
 * Four kinds, because "I have seen this too" and "this was fixed last week"
 * mean different things to a queue and should not arrive as undifferentiated
 * text. Corroboration raises the priority, a dispute lowers it, and both are
 * counted rather than read by somebody scanning a thread.
 */
const KINDS = [
  {
    id: "corroborate",
    label: "I have seen this too",
    note: "Raises how urgently it is treated. Once per person.",
    tone: "ok",
  },
  {
    id: "detail",
    label: "Add something",
    note: "Anything the photograph does not show.",
    tone: "info",
  },
  {
    id: "resolved_already",
    label: "This is already fixed",
    note: "Lowers priority so a crew is not sent to finished work.",
    tone: "pending",
  },
  {
    id: "dispute",
    label: "This is not accurate",
    note: "Flags it for a ward officer to read.",
    tone: "warn",
  },
];

const ago = (iso) => {
  const mins = Math.round((Date.now() - new Date(iso)) / 60000);
  if (mins < 60) return `${Math.max(1, mins)}m ago`;
  if (mins < 1440) return `${Math.round(mins / 60)}h ago`;
  return `${Math.round(mins / 1440)}d ago`;
};

export default function PublicReport() {
  const { ref } = useParams();
  const { session } = useAuth();

  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [kind, setKind] = useState("corroborate");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  const load = () => api.publicReport(ref).then(setData).catch((e) => setError(e.message));
  useEffect(() => { load(); }, [ref]);

  async function post(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.addComment(ref, kind, body.trim() || KINDS.find((k) => k.id === kind).label);
      setBody("");
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (error && !data) return <ErrorNote onRetry={load}>{error}</ErrorNote>;
  if (!data) return <SkeletonRows rows={4} height={110} />;

  const r = data.report;
  const chosen = KINDS.find((k) => k.id === kind);

  return (
    <div className="container" style={{ padding: "var(--s-7) var(--s-5) var(--s-9)", maxWidth: 780 }}>
      <Link to="/reports" className="btn--quiet">← All reports</Link>

      <div className="row row--wrap" style={{ gap: "var(--s-2)", marginTop: "var(--s-5)" }}>
        <span className="ref">{r.ref}</span>
        <SeverityBadge severity={r.severity} />
        <StatusBadge status={r.status} />
        {r.overdue && <Badge tone="danger">past deadline</Badge>}
      </div>

      <h1 className="display d-md" style={{ marginTop: "var(--s-3)" }}>{r.category}</h1>

      <div style={{ marginTop: "var(--s-3)" }}>
        <VerificationBadge verification={r.verification} disputed={r.disputed} showNote />
      </div>
      <p className="prose" style={{ marginTop: "var(--s-2)" }}>
        {r.ward_name || r.ward_code} · handled by {r.department}
        {r.agency && ` · maintained under contract by ${r.agency}`}
      </p>

      {data.image_url && (
        <img
          src={data.image_url}
          alt={r.category}
          style={{
            width: "100%", maxHeight: 420, objectFit: "cover", marginTop: "var(--s-5)",
            borderRadius: "var(--r-lg)", border: "1px solid var(--line)",
          }}
        />
      )}

      <div className="statbar" style={{ marginTop: "var(--s-5)" }}>
        <div className="statbar__cell">
          <div className="statbar__label">Confirmed by</div>
          <div className="statbar__value">{r.corroboration_count}</div>
          <div className="statbar__note">neighbours</div>
        </div>
        <div className="statbar__cell">
          <div className="statbar__label">Status</div>
          <div className="statbar__value" style={{ fontSize: "var(--t-md)" }}>
            {r.assigned ? "Officer assigned" : "Not yet assigned"}
          </div>
        </div>
        {r.rework_count > 0 && (
          <div className="statbar__cell" data-alert="true">
            <div className="statbar__label">Sent back</div>
            <div className="statbar__value">{r.rework_count}</div>
            <div className="statbar__note">by the resident</div>
          </div>
        )}
      </div>

      <Panel title={`${data.comments.length} comments`} style={{ marginTop: "var(--s-6)" }} list>
        {data.comments.length === 0 && (
          <p className="prose" style={{ fontSize: "var(--t-sm)", padding: "var(--s-4) 0" }}>
            Nobody has commented yet. If you walk past this, saying so raises how urgently it
            is treated.
          </p>
        )}

        {data.comments.map((c) => (
          <div key={c.id} className="listrow" style={{ alignItems: "flex-start" }}>
            <span className="avatar" style={{ flex: "none" }}>
              {c.avatar_url ? (
                <img src={c.avatar_url} alt="" className="avatar avatar--photo" />
              ) : (
                c.author.slice(0, 1)
              )}
            </span>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="row row--wrap" style={{ gap: "var(--s-2)" }}>
                <strong style={{ fontSize: "var(--t-sm)" }}>{c.author}</strong>
                {c.is_official && <Badge tone="accent">official</Badge>}
                <Badge tone={KINDS.find((k) => k.id === c.kind)?.tone || "pending"}>
                  {c.kind.replace(/_/g, " ")}
                </Badge>
                <span className="label">{ago(c.created_at)}</span>
              </div>
              <p className="prose" style={{ fontSize: "var(--t-sm)", marginTop: 4 }}>{c.body}</p>
            </div>
          </div>
        ))}
      </Panel>

      {session ? (
        <form onSubmit={post} className="sheet" style={{ marginTop: "var(--s-5)" }}>
          <Label>Add to this report</Label>

          <div className="row row--wrap" style={{ gap: "var(--s-2)", marginTop: "var(--s-3)" }}>
            {KINDS.map((k) => (
              <button
                key={k.id}
                type="button"
                className="choice"
                aria-pressed={kind === k.id}
                onClick={() => setKind(k.id)}
              >
                {k.label}
              </button>
            ))}
          </div>

          <p className="label" style={{ marginTop: "var(--s-2)" }}>{chosen.note}</p>

          <textarea
            className="input"
            rows={3}
            style={{ marginTop: "var(--s-3)" }}
            placeholder={
              kind === "corroborate"
                ? "Anything to add? Optional."
                : "What should the officer know?"
            }
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />

          {error && <div style={{ marginTop: "var(--s-3)" }}><ErrorNote>{error}</ErrorNote></div>}

          <button className="btn" style={{ marginTop: "var(--s-4)" }} disabled={busy}>
            {busy ? "Posting…" : "Post"}
          </button>
        </form>
      ) : (
        <p className="prose" style={{ marginTop: "var(--s-5)" }}>
          <Link to="/signin" className="link">Sign in</Link> to confirm you have seen this, or add
          what the photograph does not show.
        </p>
      )}
    </div>
  );
}
