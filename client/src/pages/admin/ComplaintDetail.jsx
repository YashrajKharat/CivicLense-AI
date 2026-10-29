import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "../../lib/api.js";
import {
  Panel, Label, KV, ErrorNote, Badge, SeverityBadge, StatusBadge,
  SkeletonRows, Loading, Meter, Thumb,
} from "../../components/Primitives.jsx";
import ResponsibilitySpine, { buildChain } from "../../components/ResponsibilitySpine.jsx";
import IssueMap from "../../components/IssueMap.jsx";
import ErrorBoundary from "../../components/ErrorBoundary.jsx";
import AssignOfficer from "../../components/AssignOfficer.jsx";
import Modal from "../../components/Modal.jsx";
import EvidenceTimeline, { buildEvidenceTimeline } from "../../components/EvidenceTimeline.jsx";
import { Icon } from "../../components/Icons.jsx";
import { when } from "../../lib/format.js";

export default function ComplaintDetail() {
  const { ref } = useParams();
  const navigate = useNavigate();
  const [c, setC] = useState(null);
  const [error, setError] = useState(null);
  const [assigning, setAssigning] = useState(false);
  const [autoAssigning, setAutoAssigning] = useState(false);
  const [rejecting, setRejecting] = useState(false);

  const load = () => api.complaint(ref).then(setC).catch((e) => setError(e.message));
  useEffect(() => { load(); }, [ref]);

  async function handleAutoAssign() {
    setAutoAssigning(true);
    setError(null);
    try {
      await api.autoAssignOfficer(ref);
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setAutoAssigning(false);
    }
  }

  if (error) return <ErrorNote onRetry={load}>{error}</ErrorNote>;
  if (!c) return <SkeletonRows rows={4} height={90} />;

  return (
    <div className="fade-in">
      <button className="btn--quiet" onClick={() => navigate("/admin/complaints")}>
        ← All complaints
      </button>

      <header className="page-head" style={{ marginTop: "var(--s-3)" }}>
        <div className="page-head__text">
          <div className="row row--wrap" style={{ gap: "var(--s-2)", marginBottom: 6 }}>
            <span className="mono label">{c.ref}</span>
            <SeverityBadge severity={c.severity} />
            <StatusBadge status={c.status} />
            {c.cluster_ref && <Badge tone="warn">in group {c.cluster_ref}</Badge>}
          </div>
          <h1 className="display d-md">{c.category}</h1>
          <p className="prose">{c.address || `Ward ${c.ward_code}`} · {c.department_name}</p>
        </div>

        <div className="row" style={{ gap: "var(--s-2)" }}>
          {/* Dismissing a report that is not a civic matter. A reason is
              required and the resident is told — silently dropping it would
              leave somebody checking a page that never changes, learning
              nothing, and eventually not reporting again. */}
          {!["resolved", "rejected", "withdrawn"].includes(c.status) && (
            <button className="btn btn--secondary" onClick={() => setRejecting(true)}>
              Not a civic issue
            </button>
          )}

          {!c.assigned_officer && !["resolved", "rejected", "withdrawn"].includes(c.status) && (
            <button
              className="btn btn--secondary"
              onClick={handleAutoAssign}
              disabled={autoAssigning}
              title="AI evaluates candidate officers' workload, ratings, speed and SLA to automatically assign the best match"
            >
              <Icon.sparkle width={15} height={15} />
              {autoAssigning ? "AI Assigning…" : "AI Auto-Assign"}
            </button>
          )}

          <button className="btn" onClick={() => setAssigning(true)}>
            <Icon.user width={15} height={15} />
            {c.assigned_officer ? "Reassign officer" : "Assign officer"}
          </button>
        </div>
      </header>

      <div className="split">
        <div className="stack">
          {/* The evidence, at a size where you can actually judge it. */}
          <Panel
            title="Evidence"
            action={
              <Label>
                {c.rework_count > 0
                  ? `${c.rework_count + 1} attempts`
                  : c.after_image_url ? "before and after" : "awaiting proof of work"}
              </Label>
            }
          >
            <EvidenceTimeline entries={buildEvidenceTimeline(c)} />
          </Panel>

          <Panel title="Side by side" style={{ display: c.after_image_url ? undefined : "none" }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: c.after_image_url ? "1fr 1fr" : "1fr",
                gap: "var(--s-4)",
              }}
            >
              <figure style={{ margin: 0 }}>
                {c.before_image_url ? (
                  <a href={c.before_image_url} target="_blank" rel="noreferrer">
                    <img
                      src={c.before_image_url}
                      alt="What the resident reported"
                      style={{
                        width: "100%", maxHeight: 420, objectFit: "cover",
                        borderRadius: "var(--r)", border: "1px solid var(--line)",
                      }}
                    />
                  </a>
                ) : (
                  <div
                    className="card card--flat"
                    style={{ aspectRatio: "4/3", display: "grid", placeItems: "center", color: "var(--muted)" }}
                  >
                    No photo attached
                  </div>
                )}
                <figcaption className="row row--between" style={{ marginTop: 6 }}>
                  <Label>Reported</Label>
                  <span className="label">{c.citizen_name || "Anonymous"} · {when(c.created_at)}</span>
                </figcaption>
              </figure>

              {c.after_image_url && (
                <figure style={{ margin: 0 }}>
                  <a href={c.after_image_url} target="_blank" rel="noreferrer">
                    <img
                      src={c.after_image_url}
                      alt="After the work"
                      style={{
                        width: "100%", maxHeight: 420, objectFit: "cover",
                        borderRadius: "var(--r)", border: "1px solid var(--line)",
                      }}
                    />
                  </a>
                  <figcaption className="row row--between" style={{ marginTop: 6 }}>
                    <Label>After the work</Label>
                    <span className="label">{c.officer || "Officer"}</span>
                  </figcaption>
                </figure>
              )}
            </div>

            {c.proof && (
              <div
                style={{
                  marginTop: "var(--s-4)", paddingTop: "var(--s-4)",
                  borderTop: "1px solid var(--line)",
                }}
              >
                <Label>Automated comparison</Label>
                <p className="prose" style={{ fontSize: "var(--t-sm)", marginTop: 6 }}>
                  {c.proof.ai_verdict_summary}
                </p>
                <div className="row row--wrap" style={{ gap: "var(--s-4)", marginTop: "var(--s-3)" }}>
                  <Badge tone="ok">scene match {c.proof.ai_scene_match}%</Badge>
                  <Badge tone={c.proof.ai_change_detected ? "ok" : "warn"}>
                    change {c.proof.ai_change_detected ? "detected" : "not detected"}
                  </Badge>
                </div>
                <p className="label" style={{ marginTop: "var(--s-3)" }}>
                  Assistive only. The resident's confirmation is what closes this.
                </p>
              </div>
            )}
          </Panel>

          {c.description_original && (
            <Panel title="What the resident wrote">
              <p style={{ margin: 0 }}>{c.description_original}</p>
              {c.description_translated && c.description_lang !== "en" && (
                <>
                  <hr className="rule" style={{ margin: "var(--s-4) 0" }} />
                  <Label>Translation</Label>
                  <p style={{ margin: "6px 0 0" }}>{c.description_translated}</p>
                </>
              )}
            </Panel>
          )}

          {c.review && (
            <Panel title="Resident's review" action={<span style={{ color: "var(--warn)" }}>{"★".repeat(c.review.rating)}</span>}>
              {c.review.comment && <p className="prose">{c.review.comment}</p>}
              <div className="row row--wrap" style={{ gap: "var(--s-4)", marginTop: "var(--s-3)" }}>
                {c.review.speed_rating && <Badge tone="pending">speed {c.review.speed_rating}/5</Badge>}
                {c.review.quality_rating && <Badge tone="pending">quality {c.review.quality_rating}/5</Badge>}
                {c.review.would_report_again === false && (
                  <Badge tone="danger">would not report again</Badge>
                )}
              </div>
            </Panel>
          )}

          <Panel title="Audit trail" list>
            <ol className="spine" style={{ padding: "var(--s-4) 0 var(--s-4) 26px" }}>
              {c.audit.map((a, i) => (
                <li key={a.id} className="spine__node" data-key={i === c.audit.length - 1}>
                  <div className="label">{when(a.at)}</div>
                  <div style={{ fontSize: "var(--t-sm)", marginTop: 2 }}>{a.description}</div>
                  <div className="spine__note">{a.actor_name || "System"}</div>
                </li>
              ))}
            </ol>
            <p className="label" style={{ padding: "0 0 var(--s-4)" }}>
              Append-only. No role can edit or delete these entries.
            </p>
          </Panel>
        </div>

        <aside className="stack">
          {/* The reporter's address, for the people actually handling this
              complaint. Deliberately absent from group and hotspot pages,
              where several residents' reports are aggregated and a name would
              leak by association. */}
          <Panel title="Who reported this">
            <div className="row" style={{ gap: "var(--s-3)" }}>
              <span className="tile"><Icon.user /></span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600 }}>{c.citizen_name || "Anonymous"}</div>
                {c.citizen_email && (
                  <a href={`mailto:${c.citizen_email}?subject=${encodeURIComponent(`Your report ${c.ref}`)}`}
                     className="link mono truncate"
                     style={{ fontSize: "var(--t-xs)", display: "block" }}>
                    {c.citizen_email}
                  </a>
                )}
                {c.citizen_phone && (
                  <a href={`tel:${c.citizen_phone}`} className="label mono">{c.citizen_phone}</a>
                )}
              </div>
            </div>
            <p className="label" style={{ marginTop: "var(--s-3)" }}>
              Contact them only about this report. Their address is never shown to other residents.
            </p>
          </Panel>

          <Panel title="Analysis">
            {c.flagged_not_civic && (
              <div
                style={{
                  padding: "var(--s-3) var(--s-4)", marginBottom: "var(--s-4)",
                  background: "var(--warn-bg)", border: "1px solid var(--warn-line)",
                  borderRadius: "var(--r)",
                }}
              >
                <strong style={{ fontSize: "var(--t-sm)" }}>Flagged as possibly not a civic issue</strong>
                <p className="prose" style={{ fontSize: "var(--t-xs)", marginTop: 4 }}>
                  {c.triage_note || "The classifier could not identify a reportable problem."} Read it
                  before assigning anyone.
                </p>
              </div>
            )}

            {/* A correction is worth surfacing: the category came from the
                person who was there, not from the photograph. */}
            {c.category_corrected && (
              <div
                style={{
                  padding: "var(--s-3) var(--s-4)", marginBottom: "var(--s-4)",
                  background: "var(--accent-50)", border: "1px solid var(--accent-100)",
                  borderRadius: "var(--r)",
                }}
              >
                <strong style={{ fontSize: "var(--t-sm)" }}>Corrected by the resident</strong>
                <p className="prose" style={{ fontSize: "var(--t-xs)", marginTop: 3 }}>
                  Classified as <strong>{c.ai_category_name}</strong>, changed to{" "}
                  <strong>{c.category}</strong> by the person who reported it. The description below
                  still describes the original guess.
                </p>
              </div>
            )}

            <p className="prose" style={{ fontSize: "var(--t-sm)" }}>
              {c.ai_description || c.ai_summary}
            </p>

            {Array.isArray(c.ai_observations) && c.ai_observations.length > 0 && (
              <ul className="prose" style={{ fontSize: "var(--t-sm)", marginTop: "var(--s-3)", paddingLeft: 18 }}>
                {c.ai_observations.map((o, i) => <li key={i}>{String(o)}</li>)}
              </ul>
            )}

            {c.ai_recommended_action && (
              <p className="prose" style={{ fontSize: "var(--t-sm)", marginTop: "var(--s-3)" }}>
                <strong>Suggested:</strong> {c.ai_recommended_action}
              </p>
            )}
            <div style={{ marginTop: "var(--s-4)" }}>
              <KV k="Confidence" v={`${c.ai_confidence}%`} />
              <KV k="Severity score" v={`${c.severity_score}/100`} />
              <KV k="Authenticity" v={c.authenticity_label} />
              <KV k="Duplicate risk" v={c.duplicate_risk} />
              <KV k="SLA" v={c.sla_label} />
            </div>
          </Panel>

          <Panel title="Who is answerable">
            <ResponsibilitySpine chain={buildChain(c.responsibility)} />
            {c.responsibility?.owner_name && (
              <p className="label" style={{ marginTop: "var(--s-3)" }}>
                Contact the licence holder before any enforcement action.
              </p>
            )}
          </Panel>

          <Panel title="Officer" action={!c.officer && <Badge tone="warn">Unassigned</Badge>}>
            {c.officer ? (
              <div>
                <div className="row" style={{ gap: "var(--s-3)" }}>
                  <span className="tile tile--accent"><Icon.user /></span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600 }}>{c.officer}</div>
                    {c.officer_email && (
                      <a href={`mailto:${c.officer_email}?subject=${encodeURIComponent(c.ref)}`}
                         className="link mono truncate"
                         style={{ fontSize: "var(--t-xs)", display: "block" }}>
                        {c.officer_email}
                      </a>
                    )}
                    <div className="label">{c.department_name}</div>
                  </div>
                </div>

                <div className="row" style={{ gap: "var(--s-2)", marginTop: "var(--s-3)" }}>
                  <button className="btn btn--secondary btn--sm" onClick={() => setAssigning(true)}>
                    Reassign with AI
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <p className="prose" style={{ fontSize: "var(--t-sm)", marginBottom: "var(--s-3)" }}>
                  Nobody is assigned to this report yet.
                </p>

                <div className="stack" style={{ gap: "var(--s-2)" }}>
                  <button
                    className="btn btn--block"
                    onClick={handleAutoAssign}
                    disabled={autoAssigning}
                  >
                    <Icon.sparkle width={14} height={14} />
                    {autoAssigning ? "AI Assigning…" : "Auto-Assign with AI"}
                  </button>

                  <button className="btn btn--secondary btn--block" onClick={() => setAssigning(true)}>
                    Compare all candidate officers
                  </button>
                </div>
              </div>
            )}
          </Panel>

          <Panel title="Location" flush>
            {Number.isFinite(Number(c.lat)) && Number.isFinite(Number(c.lng)) && (
              <ErrorBoundary quiet fallbackText="The map could not be drawn.">
              <IssueMap
                center={[c.lat, c.lng]}
                // image_url was missing, so the popup on a single-complaint map
                // always said "No photo" even when the complaint had one — the
                // object is built by hand here rather than passed through.
                complaints={[{
                  ref: c.ref, lat: c.lat, lng: c.lng,
                  severity: c.severity, status: c.status, category: c.category,
                  image_url: c.before_image_url, ward_code: c.ward_code,
                }]}
                height={220}
                showClusters={false}
              />
              </ErrorBoundary>
            )}
          </Panel>
        </aside>
      </div>

      {rejecting && (
        <RejectDialog
          complaint={c}
          onClose={() => setRejecting(false)}
          onDone={() => { setRejecting(false); load(); }}
        />
      )}

      {assigning && (
        <AssignOfficer complaint={c} onClose={() => setAssigning(false)} onDone={() => { setAssigning(false); load(); }} />
      )}
    </div>
  );
}


/**
 * Rejecting a report.
 *
 * The reason is mandatory and shown to the resident. A rejection they can read
 * is recoverable — they can photograph the right thing and try again. Silence
 * is not: they keep checking a page that never changes and stop reporting.
 */
function RejectDialog({ complaint, onClose, onDone }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const PRESETS = [
    "The photograph does not show a civic problem.",
    "This is on private property, outside municipal responsibility.",
    "A duplicate of a report that has already been closed.",
    "The photograph is too unclear to act on. Please send another.",
  ];

  return (
    <Modal
      title="Not a civic issue"
      subtitle={`${complaint.ref} · ${complaint.category}`}
      onClose={onClose}
      footer={
        <>
          <button
            className="btn btn--danger"
            disabled={busy || reason.trim().length < 5}
            onClick={async () => {
              setBusy(true);
              try {
                await api.rejectComplaint(complaint.ref, reason.trim());
                onDone();
              } catch (e) {
                setError(e.message);
                setBusy(false);
              }
            }}
          >
            {busy ? "Rejecting…" : "Reject and tell them"}
          </button>
          <button className="btn btn--secondary" onClick={onClose}>Cancel</button>
        </>
      }
    >
      <p className="prose">
        The resident is sent this reason. Write something they can act on — if the photograph
        was unclear, they can take another.
      </p>

      <div className="row row--wrap" style={{ gap: 6, marginTop: "var(--s-4)" }}>
        {PRESETS.map((p) => (
          <button key={p} className="chip" onClick={() => setReason(p)}>
            {p.slice(0, 34)}…
          </button>
        ))}
      </div>

      <label className="field" style={{ marginTop: "var(--s-4)" }}>
        <span className="label">Reason</span>
        <textarea
          className="input"
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="What was wrong with this report?"
        />
      </label>

      {error && <div style={{ marginTop: "var(--s-4)" }}><ErrorNote>{error}</ErrorNote></div>}
    </Modal>
  );
}
