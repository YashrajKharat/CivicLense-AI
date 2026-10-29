import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../lib/api.js";
import { Icon, CATEGORY_ICON } from "../../components/Icons.jsx";
import {
  StatusBadge, SeverityBadge, Empty, ErrorNote, Label, PageHead,
  Segment, Thumb, SkeletonRows,
} from "../../components/Primitives.jsx";
import StatusTimeline from "../../components/StatusTimeline.jsx";
import ReviewForm from "../../components/ReviewForm.jsx";
import EvidenceTimeline, { buildEvidenceTimeline } from "../../components/EvidenceTimeline.jsx";
import Modal from "../../components/Modal.jsx";
import { ago } from "../../lib/format.js";
import { useT } from "../../lib/i18n.jsx";

export default function MyReports() {
  const [withdrawing, setWithdrawing] = useState(null);
  const { t } = useT();
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  const [open, setOpen] = useState(null);
  const [filter, setFilter] = useState("all");

  const load = () =>
    api.myComplaints().then((r) => setRows(r.complaints)).catch((e) => setError(e.message));

  useEffect(() => { load(); }, []);

  async function confirm(ref, resolved) {
    await api.confirmResolution(ref, resolved);
    load();
  }

  if (error) return <ErrorNote onRetry={load}>{error}</ErrorNote>;

  const needsYou = rows?.filter((r) => r.status === "verification").length ?? 0;

  const shown = !rows ? [] : rows.filter((r) =>
    filter === "all" ? true
      : filter === "resolved" ? r.status === "resolved"
      : filter === "verification" ? r.status === "verification"
      : !["resolved", "rejected"].includes(r.status)
  );

  return (
    <div className="fade-in">
      <PageHead
        title={t("reports.title")}
        sub={rows ? `${rows.length} filed${needsYou ? ` · ${needsYou} waiting on you` : ""}` : " "}
        actions={<Link to="/app/report" className="btn"><Icon.camera /> Report an issue</Link>}
      />

      <div className="toolbar">
        <Segment
          value={filter}
          onChange={setFilter}
          options={[
            { id: "all", label: "All" },
            { id: "open", label: "Open" },
            { id: "verification", label: "Needs you", count: needsYou },
            { id: "resolved", label: "Resolved" },
          ]}
        />
      </div>

      {!rows ? (
        <SkeletonRows rows={3} height={104} />
      ) : shown.length === 0 ? (
        <Empty
          title={rows.length ? "Nothing here" : t("reports.empty")}
          body={
            rows.length
              ? "No reports match that filter."
              : "Reports you file appear here with their progress and the officer handling them."
          }
          action={<Link to="/app/report" className="btn">Report an issue</Link>}
        />
      ) : (
        <div className="stack">
          {shown.map((c) => {
            const expanded = open === c.ref;
            const Ico = CATEGORY_ICON[c.category] || Icon.file;

            return (
              <article
                key={c.ref}
                className={`card ${c.status === "verification" ? "card--accent" : ""}`}
              >
                <button
                  className="row row--top row--between"
                  style={{ width: "100%", padding: "var(--s-5)", textAlign: "left", gap: "var(--s-4)" }}
                  onClick={() => setOpen(expanded ? null : c.ref)}
                  aria-expanded={expanded}
                >
                  <span className="row row--top" style={{ minWidth: 0, gap: "var(--s-4)" }}>
                    <Thumb src={c.image_url} alt={c.category} fallback="No photo" />

                    <span style={{ minWidth: 0 }}>
                      <span className="row" style={{ gap: "var(--s-2)", flexWrap: "wrap" }}>
                        <span className="h h-lg">{c.category}</span>
                        <SeverityBadge severity={c.severity} />
                      </span>

                      <span className="truncate muted" style={{ display: "block", fontSize: "var(--t-sm)", marginTop: 3 }}>
                        {c.address || `Ward ${c.ward_code}`}
                      </span>

                      <span className="row" style={{ gap: "var(--s-3)", marginTop: "var(--s-2)" }}>
                        <span className="mono label">{c.ref}</span>
                        <span className="label">filed {ago(c.created_at)}</span>
                      </span>
                    </span>
                  </span>

                  <span className="row" style={{ gap: "var(--s-2)", flex: "none" }}>
                    <StatusBadge status={c.status} />
                    <Icon.arrow
                      width={16}
                      height={16}
                      style={{
                        color: "var(--muted)",
                        transform: expanded ? "rotate(90deg)" : "none",
                        transition: "transform .18s",
                      }}
                    />
                  </span>
                </button>

                {expanded && (
                  <div
                    className="fade-in"
                    style={{ padding: "var(--s-5)", borderTop: "1px solid var(--line)" }}
                  >
                    {/* What you sent, and what came back. Seeing both is the
                        whole basis for judging whether it was actually fixed. */}
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: c.after_image_url ? "1fr 1fr" : "1fr",
                        gap: "var(--s-3)",
                        marginBottom: "var(--s-5)",
                      }}
                    >
                      {c.image_url && (
                        <figure style={{ margin: 0 }}>
                          <img
                            src={c.image_url}
                            alt="What you reported"
                            style={{
                              width: "100%", aspectRatio: "4/3", objectFit: "cover",
                              borderRadius: "var(--r)", border: "1px solid var(--line)",
                            }}
                          />
                          <figcaption className="label" style={{ marginTop: 6 }}>
                            What you reported
                          </figcaption>
                        </figure>
                      )}
                      {c.after_image_url && (
                        <figure style={{ margin: 0 }}>
                          <img
                            src={c.after_image_url}
                            alt="After the work"
                            style={{
                              width: "100%", aspectRatio: "4/3", objectFit: "cover",
                              borderRadius: "var(--r)", border: "1px solid var(--line)",
                            }}
                          />
                          <figcaption className="label" style={{ marginTop: 6 }}>
                            {c.rework_count > 0
                              ? `After the officer's return visit (attempt ${c.rework_count + 1})`
                              : "After the officer's visit"}
                          </figcaption>
                        </figure>
                      )}
                    </div>

                    {/* Returned work, so the resident can see their rejection
                        was acted on rather than absorbed silently. */}
                    {c.rework_count > 0 && (
                      <div
                        style={{
                          padding: "var(--s-4)", marginBottom: "var(--s-5)",
                          background: "var(--warn-bg)", border: "1px solid var(--warn-line)",
                          borderRadius: "var(--r)",
                        }}
                      >
                        <strong style={{ fontSize: "var(--t-sm)" }}>
                          You sent this back {c.rework_count === 1 ? "once" : `${c.rework_count} times`}
                        </strong>
                        <p className="prose" style={{ fontSize: "var(--t-sm)", marginTop: "var(--s-2)" }}>
                          {c.status === "reopened"
                            ? "The officer has been told and is expected to return with fresh evidence."
                            : "New evidence has been submitted since. Check the photo above before deciding."}
                        </p>
                      </div>
                    )}

                    {/* Who is handling it. A name is the difference between a
                        report going somewhere and going nowhere. */}
                    {c.officer_name && (
                      <div
                        style={{
                          padding: "var(--s-4)", marginBottom: "var(--s-5)",
                          background: "var(--surface-2)", borderRadius: "var(--r)",
                        }}
                      >
                        <Label>Assigned officer</Label>
                        <div style={{ fontWeight: 600, marginTop: 4 }}>{c.officer_name}</div>
                        <div className="label" style={{ marginTop: 2 }}>
                          {c.department_name}
                        </div>
                      </div>
                    )}

                    {/* Who is answerable — a contractor for a road, the licence
                        holder for a food premises. */}
                    <div
                      style={{
                        padding: "var(--s-4)", background: "var(--surface-2)",
                        borderRadius: "var(--r)", marginBottom: "var(--s-5)",
                      }}
                    >
                      <Label>Handled by</Label>
                      <div style={{ fontWeight: 600, marginTop: 4 }}>{c.department_name}</div>
                      {c.agency && (
                        <div className="label" style={{ marginTop: 4 }}>
                          Maintained under contract by {c.agency} ({c.contract_no})
                        </div>
                      )}
                      {c.establishment_name && (
                        <div className="label" style={{ marginTop: 4 }}>
                          Premises: {c.establishment_name}
                          {c.owner_name && ` · licence holder ${c.owner_name}`}
                        </div>
                      )}
                    </div>

                    {/* The same sequence the officer and the administrator see.
                        Showing residents a different history would be its own
                        kind of problem. */}
                    {c.attempts?.length > 0 && (
                      <div style={{ marginBottom: "var(--s-5)" }}>
                        <Label>Evidence</Label>
                        <div style={{ marginTop: "var(--s-3)" }}>
                          <EvidenceTimeline entries={buildEvidenceTimeline(c)} />
                        </div>
                      </div>
                    )}

                    <Label>Progress</Label>
                    <div style={{ marginTop: "var(--s-3)" }}>
                      <StatusTimeline current={c.status} history={c.history} />
                    </div>

                    {/* Offered only where it can succeed. A button that always
                        appears and usually fails is worse than no button. */}
                    {!c.officer_name &&
                      !c.cluster_ref &&
                      ["submitted", "ai_analysis", "under_review", "assigned"].includes(c.status) && (
                        <button
                          className="btn--quiet"
                          style={{ marginTop: "var(--s-4)", color: "var(--danger)" }}
                          onClick={() => setWithdrawing(c)}
                        >
                          Withdraw this report
                        </button>
                      )}

                    {c.status === "resolved" && (
                      <div style={{ marginTop: "var(--s-5)" }}>
                        <ReviewForm complaintRef={c.ref} existing={c.review} onDone={load} />
                      </div>
                    )}

                    {c.status === "verification" && (
                      <div
                        style={{
                          marginTop: "var(--s-5)", padding: "var(--s-5)",
                          background: "var(--accent-50)", border: "1px solid var(--accent-100)",
                          borderRadius: "var(--r)",
                        }}
                      >
                        <strong>{t("reports.confirm")}</strong>
                        <p className="prose" style={{ fontSize: "var(--t-sm)", marginTop: "var(--s-2)" }}>
                          {t("reports.confirmNote")}
                        </p>
                        <div className="row" style={{ marginTop: "var(--s-4)" }}>
                          <button className="btn" onClick={() => confirm(c.ref, true)}>
                            {t("reports.fixed")}
                          </button>
                          <button className="btn btn--ghost" onClick={() => confirm(c.ref, false)}>
                            {t("reports.notFixed")}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      {withdrawing && (
        <WithdrawDialog
          complaint={withdrawing}
          onClose={() => setWithdrawing(null)}
          onDone={() => { setWithdrawing(null); load(); }}
        />
      )}

    </div>
  );
}


/**
 * Withdrawing is not deleting, and the wording says so.
 *
 * The record stays for the audit trail; it simply stops being something anyone
 * is expected to act on. Telling somebody their report is "deleted" when the row
 * remains would be a small lie in a system whose whole argument is that nothing
 * gets quietly rewritten.
 */
function WithdrawDialog({ complaint, onClose, onDone }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  return (
    <Modal
      title="Withdraw this report"
      subtitle={`${complaint.ref} · ${complaint.category}`}
      onClose={onClose}
      footer={
        <>
          <button
            className="btn btn--danger"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await api.withdrawComplaint(complaint.ref);
                onDone();
              } catch (e) {
                setError(e.message);
                setBusy(false);
              }
            }}
          >
            {busy ? "Withdrawing…" : "Withdraw it"}
          </button>
          <button className="btn btn--secondary" onClick={onClose}>Keep it</button>
        </>
      }
    >
      <p className="prose">
        It stops appearing on the map and in the department's queue, and nobody will be
        assigned to it.
      </p>
      <p className="prose" style={{ marginTop: "var(--s-3)" }}>
        The record itself stays, marked withdrawn. Reports are a public trail, and removing
        them outright would mean one could vanish after somebody had already seen it.
      </p>
      <p className="label" style={{ marginTop: "var(--s-3)" }}>
        You cannot undo this, but nothing stops you reporting the same problem again.
      </p>

      {error && <div style={{ marginTop: "var(--s-4)" }}><ErrorNote>{error}</ErrorNote></div>}
    </Modal>
  );
}
