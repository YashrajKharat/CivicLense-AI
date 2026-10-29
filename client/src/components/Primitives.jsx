import { Icon } from "./Icons.jsx";

/* status → badge class. Kept in one place so a status never renders two ways. */
const STATUS_TONE = {
  resolved: "ok",
  work_completed: "ok",
  verification: "info",
  work_started: "info",
  assigned: "info",
  accepted: "info",
  under_review: "pending",
  ai_analysis: "pending",
  submitted: "pending",
  reopened: "warn",
  rejected: "danger",
};

const SEVERITY_TONE = { critical: "danger", high: "warn", medium: "info", low: "pending" };

export const STATUS_LABEL = {
  submitted: "Submitted",
  ai_analysis: "Analysed",
  under_review: "Under review",
  accepted: "Accepted",
  assigned: "Assigned",
  work_started: "In progress",
  work_completed: "Work done",
  verification: "Awaiting your confirmation",
  resolved: "Resolved",
  reopened: "Reopened",
  rejected: "Rejected",
};

export function Badge({ tone = "pending", children }) {
  return <span className={`badge badge--${tone}`}>{children}</span>;
}

export function StatusBadge({ status }) {
  return <Badge tone={STATUS_TONE[status] || "pending"}>{STATUS_LABEL[status] || status}</Badge>;
}

export function SeverityBadge({ severity }) {
  return <Badge tone={SEVERITY_TONE[severity] || "pending"}>{severity}</Badge>;
}

/**
 * Generic status chip used across the admin and officer views.
 * Accepts severity names, SLA states or free text and maps them onto the
 * badge palette, so a tone only has to be spelled one way at the call site.
 */
const PILL_TONE = {
  critical: "danger", breached: "danger", rejected: "danger", missed: "danger",
  high: "warn", approaching: "warn", expiring: "warn", reopened: "warn",
  medium: "info", within: "info", assigned: "info",
  low: "pending", pending: "pending", submitted: "pending",
  resolved: "ok", ok: "ok", met: "ok", active: "ok", verified: "ok",
};

export function Pill({ tone = "pending", children }) {
  const key = String(tone).toLowerCase();
  return <span className={`badge badge--${PILL_TONE[key] || "pending"}`}>{children ?? tone}</span>;
}

export function Label({ children, style }) {
  return <div className="label" style={style}>{children}</div>;
}

export function Tile({ icon: Ico = Icon.file, tone = "", size }) {
  return (
    <span className={`tile ${tone ? `tile--${tone}` : ""} ${size === "lg" ? "tile--lg" : ""}`}>
      <Ico />
    </span>
  );
}

/** Big number card used across every dashboard. */
export function Stat({ label, value, icon, tone, note, trend }) {
  return (
    <div className="card card--tight">
      <div className="row row--between">
        <span className="label">{label}</span>
        {icon && <Tile icon={icon} tone={tone} />}
      </div>
      <div className="num" style={{ fontSize: "var(--t-xl)", marginTop: "var(--s-3)" }}>{value}</div>
      {(note || trend) && (
        <div className="row" style={{ gap: 6, marginTop: "var(--s-2)" }}>
          {trend != null && (
            <span
              className="badge"
              style={{
                background: trend >= 0 ? "var(--danger-bg)" : "var(--ok-bg)",
                color: trend >= 0 ? "var(--danger)" : "var(--ok)",
                borderColor: trend >= 0 ? "var(--danger-line)" : "var(--ok-line)",
              }}
            >
              {trend >= 0 ? "↑" : "↓"} {Math.abs(trend)}%
            </span>
          )}
          {note && <span className="label">{note}</span>}
        </div>
      )}
    </div>
  );
}

/** Every screen's title block, so no two pages start at a different height. */
export function PageHead({ eyebrow, title, sub, actions }) {
  return (
    <header className="page-head">
      <div className="page-head__text">
        {eyebrow && <div className="label label--caps" style={{ marginBottom: 6 }}>{eyebrow}</div>}
        <h1 className="display d-md">{title}</h1>
        {sub && <p className="prose">{sub}</p>}
      </div>
      {actions && <div className="row" style={{ gap: "var(--s-2)" }}>{actions}</div>}
    </header>
  );
}

/** A photo, or a labelled placeholder — never an empty box with no explanation. */
export function Thumb({ src, alt = "", size = "", fallback = "No photo" }) {
  if (src) return <img src={src} alt={alt} className={`thumb ${size ? `thumb--${size}` : ""}`} loading="lazy" />;
  return (
    <div
      className={`thumb ${size ? `thumb--${size}` : ""}`}
      style={{ display: "grid", placeItems: "center", color: "var(--muted)", fontSize: "var(--t-2xs)", textAlign: "center", padding: 4 }}
    >
      {fallback}
    </div>
  );
}

/** Segmented control — one visual group instead of a row of identical pills. */
export function Segment({ value, onChange, options }) {
  return (
    <div className="segment" role="group">
      {options.map((o) => {
        const id = typeof o === "string" ? o : o.id;
        const label = typeof o === "string" ? o : o.label;
        return (
          <button key={id} aria-pressed={value === id} onClick={() => onChange(id)}>
            {label}
            {typeof o === "object" && o.count > 0 && ` (${o.count})`}
          </button>
        );
      })}
    </div>
  );
}

export function KV({ k, v, tone }) {
  return (
    <div className="row row--between" style={{ padding: "9px 0", borderBottom: "1px solid var(--line)" }}>
      <span className="label">{k}</span>
      <span className="mono" style={{ fontSize: 13, color: tone ? `var(--${tone})` : "var(--text)" }}>{v}</span>
    </div>
  );
}

export function Meter({ value, tone }) {
  return (
    <div className={`meter ${tone ? `meter--${tone}` : ""}`}>
      <i style={{ width: `${Math.max(0, Math.min(100, value || 0))}%` }} />
    </div>
  );
}

export function Loading({ label = "Loading" }) {
  return (
    <div className="row" style={{ padding: "var(--s-8)", color: "var(--muted)", justifyContent: "center" }}>
      <span className="spin"><Icon.clock /></span>
      <span className="label">{label}</span>
    </div>
  );
}

/** Shaped placeholders beat a spinner — the page does not jump when data lands. */
export function SkeletonRows({ rows = 4, height = 62 }) {
  return (
    <div className="stack-sm">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton" style={{ height, opacity: 1 - i * 0.12 }} />
      ))}
    </div>
  );
}

export function SkeletonStats({ count = 4 }) {
  return (
    <div className="grid-4">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="skeleton" style={{ height: 104 }} />
      ))}
    </div>
  );
}

export function Empty({ title, body, action, icon: Ico = Icon.clipboard }) {
  return (
    <div className="card card--pad" style={{ textAlign: "center", padding: "var(--s-9) var(--s-6)" }}>
      <span className="tile tile--accent tile--lg" style={{ margin: "0 auto" }}><Ico /></span>
      <h3 className="h h-lg" style={{ marginTop: "var(--s-4)" }}>{title}</h3>
      <p className="prose" style={{ margin: "var(--s-2) auto 0" }}>{body}</p>
      {action && <div style={{ marginTop: "var(--s-6)" }}>{action}</div>}
    </div>
  );
}

export function ErrorNote({ children, onRetry }) {
  return (
    <div className="card card--pad" style={{ borderLeft: "3px solid var(--danger)", background: "var(--danger-bg)" }}>
      <div className="row"><Icon.alert /><strong>That did not work</strong></div>
      <p style={{ margin: "8px 0 0", color: "var(--text-2)" }}>{children}</p>
      {onRetry && <button className="btn btn--ghost btn--sm" style={{ marginTop: 14 }} onClick={onRetry}>Try again</button>}
    </div>
  );
}

export function Logo({ dark = false, size = 34 }) {
  return (
    <span className="row" style={{ gap: 10 }}>
      <span
        style={{
          width: size, height: size, borderRadius: 9, background: "var(--accent)",
          color: "#fff", display: "grid", placeItems: "center",
          fontFamily: "var(--display)", fontWeight: 900, fontSize: size * 0.4, letterSpacing: "-0.02em",
        }}
      >
        CP
      </span>
      <span
        className="display"
        style={{ fontSize: size * 0.5, letterSpacing: "0.02em", color: dark ? "#fff" : "var(--text)" }}
      >
        CivicLense
      </span>
    </span>
  );
}

/**
 * A card with a real header. Every block on a dashboard should have the same
 * anatomy — title left, action right, body below — otherwise headings land at
 * slightly different heights and the page reads as unaligned even when the
 * grid is correct.
 */
export function Panel({ title, action, children, flush, list, foot, style, className = "" }) {
  return (
    <section className={`panel ${className}`.trim()} style={style}>
      {(title || action) && (
        <header className="panel__head">
          <h2 className="panel__title">{title}</h2>
          {action}
        </header>
      )}
      <div className={`panel__body${flush ? " panel__body--flush" : list ? " panel__body--list" : ""}`}>
        {children}
      </div>
      {foot && <footer className="panel__foot">{foot}</footer>}
    </section>
  );
}

/** The instrument strip at the top of a dashboard. One row, four readings. */
export function StatBar({ items }) {
  return (
    <div className="statbar">
      {items.map((s) => (
        <div key={s.label} className="statbar__cell" data-alert={Boolean(s.alert)}>
          <div className="statbar__label">
            {s.icon && <s.icon width={13} height={13} />}
            {s.label}
          </div>
          <div className="statbar__value">{s.value}</div>
          {s.note && <div className="statbar__note">{s.note}</div>}
        </div>
      ))}
    </div>
  );
}

export function Live({ children = "live" }) {
  return <span className="live">{children}</span>;
}


/**
 * Where you are in a multi-step flow.
 *
 * Previously all five markers were filled orange circles, which told you
 * nothing — you could not tell a finished step from the one you were on. Done
 * steps carry the record blue, the current one carries the accent, and what is
 * still ahead stays a hairline.
 */
export function Steps({ steps, current }) {
  return (
    <nav className="steps" aria-label="Progress">
      {steps.map((label, i) => {
        const state = i < current ? "done" : i === current ? "now" : "todo";
        return (
          <span key={label} style={{ display: "contents" }}>
            {i > 0 && <i className="step__rule" />}
            <span className="step" data-state={state} aria-current={state === "now" ? "step" : undefined}>
              <span className="step__n">{state === "done" ? "✓" : i + 1}</span>
              <span>{label}</span>
            </span>
          </span>
        );
      })}
    </nav>
  );
}

/** A reference number, in the record vernacular. */
export function Ref({ children, plain }) {
  return <span className={plain ? "ref ref--plain" : "ref"}>{children}</span>;
}

/** A grouping inside a sheet. Replaces a nested card. */
export function Section({ label, meta, children, style }) {
  return (
    <section className="section" style={style}>
      {(label || meta) && (
        <h3 className="section__label">
          <span>{label}</span>
          {meta && <b>{meta}</b>}
        </h3>
      )}
      {children}
    </section>
  );
}


/**
 * How much a public report has been stood behind.
 *
 * A feed where every report looks equally solid is worth less than one that
 * distinguishes them. This states what already happened rather than inventing a
 * score: a resident who went back and confirmed the fix is stronger evidence
 * than three neighbours agreeing, which is stronger than nobody having looked.
 *
 * "Unverified" is not an accusation — it is true of every report in its first
 * hour, and the wording says so.
 */
const VERIFICATION = {
  confirmed_by_resident: { tone: "ok", label: "Fix confirmed", note: "The resident went back and checked." },
  closed_by_officer: { tone: "info", label: "Closed by officer", note: "Awaiting the resident's confirmation." },
  officer_assigned: { tone: "info", label: "Officer assigned", note: "Somebody has been sent." },
  confirmed_by_neighbours: { tone: "ok", label: "Confirmed by neighbours", note: "Several people independently." },
  seen_by_others: { tone: "pending", label: "Seen by others", note: "At least one neighbour agrees." },
  unverified: { tone: "pending", label: "Not yet checked", note: "Nobody has been out to look." },
};

export function VerificationBadge({ verification, disputed, showNote }) {
  const v = VERIFICATION[verification] || VERIFICATION.unverified;

  return (
    <span className="row" style={{ gap: "var(--s-2)" }}>
      <Badge tone={v.tone}>{v.label}</Badge>
      {/* Shown alongside rather than replacing it. A report three people
          confirm and two say is already fixed is genuinely ambiguous, and
          collapsing that into one label would hide the disagreement. */}
      {disputed && <Badge tone="warn">disputed</Badge>}
      {showNote && <span className="label">{v.note}</span>}
    </span>
  );
}
