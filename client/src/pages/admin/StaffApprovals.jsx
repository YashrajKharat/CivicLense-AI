import { useEffect, useState, useCallback } from "react";
import { api } from "../../lib/api.js";
import { useAuth } from "../../lib/auth.jsx";
import {
  Panel, Badge, ErrorNote, Empty, Label, Tile, PageHead, Segment, SkeletonRows,
} from "../../components/Primitives.jsx";
import { Icon } from "../../components/Icons.jsx";
import { when } from "../../lib/format.js";

const TABS = [
  { id: "pending", label: "Awaiting you" },
  { id: "approved", label: "Approved" },
  { id: "rejected", label: "Rejected" },
];

export default function StaffApprovals() {
  const { profile } = useAuth();
  const [tab, setTab] = useState("pending");
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [notes, setNotes] = useState({});
  const [busy, setBusy] = useState(null);

  const isGlobal = profile?.role === "global_admin";

  const load = useCallback(() => {
    setData(null);
    api.staffApplications(tab).then(setData).catch((e) => setError(e.message));
  }, [tab]);

  useEffect(() => { load(); }, [load]);

  async function decide(id, decision) {
    const note = notes[id]?.trim();
    if (decision === "reject" && !note) {
      setError("Give a reason when rejecting — the applicant is shown what it says.");
      return;
    }
    setBusy(id);
    setError(null);
    try {
      await api.decideApplication(id, decision, note);
      load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="fade-in">
      <PageHead
        title="Staff access"
        sub={
          isGlobal
            ? "You appoint department super admins. They in turn appoint officers in their own department."
            : `You appoint officers in ${profile?.department_name}. Super admin requests are decided by a global super admin.`
        }
        actions={
          <Segment
            value={tab}
            onChange={setTab}
            options={TABS.map((t) => ({ ...t, count: data?.counts?.[t.id] }))}
          />
        }
      />

      {/* The chain, stated once so nobody has to infer it from an error. */}
      <div
        className="row row--wrap"
        style={{
          gap: "var(--s-3)", padding: "var(--s-4)", marginBottom: "var(--s-5)",
          background: "var(--surface)", border: "1px solid var(--line)",
          borderRadius: "var(--r)",
        }}
      >
        <Icon.shield width={16} height={16} style={{ color: "var(--accent)" }} />
        <span style={{ fontSize: "var(--t-sm)" }}>
          <strong>Global super admin</strong>
          <span className="muted"> appoints </span>
          <strong>department super admins</strong>
          <span className="muted"> who appoint </span>
          <strong>officers</strong>
          <span className="muted">. Each tier appoints only the one below it.</span>
        </span>
      </div>

      {error && <div style={{ marginBottom: "var(--s-4)" }}><ErrorNote onRetry={load}>{error}</ErrorNote></div>}

      {!data ? (
        <SkeletonRows rows={3} height={150} />
      ) : data.applications.length === 0 ? (
        <Empty
          icon={Icon.user}
          title={tab === "pending" ? "Nothing waiting on you" : `Nothing ${tab}`}
          body={
            tab === "pending"
              ? isGlobal
                ? "Super admin requests appear here. Officer requests go to their own department's super admin, not to you."
                : "Officer requests for your department appear here as they are submitted."
              : "Decisions you have made are kept here as a record."
          }
        />
      ) : (
        <div className="stack">
          {data.applications.map((a) => (
            <Panel
              key={a.id}
              title={a.full_name}
              action={
                <div className="row" style={{ gap: "var(--s-2)" }}>
                  <Badge tone="pending">
                    {a.requested_role === "super_admin" ? "super admin" : "officer"}
                  </Badge>
                  {a.status !== "pending" && (
                    <Badge tone={a.status === "approved" ? "ok" : "danger"}>{a.status}</Badge>
                  )}
                </div>
              }
            >
              <div className="row row--top" style={{ gap: "var(--s-4)" }}>
                <Tile icon={Icon.user} tone={a.status === "pending" ? "accent" : ""} size="lg" />

                <div style={{ flex: 1, minWidth: 0 }}>
                  <a href={`mailto:${a.email}`} className="link mono" style={{ fontSize: "var(--t-sm)" }}>
                    {a.email}
                  </a>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))",
                      gap: "var(--s-4)",
                      marginTop: "var(--s-4)",
                    }}
                  >
                    {[
                      ["Department", a.department || "—"],
                      ["Staff ID", a.employee_id],
                      ["Designation", a.designation || "—"],
                      ["Phone", a.phone || "—"],
                      ["Requested", when(a.created_at)],
                    ].map(([k, v]) => (
                      <div key={k}>
                        <Label>{k}</Label>
                        <div style={{ fontSize: "var(--t-sm)", marginTop: 2 }}>{v}</div>
                      </div>
                    ))}
                  </div>

                  {a.justification && (
                    <p className="prose" style={{ fontSize: "var(--t-sm)", marginTop: "var(--s-4)" }}>
                      {a.justification}
                    </p>
                  )}
                </div>
              </div>

              {a.status === "pending" ? (
                <div style={{ marginTop: "var(--s-5)", paddingTop: "var(--s-4)", borderTop: "1px solid var(--line)" }}>
                  <input
                    className="input"
                    placeholder="Note — required when rejecting, shown to the applicant"
                    value={notes[a.id] || ""}
                    onChange={(e) => setNotes((n) => ({ ...n, [a.id]: e.target.value }))}
                  />
                  <div className="row" style={{ marginTop: "var(--s-3)", gap: "var(--s-3)" }}>
                    <button className="btn" disabled={busy === a.id} onClick={() => decide(a.id, "approve")}>
                      {busy === a.id ? "Working…" : "Approve"}
                    </button>
                    <button
                      className="btn btn--secondary"
                      disabled={busy === a.id}
                      onClick={() => decide(a.id, "reject")}
                    >
                      Reject
                    </button>
                  </div>
                  <p className="label" style={{ marginTop: "var(--s-3)" }}>
                    Approving grants the role immediately and creates their officer record, against
                    your name in the audit log. A rejected applicant keeps an ordinary resident account.
                  </p>
                </div>
              ) : (
                a.decision_note && (
                  <p className="prose" style={{ fontSize: "var(--t-sm)", marginTop: "var(--s-4)" }}>
                    <strong>{a.decided_by || "Decision"}:</strong> {a.decision_note}
                  </p>
                )
              )}
            </Panel>
          ))}
        </div>
      )}
    </div>
  );
}
