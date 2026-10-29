import { Link } from "react-router-dom";
import { Logo } from "../../components/Primitives.jsx";
import { Icon } from "../../components/Icons.jsx";

const PROMISES = [
  { icon: Icon.pin, text: "Your GPS pin and ward are attached automatically" },
  { icon: Icon.shield, text: "Every status change is logged and visible to you" },
  { icon: Icon.trend, text: "Nothing closes until you confirm it is actually fixed" },
];

/**
 * Split screen on desktop: the argument on the left, the form on the right.
 * On a phone the marketing panel is dropped entirely — someone who reached a
 * login screen on mobile wants the form, not a second pitch above the fold.
 */
export default function AuthShell({ title, sub, children, footer }) {
  return (
    <div
      className="authsplit"
      style={{ minHeight: "100vh", display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1.05fr)" }}
    >
      <aside
        className="hero on-dark authsplit__aside"
        style={{ padding: "var(--sp-6)", display: "flex", flexDirection: "column" }}
      >
        <div className="hero__inner" style={{ display: "flex", flexDirection: "column", flex: 1 }}>
          <Link to="/"><Logo dark /></Link>

          <div style={{ margin: "auto 0" }}>
            <h1 className="display d-lg" style={{ color: "#fff" }}>
              Your city,<br />one photo away.
            </h1>
            <p className="lede" style={{ marginTop: 18 }}>
              Report a problem in under a minute. We work out what it is, which department owns it,
              and who is contractually responsible for fixing it.
            </p>

            <ul style={{ listStyle: "none", padding: 0, margin: "34px 0 0", display: "grid", gap: 14 }}>
              {PROMISES.map((p) => (
                <li key={p.text} className="row">
                  <span className="tile tile--dark"><p.icon /></span>
                  <span style={{ color: "var(--on-dark-2)" }}>{p.text}</span>
                </li>
              ))}
            </ul>
          </div>

          <span className="label">© 2026 CivicLense · built for residents</span>
        </div>
      </aside>

      <main style={{ display: "grid", placeItems: "center", padding: "var(--sp-5) var(--sp-4)", background: "var(--bg)" }}>
        <div style={{ width: "100%", maxWidth: 400 }}>
          <Link to="/" className="authsplit__mobilehead" style={{ display: "none", marginBottom: "var(--sp-5)" }}>
            <Logo />
          </Link>

          <h2 className="display d-md">{title}</h2>
          <p className="prose" style={{ marginTop: 8 }}>{sub}</p>

          <div style={{ marginTop: "var(--sp-5)" }}>{children}</div>

          {footer && (
            <div style={{ marginTop: "var(--sp-4)", textAlign: "center", color: "var(--muted)", fontSize: 14 }}>
              {footer}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export function Field({ label, value, onChange, hint, ...rest }) {
  return (
    <label className="field">
      <span className="label">{label}</span>
      <input className="input" value={value} onChange={(e) => onChange(e.target.value)} {...rest} />
      {hint && <span className="prose" style={{ fontSize: 12, marginTop: 6, display: "block" }}>{hint}</span>}
    </label>
  );
}
