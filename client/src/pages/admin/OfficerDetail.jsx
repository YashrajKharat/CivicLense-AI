import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { api } from "../../lib/api.js";
import { useAuth } from "../../lib/auth.jsx";
import {
  Panel, StatBar, Badge, Label, ErrorNote, SkeletonRows, Meter,
  SeverityBadge, StatusBadge, Empty,
} from "../../components/Primitives.jsx";
import { TrendChart } from "../../components/Charts.jsx";
import IssueMap from "../../components/IssueMap.jsx";
import { Icon } from "../../components/Icons.jsx";
import { when, ago } from "../../lib/format.js";

export default function OfficerDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = () => api.officer(id).then(setData).catch((e) => setError(e.message));
  useEffect(() => { load(); }, [id]);

  async function toggleActive() {
    setBusy(true);
    setError(null);
    try {
      await api.setOfficerActive(id, !data.officer.active);
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (error && !data) return <ErrorNote onRetry={load}>{error}</ErrorNote>;
  if (!data) return <SkeletonRows rows={4} height={90} />;

  const { officer, stats, workload, reviews, ratings, weekly } = data;

  // Only the tier directly above an officer may suspend them, and only inside
  // their own department. The database enforces this too.
  const canSuspend =
    profile?.role === "global_admin" ||
    (profile?.role === "super_admin" && profile?.department_id === officer.department_id);

  return (
    <div className="fade-in">
      <button className="btn--quiet" onClick={() => navigate("/admin/officers")}>
        ← All officers
      </button>

      <header className="page-head" style={{ marginTop: "var(--s-3)" }}>
        <div className="page-head__text">
          <div className="row row--wrap" style={{ gap: "var(--s-2)", marginBottom: 6 }}>
            <Badge tone={officer.active ? "ok" : "danger"}>
              {officer.active ? "active" : "suspended"}
            </Badge>
            <span className="mono label">{officer.employee_id}</span>
          </div>
          <h1 className="display d-md">{officer.name}</h1>
          <p className="prose">
            {officer.designation || "Officer"} · {officer.department}
            {officer.approved_at && ` · approved by ${officer.approved_by} ${ago(officer.approved_at)}`}
          </p>

          <div className="row row--wrap" style={{ gap: "var(--s-4)", marginTop: "var(--s-3)" }}>
            <a href={`mailto:${officer.email}`} className="link row" style={{ gap: 6, fontSize: "var(--t-sm)" }}>
              <Icon.file width={14} height={14} /> {officer.email}
            </a>
            {officer.work_phone && (
              <a href={`tel:${officer.work_phone}`} className="link row" style={{ gap: 6, fontSize: "var(--t-sm)" }}>
                <Icon.bell width={14} height={14} /> {officer.work_phone}
              </a>
            )}
          </div>
        </div>

        {canSuspend && (
          <button
            className={officer.active ? "btn btn--secondary" : "btn"}
            disabled={busy}
            onClick={toggleActive}
          >
            {busy ? "Working…" : officer.active ? "Suspend account" : "Reinstate"}
          </button>
        )}
      </header>

      {error && <div style={{ marginBottom: "var(--s-4)" }}><ErrorNote>{error}</ErrorNote></div>}

      {!officer.active && (
        <div
          className="row"
          style={{
            gap: "var(--s-3)", padding: "var(--s-4)", marginBottom: "var(--s-5)",
            background: "var(--danger-bg)", border: "1px solid var(--danger-line)",
            borderRadius: "var(--r)", color: "var(--danger)",
          }}
        >
          <Icon.alert width={16} height={16} />
          <span style={{ fontSize: "var(--t-sm)" }}>
            Suspended. They keep their existing cases but no new work is routed to them, and they
            cannot be selected when assigning.
          </span>
        </div>
      )}

      <StatBar
        items={[
          { label: "Open cases", value: stats.open_cases, icon: Icon.clipboard, alert: stats.overdue > 0 },
          { label: "Closed", value: stats.resolved, icon: Icon.check },
          { label: "Average days", value: stats.avg_days ?? "—", icon: Icon.clock },
          { label: "On time", value: stats.sla != null ? `${stats.sla}%` : "—", icon: Icon.trend },
        ]}
      />

      <div className="split" style={{ marginTop: "var(--s-4)" }}>
        <div className="stack">
          <Panel
            title="Current caseload"
            action={<Label>{workload.length} open · most urgent first</Label>}
            flush
          >
            {workload.length === 0 ? (
              <div style={{ padding: "var(--s-6)" }}>
                <p className="prose" style={{ fontSize: "var(--t-sm)" }}>
                  Nothing open. Everything assigned to them has been closed or sent back.
                </p>
              </div>
            ) : (
              <div className="scroll-x">
                <table className="table table--stack">
                  <thead>
                    <tr>
                      <th>Ref</th><th>Issue</th><th>Severity</th><th>Status</th><th>Deadline</th>
                    </tr>
                  </thead>
                  <tbody>
                    {workload.map((c) => (
                      <tr key={c.ref}>
                        <td data-label="Ref" className="mono">
                          <Link to={`/admin/complaints/${c.ref}`} className="link">{c.ref}</Link>
                        </td>
                        <td data-label="Issue">
                          <div style={{ fontWeight: 600 }}>{c.category}</div>
                          <div className="label truncate">{c.address || `Ward ${c.ward_code}`}</div>
                        </td>
                        <td data-label="Severity"><SeverityBadge severity={c.severity} /></td>
                        <td data-label="Status"><StatusBadge status={c.status} /></td>
                        <td data-label="Deadline">
                          <span style={{ color: c.overdue ? "var(--danger)" : "inherit" }}>
                            {c.overdue ? "overdue" : ago(c.sla_deadline)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          {/* Residents rate the work, not just whether it closed on time. */}
          <Panel
            title="What residents said"
            action={
              ratings.count > 0 ? (
                <span style={{ color: "var(--warn)" }}>
                  {"★".repeat(Math.round(ratings.overall))} {ratings.overall}
                </span>
              ) : (
                <Label>no reviews yet</Label>
              )
            }
          >
            {ratings.count === 0 ? (
              <p className="prose" style={{ fontSize: "var(--t-sm)" }}>
                No resident has reviewed their work yet. Reviews arrive after a complaint is
                confirmed resolved.
              </p>
            ) : (
              <>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit,minmax(120px,1fr))",
                    gap: "var(--s-4)",
                    marginBottom: "var(--s-5)",
                  }}
                >
                  {[
                    ["Overall", ratings.overall],
                    ["How quickly", ratings.speed],
                    ["How well", ratings.quality],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <Label>{label}</Label>
                      <div className="num" style={{ fontSize: "var(--t-lg)", marginTop: 4 }}>
                        {value ?? "—"}
                        <span className="muted" style={{ fontSize: "var(--t-xs)" }}> /5</span>
                      </div>
                      <div style={{ marginTop: 6 }}>
                        <Meter
                          value={(value ?? 0) * 20}
                          tone={value >= 4 ? "ok" : value >= 3 ? "warn" : "danger"}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                {ratings.would_report_again > 0 && (
                  <p className="prose" style={{ fontSize: "var(--t-sm)", marginBottom: "var(--s-4)" }}>
                    {ratings.would_report_again} resident
                    {ratings.would_report_again === 1 ? "" : "s"} said they would not report
                    another issue after this. That is the number worth watching.
                  </p>
                )}

                <div>
                  {reviews.filter((r) => r.comment).slice(0, 6).map((r, i) => (
                    <div key={i} className="listrow" style={{ alignItems: "flex-start" }}>
                      <span style={{ color: "var(--accent)", flex: "none", fontSize: "var(--t-sm)" }}>
                        {"★".repeat(r.rating)}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ margin: 0, fontSize: "var(--t-sm)" }}>{r.comment}</p>
                        <div className="label" style={{ marginTop: 3 }}>
                          {r.category} · {r.ref} · {ago(r.created_at)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </Panel>

          {weekly.length > 0 && (
            <Panel title="Closed per week">
              <TrendChart
                data={weekly}
                xKey="week"
                series={[{ key: "resolved", label: "Closed" }]}
              />
            </Panel>
          )}
        </div>

        <aside className="stack">
          <Panel title="Record">
            <div>
              <Row k="Email" v={officer.email} />
              {officer.work_phone && <Row k="Work phone" v={officer.work_phone} />}
              <Row k="Department" v={officer.department} />
              <Row k="Designation" v={officer.designation || "—"} />
              <Row k="Staff ID" v={officer.employee_id} />
              <Row k="Approved" v={officer.approved_at ? when(officer.approved_at) : "—"} />
              <Row k="Approved by" v={officer.approved_by || "—"} />
              <Row
                k="Reopened cases"
                v={stats.reopened}
                tone={stats.reopened > 0 ? "danger" : undefined}
              />
              <Row
                k="Past deadline"
                v={stats.overdue}
                tone={stats.overdue > 0 ? "danger" : undefined}
              />
            </div>
            {stats.reopened > 0 && (
              <p className="prose" style={{ fontSize: "var(--t-xs)", marginTop: "var(--s-3)" }}>
                A reopened case means a resident said the work was not actually done. Worth reading
                alongside the closure count.
              </p>
            )}
          </Panel>

          {/* `some(c => c.lat)` checked that *a* row has coordinates, then
              centred on workload[0] — which may be a different row without any.
              Centre on the first one that actually has them. */}
          {workload.some((c) => Number.isFinite(Number(c.lat))) && (
            <Panel title="Where their work is" flush>
              <IssueMap
                center={(() => {
                  const first = workload.find((c) => Number.isFinite(Number(c.lat)));
                  return [Number(first.lat), Number(first.lng)];
                })()}
                complaints={workload.filter((c) => Number.isFinite(Number(c.lat)))}
                height={240}
                showClusters={false}
                onSelect={(c) => navigate(`/admin/complaints/${c.ref}`)}
              />
            </Panel>
          )}
        </aside>
      </div>
    </div>
  );
}

function Row({ k, v, tone }) {
  return (
    <div
      className="row row--between"
      style={{ padding: "8px 0", borderBottom: "1px solid var(--line)" }}
    >
      <span className="label">{k}</span>
      <span
        className="mono"
        style={{ fontSize: "var(--t-sm)", color: tone ? `var(--${tone})` : "var(--text)" }}
      >
        {v}
      </span>
    </div>
  );
}
