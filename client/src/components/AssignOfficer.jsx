import { useEffect, useState } from "react";
import { api } from "../lib/api.js";
import Modal from "./Modal.jsx";
import { Badge, Meter, ErrorNote, Loading, Label } from "./Primitives.jsx";
import { Icon } from "./Icons.jsx";

/**
 * Intelligent AI Officer Assignment & Recommendation Picker.
 *
 * Evaluates candidate officers across:
 * 1. Current Workload (active cases)
 * 2. Previous Completed Works (resolved cases)
 * 3. Citizen Quality Rating (stars)
 * 4. Average Completion Speed (in days)
 * 5. SLA Compliance (% on-time)
 */
export default function AssignOfficer({ complaint, onClose, onDone, onAssign }) {
  const [officers, setOfficers] = useState(null);
  const [recommendation, setRecommendation] = useState(null);
  const [aiAnalysis, setAiAnalysis] = useState(null);
  const [department, setDepartment] = useState(null);
  const [picked, setPicked] = useState(null);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [autoAssigning, setAutoAssigning] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.assignableOfficers(complaint.ref)
      .then((r) => {
        setOfficers(r.officers);
        setDepartment(r.department);
        setRecommendation(r.ai_recommendation);
        setAiAnalysis(r.ai_analysis);
        // Default pick to AI recommended officer or first candidate
        setPicked(r.ai_recommendation?.id ?? r.officers?.[0]?.id ?? null);
      })
      .catch((e) => setError(e.message));
  }, [complaint.ref]);

  async function confirm() {
    if (!picked) return;
    setBusy(true);
    setError(null);
    try {
      if (onAssign) {
        await onAssign(picked);
      } else {
        await api.assignOfficer(complaint.ref, picked);
      }
      onDone(picked);
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }

  async function handleAutoAssign() {
    setAutoAssigning(true);
    setError(null);
    try {
      const res = await api.autoAssignOfficer(complaint.ref);
      onDone(res.assigned_officer?.id || picked);
    } catch (e) {
      setError(e.message);
      setAutoAssigning(false);
    }
  }

  const chosen = officers?.find((o) => o.id === picked);

  const shown = !officers
    ? []
    : officers.filter((o) =>
        `${o.name} ${o.designation || ""} ${o.department || ""}`
          .toLowerCase()
          .includes(search.trim().toLowerCase())
      );

  return (
    <Modal
      title={`Assign ${complaint.category}`}
      subtitle={`${complaint.ref} · ${complaint.address || complaint.ward_code || ""}`}
      onClose={onClose}
      footer={
        <>
          <button
            className="btn"
            onClick={confirm}
            disabled={busy || autoAssigning || !picked}
          >
            {busy
              ? "Assigning…"
              : chosen
              ? `Assign to ${chosen.name.split(" ")[0]}`
              : "Assign Officer"}
          </button>
          <button className="btn btn--secondary" onClick={onClose} disabled={busy || autoAssigning}>
            Cancel
          </button>
        </>
      }
    >
      {error && <div style={{ marginBottom: "var(--s-4)" }}><ErrorNote>{error}</ErrorNote></div>}

      {!officers ? (
        <Loading label="AI analyzing officer performance, workloads & capacity…" />
      ) : officers.length === 0 ? (
        <p className="prose">
          No approved officers found in this department yet. Approve a staff request first, then come back.
        </p>
      ) : (
        <>
          {/* AI Recommended Officer Highlight Card */}
          {recommendation && (
            <div
              style={{
                marginBottom: "var(--s-5)",
                padding: "var(--s-4)",
                background: "linear-gradient(135deg, rgba(235, 94, 40, 0.08) 0%, rgba(255, 255, 255, 0.02) 100%)",
                border: "1px solid rgba(235, 94, 40, 0.35)",
                borderRadius: "var(--r)",
                boxShadow: "0 4px 14px rgba(235, 94, 40, 0.08)",
              }}
            >
              <div className="row row--between" style={{ alignItems: "flex-start", gap: "var(--s-2)" }}>
                <div>
                  <div className="row" style={{ gap: "var(--s-2)", alignItems: "center" }}>
                    <span className="badge badge--accent" style={{ display: "inline-flex", alignItems: "center", gap: 4, fontWeight: 700 }}>
                      <Icon.sparkle width={13} height={13} />
                      AI Top Recommendation
                    </span>
                    <span className="badge badge--ok" style={{ fontWeight: 600 }}>
                      {recommendation.scores?.total ?? 90}% Match Score
                    </span>
                  </div>
                  <h3 style={{ margin: "var(--s-2) 0 2px", fontSize: "var(--t-md)", fontWeight: 700 }}>
                    {recommendation.name}
                  </h3>
                  <div className="label" style={{ opacity: 0.85 }}>
                    {recommendation.designation || recommendation.department}
                  </div>
                </div>

                <button
                  type="button"
                  className="btn btn--sm"
                  onClick={handleAutoAssign}
                  disabled={autoAssigning || busy}
                  style={{ flexShrink: 0 }}
                  title="Automatically assign the top AI match directly"
                >
                  <Icon.sparkle width={13} height={13} />
                  {autoAssigning ? "Auto-Assigning…" : "Auto-Assign with AI"}
                </button>
              </div>

              {/* AI Rationale */}
              {aiAnalysis && (
                <p className="prose" style={{ fontSize: "var(--t-xs)", margin: "var(--s-3) 0", lineHeight: 1.5, opacity: 0.9 }}>
                  {aiAnalysis}
                </p>
              )}

              {/* Metrics Grid */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))",
                  gap: "var(--s-2)",
                  marginTop: "var(--s-3)",
                  paddingTop: "var(--s-3)",
                  borderTop: "1px solid rgba(235, 94, 40, 0.15)",
                }}
              >
                <div style={{ background: "var(--surface-2)", padding: "6px 10px", borderRadius: "var(--r)", textAlign: "center" }}>
                  <div className="label" style={{ fontSize: 11 }}>Workload</div>
                  <strong style={{ fontSize: 13, color: recommendation.open_cases <= 2 ? "var(--ok)" : "var(--warn)" }}>
                    {recommendation.open_cases} active
                  </strong>
                </div>

                <div style={{ background: "var(--surface-2)", padding: "6px 10px", borderRadius: "var(--r)", textAlign: "center" }}>
                  <div className="label" style={{ fontSize: 11 }}>Completed</div>
                  <strong style={{ fontSize: 13 }}>{recommendation.resolved_cases} solved</strong>
                </div>

                <div style={{ background: "var(--surface-2)", padding: "6px 10px", borderRadius: "var(--r)", textAlign: "center" }}>
                  <div className="label" style={{ fontSize: 11 }}>Rating</div>
                  <strong style={{ fontSize: 13, color: "var(--warn)" }}>
                    {recommendation.avg_rating > 0 ? `${recommendation.avg_rating}★` : "New (5★)"}
                  </strong>
                </div>

                <div style={{ background: "var(--surface-2)", padding: "6px 10px", borderRadius: "var(--r)", textAlign: "center" }}>
                  <div className="label" style={{ fontSize: 11 }}>Avg Speed</div>
                  <strong style={{ fontSize: 13 }}>
                    {recommendation.avg_days != null ? `${recommendation.avg_days} days` : "—"}
                  </strong>
                </div>

                <div style={{ background: "var(--surface-2)", padding: "6px 10px", borderRadius: "var(--r)", textAlign: "center" }}>
                  <div className="label" style={{ fontSize: 11 }}>SLA On-Time</div>
                  <strong style={{ fontSize: 13, color: "var(--ok)" }}>
                    {recommendation.sla_compliance != null ? `${recommendation.sla_compliance}%` : "100%"}
                  </strong>
                </div>
              </div>
            </div>
          )}

          {complaint.rework_count > 0 && (
            <div
              style={{
                padding: "var(--s-3) var(--s-4)", marginBottom: "var(--s-4)",
                background: "var(--warn-bg)", border: "1px solid var(--warn-line)",
                borderRadius: "var(--r)",
              }}
            >
              <strong style={{ fontSize: "var(--t-sm)" }}>
                Returned {complaint.rework_count} time{complaint.rework_count === 1 ? "" : "s"}
              </strong>
              <p className="prose" style={{ fontSize: "var(--t-xs)", marginTop: 3 }}>
                The resident rejected earlier work. The AI prioritizes officers with higher customer ratings and proven quality.
              </p>
            </div>
          )}

          {/* Search bar for larger departments */}
          {officers.length > 5 && (
            <input
              className="input"
              placeholder="Search officers by name or designation…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ marginBottom: "var(--s-4)" }}
            />
          )}

          <div className="row row--between" style={{ marginBottom: "var(--s-2)" }}>
            <Label>
              {search ? `${shown.length} matching` : `All ${shown.length} candidate officers (Ranked by AI)`}
            </Label>
            {department && <span className="label">{department}</span>}
          </div>

          {shown.length === 0 && (
            <p className="prose" style={{ fontSize: "var(--t-sm)", marginTop: "var(--s-3)" }}>
              Nobody matches “{search}”.
            </p>
          )}

          <div style={{ marginTop: "var(--s-2)", display: "flex", flexDirection: "column", gap: "var(--s-2)" }}>
            {shown.map((o) => (
              <label
                key={o.id}
                className="pick"
                data-selected={picked === o.id}
                style={{
                  padding: "var(--s-3) var(--s-4)",
                  borderRadius: "var(--r)",
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
              >
                <input
                  type="radio"
                  name="officer"
                  checked={picked === o.id}
                  onChange={() => setPicked(o.id)}
                />

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="row row--between" style={{ gap: "var(--s-3)" }}>
                    <div className="row" style={{ gap: "var(--s-2)", alignItems: "center" }}>
                      <strong className="truncate">{o.name}</strong>
                      {o.is_recommended && (
                        <span className="badge badge--accent" style={{ fontSize: 11 }}>
                          ★ AI Best Pick
                        </span>
                      )}
                    </div>

                    <span className="badge" style={{ fontWeight: 600, background: "var(--surface-2)" }}>
                      {o.scores?.total ?? 80}% Match
                    </span>
                  </div>

                  <div className="label truncate" style={{ marginTop: 2 }}>
                    {o.designation || o.department}
                    {o.email && ` · ${o.email}`}
                  </div>

                  {/* Strengths Pills */}
                  {o.strengths && o.strengths.length > 0 && (
                    <div className="row row--wrap" style={{ gap: 4, marginTop: 6 }}>
                      {o.strengths.map((str) => (
                        <span
                          key={str}
                          style={{
                            fontSize: 10,
                            padding: "2px 6px",
                            borderRadius: 4,
                            background: "var(--surface-2)",
                            color: "var(--on-surface-muted)",
                            border: "1px solid var(--line)",
                          }}
                        >
                          {str}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Detailed Metric Line */}
                  <div
                    className="row row--between row--wrap"
                    style={{ gap: "var(--s-3)", marginTop: "var(--s-3)", fontSize: "var(--t-xs)", color: "var(--on-surface-muted)" }}
                  >
                    <span className="row" style={{ gap: 6, alignItems: "center" }}>
                      <span>Load:</span>
                      <span style={{ width: 60 }}>
                        <Meter
                          value={Math.min(100, (o.open_cases || 0) * 15)}
                          tone={o.open_cases > 6 ? "danger" : o.open_cases > 3 ? "warn" : "ok"}
                        />
                      </span>
                      <strong>{o.open_cases || 0} open</strong>
                    </span>

                    <span>🏆 {o.resolved_cases || 0} solved</span>
                    <span>⭐ {o.avg_rating > 0 ? `${o.avg_rating}★` : "—"}</span>
                    <span>⏱️ {o.avg_days != null ? `${o.avg_days}d avg` : "—"}</span>
                    <span>🎯 {o.sla_compliance != null ? `${o.sla_compliance}% SLA` : "—"}</span>
                  </div>
                </div>
              </label>
            ))}
          </div>

          <p className="prose" style={{ fontSize: "var(--t-xs)", marginTop: "var(--s-4)", opacity: 0.8 }}>
            AI evaluates real-time workload, past resolution track record, citizen feedback ratings, average completion speed, and SLA compliance to optimize turnaround.
          </p>
        </>
      )}
    </Modal>
  );
}
