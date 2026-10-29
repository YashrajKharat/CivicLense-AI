import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../lib/api.js";
import { Label, Pill, Empty, ErrorNote, PageHead, Thumb, SkeletonRows, SeverityBadge } from "../../components/Primitives.jsx";
import { Icon, CATEGORY_ICON } from "../../components/Icons.jsx";
import { when } from "../../lib/format.js";
import { useAuth } from "../../lib/auth.jsx";
import { Link } from "react-router-dom";
import { useRealtime } from "../../lib/useRealtime.js";

/**
 * What the officer has to do about each job, rather than what state it is in.
 *
 * "verification" is a database status; "waiting on the resident" is the thing
 * an officer needs to know, because it means the job is off their hands unless
 * it comes back.
 */
const GROUPS = [
  {
    id: "returned",
    label: "Sent back to you",
    note: "The resident said this is not fixed. Read what they wrote before going out again.",
    match: (s) => s === "reopened",
  },
  {
    id: "todo",
    label: "Needs a visit",
    note: "Accepted but no evidence submitted yet.",
    match: (s) => ["assigned", "work_started"].includes(s),
  },
  {
    id: "waiting",
    label: "Waiting on the resident",
    note: "You have submitted evidence. Nothing to do unless they send it back.",
    match: (s) => s === "verification",
  },
  {
    id: "new",
    label: "New to you",
    note: "Just assigned. Accept it to start.",
    match: (s) => ["submitted", "ai_analysis", "under_review"].includes(s),
  },
];

export default function Queue() {
  const { profile } = useAuth();
  const [jobs, setJobs] = useState(null);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  const load = () => api.officerQueue().then((r) => setJobs(r.jobs)).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  // Work is reassigned while officers are in the field, so the queue refreshes
  // itself rather than showing a job that has already moved on.
  useRealtime("complaints", { onChange: load });

  if (error) return <ErrorNote onRetry={load}>{error}</ErrorNote>;
  if (!jobs) return <SkeletonRows rows={4} height={96} />;

  if (!jobs.length) {
    // An administrator browsing here sees zero because the queue is personal —
    // it lists what is assigned to *you*, not everything in the department.
    // Saying so beats an empty box that looks broken.
    const isAdmin = profile?.role === "super_admin" || profile?.role === "global_admin";

    return (
      <div className="fade-in">
        <PageHead
          eyebrow="Assigned to you"
          title="My queue"
          sub={isAdmin ? "This queue is personal, not departmental." : undefined}
        />
        <Empty
          icon={Icon.clipboard}
          title={isAdmin ? "Nothing is assigned to you personally" : "Queue is clear"}
          body={
            isAdmin
              ? "This page lists complaints assigned to your own account. To see everything in your department, and to hand work out, use the command centre."
              : "New work assigned to you appears here, most urgent first. Your department administrator decides what comes your way."
          }
          action={
            isAdmin ? (
              <Link to="/admin/complaints" className="btn">Open all complaints</Link>
            ) : null
          }
        />
      </div>
    );
  }

  const breached = jobs.filter((j) => j.sla === "breached").length;

  return (
    <div>
      <PageHead
        eyebrow="Assigned to you"
        title="My queue"
        sub={`${jobs.length} open · sorted by severity, then deadline`}
        actions={breached > 0 ? <Pill tone="critical">{breached} past deadline</Pill> : null}
      />

      {/* Grouped by what the officer has to do about it.
          A flat list showed a job needing a site visit beside one already
          submitted and waiting on a resident — identical rows, and no way to
          tell which needed boots on the ground. */}
      {GROUPS.map((group) => {
        const inGroup = jobs.filter((j) => group.match(j.status));
        if (!inGroup.length) return null;

        return (
          <section key={group.id} className="section">
            <h3 className="section__label">
              <span>{group.label}</span>
              <b>{inGroup.length}</b>
            </h3>
            <p className="prose" style={{ fontSize: "var(--t-sm)", marginBottom: "var(--s-4)" }}>
              {group.note}
            </p>

            <div className="stack">
              {inGroup.map((job) => (
          <button
            key={job.ref}
            className="card card--pad"
            style={{
              width: "100%", textAlign: "left", display: "block",
              borderLeft: `2px solid var(--${job.sla === "breached" ? "critical" : job.sla === "approaching" ? "high" : "line"})`,
            }}
            onClick={() => navigate(`/officer/jobs/${job.ref}`)}
          >
            <div className="row row--top row--between row--wrap" style={{ gap: "var(--s-4)" }}>
              <div className="row row--top" style={{ gap: "var(--s-4)", minWidth: 0 }}>
                <Thumb src={job.image_url} alt={job.category} fallback="No photo" />
                <div style={{ minWidth: 0 }}>
                  <div className="row row--wrap" style={{ gap: "var(--s-2)" }}>
                    <span className="h h-lg">{job.category}</span>
                    <SeverityBadge severity={job.severity} />
                  </div>
                  <div className="truncate muted" style={{ fontSize: "var(--t-sm)", marginTop: 3 }}>
                    {job.address || `Ward ${job.ward_code}`}
                  </div>
                  <div className="row" style={{ gap: "var(--s-3)", marginTop: "var(--s-2)" }}>
                    <span className="mono label">{job.ref}</span>
                    <span className="label">filed {when(job.created_at)}</span>
                  </div>
                </div>
              </div>

              <div style={{ textAlign: "right" }}>
                <Label>Deadline</Label>
                <div
                  className="mono"
                  style={{
                    fontSize: "var(--fs-lg)", marginTop: 2,
                    color: job.sla === "breached" ? "var(--critical)" : job.sla === "approaching" ? "var(--high)" : "var(--ink)",
                  }}
                >
                  {job.hours_left < 0
                    ? `${Math.abs(Math.round(job.hours_left))}h over`
                    : `${Math.round(job.hours_left)}h left`}
                </div>
                {job.cluster_size > 1 && (
                  <div className="label" style={{ marginTop: 4 }}>
                    {job.cluster_size} reports in group
                  </div>
                )}
              </div>
            </div>
          </button>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
