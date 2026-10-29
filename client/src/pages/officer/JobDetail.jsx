import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "../../lib/api.js";
import { Label, Pill, KV, ErrorNote, Panel, Badge } from "../../components/Primitives.jsx";
import { Icon } from "../../components/Icons.jsx";
import CityMap from "../../components/CityMap.jsx";
import ErrorBoundary from "../../components/ErrorBoundary.jsx";
import { PhotoPicker } from "../../components/CameraCapture.jsx";
import EvidenceTimeline, { buildEvidenceTimeline } from "../../components/EvidenceTimeline.jsx";
import { when } from "../../lib/format.js";

export default function JobDetail() {
  const { ref } = useParams();
  const navigate = useNavigate();
  const [job, setJob] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [check, setCheck] = useState(null);
  const [pending, setPending] = useState(null);
  const [checkNote, setCheckNote] = useState(null);
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");

  const load = () => api.officerJob(ref).then(setJob).catch((e) => setError(e.message));
  useEffect(() => { load(); }, [ref]);

  async function move(status) {
    if (status === "rejected" && !note.trim()) {
      setError("Explain why you are rejecting this job.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.officerStatus(ref, status, note || undefined);
      if (status === "rejected") navigate("/officer");
      else { setNote(""); setRejecting(false); await load(); }
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  /**
   * Hold the photograph for review rather than sending it.
   *
   * It was submitted the moment the shutter closed, which meant a blurred
   * frame, a thumb over the lens or a shot of the wrong stretch of road went
   * straight to the resident as proof the work was done. The officer is
   * standing there and can see it is wrong — they simply had no way to say so.
   */
  function stageProof(file) {
    if (!file) return;
    if (pending?.url) URL.revokeObjectURL(pending.url);
    setPending({ file, url: URL.createObjectURL(file) });
    setCheck(null);
    setCheckNote(null);
    setError(null);
  }

  function discardProof() {
    if (pending?.url) URL.revokeObjectURL(pending.url);
    setPending(null);
  }

  async function submitProof() {
    if (!pending) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api.officerProof(ref, pending.file, note || undefined);
      setCheck(result.check);
      setCheckNote(result.note || null);
      discardProof();
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (error && !job) return <ErrorNote onRetry={load}>{error}</ErrorNote>;
  if (!job) return <div className="label">Loading</div>;

  return (
    <div>
      <button className="btn btn--quiet" onClick={() => navigate("/officer")}>← My queue</button>

      <header className="row row--between" style={{ marginTop: "var(--sp-3)", flexWrap: "wrap", gap: "var(--sp-3)" }}>
        <div>
          <div className="row" style={{ gap: 8 }}>
            <Pill tone={job.severity} />
            <span className="mono label">{job.ref}</span>
          </div>
          <h1 className="display" style={{ marginTop: 6 }}>{job.category}</h1>
          <div className="label" style={{ marginTop: 4 }}>
            {job.address || `Ward ${job.ward_code}`} · {job.department_name}
          </div>
        </div>
        <Pill tone={job.status === "verification" ? "ok" : "medium"}>{job.status.replace("_", " ")}</Pill>
      </header>

      {/* Returned work needs the reason at the top, not buried in a timeline.
          The officer is about to go back out — they need to know what was
          wrong before they read anything else. */}
      {job.rework_count > 0 && job.status === "reopened" && (
        <div
          className="card card--pad"
          style={{
            marginTop: "var(--s-4)",
            background: "var(--danger-bg)",
            borderColor: "var(--danger-line)",
            borderLeft: "3px solid var(--danger)",
          }}
        >
          <div className="row" style={{ gap: "var(--s-3)" }}>
            <Icon.alert width={18} height={18} style={{ color: "var(--danger)", flex: "none" }} />
            <div style={{ minWidth: 0 }}>
              <strong>
                The resident says this is not fixed
                {job.rework_count > 1 && ` — returned ${job.rework_count} times`}
              </strong>
              <p className="prose" style={{ marginTop: "var(--s-2)" }}>
                {job.last_rejection_reason ||
                  "No reason was given. Check the original photo and compare it with what you submitted."}
              </p>
              <p className="label" style={{ marginTop: "var(--s-2)" }}>
                Rejected {job.last_rejected_at ? when(job.last_rejected_at) : "recently"}. Go back,
                complete the work, and upload fresh evidence below.
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="split" style={{ marginTop: "var(--s-4)" }}>
        <div className="stack">
          {job.report_image_url && (
            <figure style={{ margin: 0 }}>
              <img
                src={job.report_image_url}
                alt="Reported issue"
                style={{ width: "100%", maxHeight: 400, objectFit: "cover", border: "1px solid var(--line)", borderRadius: "var(--radius)" }}
              />
              <figcaption className="label" style={{ marginTop: 6 }}>
                Filed by {job.citizen_name || "a resident"} · {when(job.created_at)}
              </figcaption>
            </figure>
          )}

          {/* A complaint with no usable coordinate should cost the map, not
              the page — the officer still needs the photo and the address. */}
          {Number.isFinite(Number(job.lat)) && Number.isFinite(Number(job.lng)) ? (
            <ErrorBoundary quiet fallbackText="The map could not be drawn for this location.">
              <CityMap
                mode="complaints"
                complaints={[{
                  ref: job.ref, lat: Number(job.lat), lng: Number(job.lng),
                  severity: job.severity, category: job.category,
                  image_url: job.report_image_url, ward_code: job.ward_code,
                }]}
                height={240}
                center={[Number(job.lat), Number(job.lng)]}
              />
            </ErrorBoundary>
          ) : (
            <div className="card card--pad" style={{ color: "var(--muted)", fontSize: "var(--t-sm)" }}>
              No coordinates were recorded for this report. Use the address above.
            </div>
          )}

          {job.description_original && (
            <div className="card card--pad">
              <Label>What the resident wrote</Label>
              <p style={{ marginTop: 6, marginBottom: 0 }}>{job.description_original}</p>
              {job.description_translated && job.description_lang !== "en" && (
                <>
                  <hr className="rule" style={{ margin: "var(--sp-3) 0" }} />
                  <Label>Translation</Label>
                  <p style={{ marginTop: 6, marginBottom: 0 }}>{job.description_translated}</p>
                </>
              )}
            </div>
          )}

          {checkNote && !check && (
            <div className="card card--pad" style={{ background: "var(--warn-bg)", borderColor: "var(--warn-line)" }}>
              <strong style={{ fontSize: "var(--t-sm)" }}>Photo uploaded</strong>
              <p className="prose" style={{ fontSize: "var(--t-sm)", marginTop: 4 }}>
                {checkNote} Your work is recorded either way — the resident confirms next.
              </p>
            </div>
          )}

          {/* No comparison ran, so there is nothing to report. Printing
              "scene match 0% · inconclusive" made a missing check look like a
              failed one, and an officer reads that as their work being doubted. */}
          {/* The resident's verdict on this officer's own work. Collected and
              aggregated onto their record, but never shown to them — and the
              person who did the job is who it could actually change. */}
          {job.review && (
            <section className="sheet" style={{ marginTop: "var(--s-4)" }}>
              <div className="row row--between">
                <Label>What the resident said</Label>
                <span style={{ color: "var(--warn)" }}>{"★".repeat(job.review.rating)}</span>
              </div>

              {job.review.comment && (
                <p className="prose" style={{ marginTop: "var(--s-3)" }}>{job.review.comment}</p>
              )}

              <div className="row row--wrap" style={{ gap: "var(--s-3)", marginTop: "var(--s-3)" }}>
                {job.review.speed_rating && (
                  <Badge tone="pending">speed {job.review.speed_rating}/5</Badge>
                )}
                {job.review.quality_rating && (
                  <Badge tone="pending">quality {job.review.quality_rating}/5</Badge>
                )}
              </div>
            </section>
          )}

          {check?.verdict === "not_checked" && (
            <section className="sheet" style={{ marginTop: "var(--s-4)" }}>
              <Label>Evidence sent</Label>
              <p className="prose" style={{ fontSize: "var(--t-sm)", marginTop: "var(--s-2)" }}>
                {check.summary}
              </p>
            </section>
          )}

          {check && check.verdict !== "not_checked" && (
            <div className="card card--pad" style={{ borderLeft: "2px solid var(--accent)" }}>
              <Label>Evidence check</Label>
              <p className="prose" style={{ marginTop: 8 }}>{check.summary}</p>
              <div style={{ marginTop: "var(--sp-3)" }}>
                <KV k="Scene match" v={`${check.scene_match}%`} />
                <KV k="Change detected" v={check.change_detected ? "Yes" : "No"} />
                <KV k="Verdict" v={check.verdict?.replace("_", " ")} />
              </div>
              <p className="prose" style={{ fontSize: "var(--fs-sm)", marginTop: "var(--sp-3)" }}>
                This does not close the job. The resident confirms next.
              </p>
            </div>
          )}
        </div>

        <aside className="stack">
          <div className="card card--pad">
            <Label>Analysis</Label>
            <p className="prose" style={{ fontSize: "var(--fs-sm)", marginTop: 6 }}>{job.ai_summary}</p>
            <div style={{ marginTop: "var(--sp-3)" }}>
              <KV k="Confidence" v={`${job.ai_confidence}%`} />
              <KV k="Severity score" v={`${job.severity_score}/100`} />
              <KV k="Deadline" v={when(job.sla_deadline)} />
            </div>
          </div>

          <div className="card card--pad">
            <Label>Next step</Label>

            {job.status === "assigned" && (
              <div className="stack" style={{ marginTop: "var(--sp-3)" }}>
                <button className="btn btn--block" disabled={busy} onClick={() => move("accepted")}>
                  Accept this job
                </button>
                <button className="btn btn--secondary btn--block" onClick={() => setRejecting((v) => !v)}>
                  Not my department
                </button>
              </div>
            )}

            {job.status === "accepted" && (
              <button className="btn btn--block" style={{ marginTop: "var(--sp-3)" }} disabled={busy} onClick={() => move("work_started")}>
                Start work
              </button>
            )}

            {(job.status === "work_started" || job.status === "reopened") && (
              <div style={{ marginTop: "var(--sp-3)" }}>
                <p className="prose" style={{ fontSize: "var(--fs-sm)" }}>
                  Photograph the finished work from roughly the same position as the original photo,
                  so the comparison is meaningful.
                </p>
                {/* Nothing is sent until the officer looks at it and says so.
                    It used to submit the moment the shutter closed, so a blurred
                    frame or a thumb over the lens went to the resident as proof
                    the work was done. */}
                {pending ? (
                  <div style={{ marginTop: "var(--s-4)" }}>
                    <img
                      src={pending.url}
                      alt="The photograph you just took"
                      style={{
                        width: "100%", maxHeight: 340, objectFit: "cover",
                        borderRadius: "var(--r)", border: "1px solid var(--line)",
                      }}
                    />

                    <p className="prose" style={{ fontSize: "var(--t-sm)", marginTop: "var(--s-3)" }}>
                      Is the finished work clearly visible, from roughly where the original photo
                      was taken? The resident decides using this.
                    </p>

                    <div className="row row--wrap" style={{ gap: "var(--s-3)", marginTop: "var(--s-4)" }}>
                      <button className="btn" onClick={submitProof} disabled={busy}>
                        {busy ? "Sending…" : "Send this to the resident"}
                      </button>
                      <button className="btn btn--secondary" onClick={discardProof} disabled={busy}>
                        Take another
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ marginTop: "var(--s-4)" }}>
                    <PhotoPicker
                      onFile={stageProof}
                      disabled={busy}
                      cameraLabel={job.status === "reopened" ? "Take new evidence" : "Photograph the work"}
                      fileLabel="Upload"
                    />
                  </div>
                )}
              </div>
            )}

            {job.status === "verification" && (
              <p className="prose" style={{ fontSize: "var(--fs-sm)", marginTop: "var(--sp-3)" }}>
                Waiting on the resident to confirm. If they say the problem is still there, this
                reopens and escalates.
              </p>
            )}

            {rejecting && (
              <div style={{ marginTop: "var(--sp-3)" }}>
                <Label>Reason</Label>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={3}
                  placeholder="Why does this belong elsewhere?"
                  style={{
                    width: "100%", marginTop: 5, padding: 10, font: "inherit",
                    border: "1px solid var(--line-firm)", borderRadius: "var(--radius)", resize: "vertical",
                  }}
                />
                <button className="btn btn--secondary btn--block" style={{ marginTop: 8 }} disabled={busy} onClick={() => move("rejected")}>
                  Send back
                </button>
              </div>
            )}

            {error && <p style={{ color: "var(--critical)", fontSize: "var(--fs-sm)", marginTop: "var(--sp-3)" }}>{error}</p>}
          </div>
        </aside>
      </div>
    </div>
  );
}
