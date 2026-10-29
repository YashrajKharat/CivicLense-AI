import { Link } from "react-router-dom";
import { Icon } from "../../components/Icons.jsx";

/**
 * A visually distinct entrance for staff.
 *
 * Deliberately not the resident sign-in with an extra checkbox. Someone landing
 * here should be able to tell within a second that this is the official portal
 * and not the public app — dark, sparse, and stating the access rule up front
 * rather than after a failed submission.
 */
export default function GovShell({ title, sub, children, footer, badge = "Government portal" }) {
  return (
    <div
      className="hero on-dark"
      style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: "var(--sp-5)" }}
    >
      <div className="hero__inner" style={{ width: "100%", maxWidth: 430 }}>
        <Link to="/" className="row" style={{ gap: 10, marginBottom: "var(--sp-6)" }}>
          <span
            style={{
              width: 34, height: 34, borderRadius: 9, background: "var(--accent)",
              color: "#fff", display: "grid", placeItems: "center",
              fontFamily: "var(--display)", fontWeight: 900, fontSize: 13,
            }}
          >
            CP
          </span>
          <span className="display" style={{ fontSize: 17, color: "#fff" }}>CivicLense</span>
        </Link>

        <span
          className="row"
          style={{
            display: "inline-flex", gap: 7, padding: "5px 12px", borderRadius: "var(--r-pill)",
            border: "1px solid var(--ink-line)", color: "var(--accent)",
            fontSize: "var(--t-xs)", fontWeight: 600,
          }}
        >
          <Icon.shield width={13} height={13} />
          {badge}
        </span>

        <h1 className="display d-lg" style={{ marginTop: 16, color: "#fff" }}>{title}</h1>
        <p className="lede" style={{ marginTop: 10, fontSize: "var(--t-base)" }}>{sub}</p>

        <div
          className="card"
          style={{
            marginTop: "var(--sp-5)", padding: "var(--sp-5)",
            background: "var(--ink-800)", borderColor: "var(--ink-line)", color: "var(--on-dark)",
          }}
        >
          {children}
        </div>

        {footer && (
          <div style={{ marginTop: "var(--sp-4)", textAlign: "center", color: "var(--on-dark-2)", fontSize: "var(--t-sm)" }}>
            {footer}
          </div>
        )}

        <p
          className="label"
          style={{ marginTop: "var(--sp-5)", textAlign: "center", color: "var(--on-dark-2)" }}
        >
          Residents report issues at <Link to="/signin" className="link">the public app</Link>
        </p>
      </div>
    </div>
  );
}

export function GovField({ label, value, onChange, hint, ...rest }) {
  return (
    <label className="field" style={{ display: "block" }}>
      <span className="label" style={{ color: "var(--on-dark-2)" }}>{label}</span>
      <input
        className="input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ background: "var(--ink-900)", borderColor: "var(--ink-line)", color: "var(--on-dark)" }}
        {...rest}
      />
      {hint && (
        <span style={{ display: "block", marginTop: 6, fontSize: "var(--t-xs)", color: "var(--on-dark-2)" }}>
          {hint}
        </span>
      )}
    </label>
  );
}

export function GovSelect({ label, value, onChange, children }) {
  return (
    <label className="field" style={{ display: "block" }}>
      <span className="label" style={{ color: "var(--on-dark-2)" }}>{label}</span>
      <select
        className="input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ background: "var(--ink-900)", borderColor: "var(--ink-line)", color: "var(--on-dark)" }}
      >
        {children}
      </select>
    </label>
  );
}
