import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../lib/api.js";
import {
  Panel, Badge, Label, SeverityBadge, StatusBadge, ErrorNote, SkeletonRows, Empty,
  VerificationBadge,
} from "../../components/Primitives.jsx";
import { Icon } from "../../components/Icons.jsx";

const SORTS = [
  { id: "recent", label: "Newest" },
  { id: "discussed", label: "Most confirmed" },
  { id: "overdue", label: "Past deadline" },
];

const ago = (iso) => {
  const days = Math.floor((Date.now() - new Date(iso)) / 864e5);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  return `${Math.round(days / 30)} months ago`;
};

/**
 * Everything reported in the city, open to anyone.
 *
 * The product's argument is that responsibility is visible, and it was visible
 * only to the people doing the work — a resident could see their own report and
 * had to take the rest on trust. Overdue work is shown alongside the closed
 * work, because a feed that only showed successes would be advertising rather
 * than a record.
 *
 * No names, and coordinates are rounded to roughly a street. A complaint about
 * a broken streetlight, published to the doorstep with a timestamp, is a
 * statement about where somebody lives.
 */
export default function PublicReports() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [sort, setSort] = useState("recent");
  const [status, setStatus] = useState("");
  const [verified, setVerified] = useState(false);

  useEffect(() => {
    setData(null);
    api.publicReports({ sort, status, verified: verified ? "true" : "" }).then(setData).catch((e) => setError(e.message));
  }, [sort, status, verified]);

  if (error) return <ErrorNote>{error}</ErrorNote>;

  const t = data?.totals;

  return (
    <div className="container" style={{ padding: "var(--s-7) var(--s-5) var(--s-9)" }}>
      <div style={{ marginBottom: "var(--s-4)" }}>
        <Link to="/app" className="btn--quiet">← Dashboard</Link>
      </div>
      <div className="eyebrow">Open record</div>
      <h1 className="display d-lg" style={{ marginTop: "var(--s-3)" }}>
        Everything reported in Mumbai
      </h1>
      <p className="lede" style={{ marginTop: "var(--s-4)" }}>
        Every report, what was done about it, and what is still waiting. Nobody is named and
        locations are approximate.
      </p>

      {t && (
        <div className="statbar" style={{ marginTop: "var(--s-6)" }}>
          <div className="statbar__cell">
            <div className="statbar__label">Reported</div>
            <div className="statbar__value">{t.total}</div>
          </div>
          <div className="statbar__cell">
            <div className="statbar__label">Resolved</div>
            <div className="statbar__value">{t.resolved}</div>
          </div>
          <div className="statbar__cell" data-alert={t.overdue > 0}>
            <div className="statbar__label">Past deadline</div>
            <div className="statbar__value">{t.overdue}</div>
            <div className="statbar__note">shown, not hidden</div>
          </div>
        </div>
      )}

      <div className="row row--wrap" style={{ gap: "var(--s-2)", margin: "var(--s-6) 0 var(--s-5)" }}>
        {SORTS.map((s) => (
          <button key={s.id} className="choice" aria-pressed={sort === s.id} onClick={() => setSort(s.id)}>
            {s.label}
          </button>
        ))}
        <span style={{ width: "var(--s-4)" }} />
        {[["", "All"], ["open", "Still open"], ["resolved", "Resolved"]].map(([v, l]) => (
          <button key={l} className="choice" aria-pressed={status === v} onClick={() => setStatus(v)}>
            {l}
          </button>
        ))}
        <span style={{ width: "var(--s-4)" }} />
        {/* For somebody who only wants reports the city has actually acted on,
            rather than everything anyone has ever photographed. */}
        <button className="choice" aria-pressed={verified} onClick={() => setVerified((v) => !v)}>
          Checked by someone
        </button>
      </div>

      {!data ? (
        <SkeletonRows rows={6} height={92} />
      ) : data.reports.length === 0 ? (
        <Empty icon={Icon.file} title="Nothing here yet" body="Reports appear as residents file them." />
      ) : (
        <div className="stack">
          {data.reports.map((r) => (
            <Link key={r.ref} to={`/reports/${r.ref}`} className="card card--pad card--link">
              <div className="row row--between row--wrap" style={{ gap: "var(--s-3)" }}>
                <div style={{ minWidth: 0 }}>
                  <div className="row row--wrap" style={{ gap: "var(--s-2)" }}>
                    <strong>{r.category}</strong>
                    <SeverityBadge severity={r.severity} />
                    <StatusBadge status={r.status} />
                    {r.overdue && <Badge tone="danger">past deadline</Badge>}
                    <VerificationBadge verification={r.verification} disputed={r.disputed} />
                  </div>

                  <div className="label" style={{ marginTop: 4 }}>
                    {r.ward_name || r.ward_code} · {r.department} · filed {ago(r.created_at)}
                    {r.agency && ` · maintained by ${r.agency}`}
                  </div>
                </div>

                <div className="row" style={{ gap: "var(--s-3)", flex: "none" }}>
                  {r.corroboration_count > 0 && (
                    <span className="label">{r.corroboration_count} confirmed</span>
                  )}
                  {r.comment_count > 0 && (
                    <span className="label">{r.comment_count} comments</span>
                  )}
                  <span className="ref">{r.ref}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      <p className="label" style={{ marginTop: "var(--s-6)" }}>
        Reports withdrawn by the person who filed them, or rejected as not civic matters, are not
        listed. Everything else is, including work that is late.
      </p>
    </div>
  );
}
