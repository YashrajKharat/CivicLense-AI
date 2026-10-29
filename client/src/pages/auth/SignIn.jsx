import { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth, homeFor } from "../../lib/auth.jsx";
import { ErrorNote } from "../../components/Primitives.jsx";
import AuthShell, { Field } from "./AuthShell.jsx";
import GoogleButton, { OrDivider } from "../../components/GoogleButton.jsx";

export default function SignIn() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { data, error: err } = await signIn(email, password);
    if (err) {
      setError("That email and password did not match an account.");
      setBusy(false);
      return;
    }
    navigate(location.state?.from || homeFor(data.user?.user_metadata?.role || "citizen"), { replace: true });
  }

  return (
    <AuthShell
      title="Welcome back"
      sub="Log in to keep tracking your reports."
      footer={<>Don't have an account? <Link to="/register" className="link">Sign up</Link></>}
    >
      <GoogleButton label="Continue with Google" onError={setError} />
      <OrDivider />

      <form onSubmit={submit} className="stack-4">
        <Field label="Email" type="email" value={email} onChange={setEmail} placeholder="you@example.com" autoComplete="email" required />

        <div style={{ position: "relative" }}>
          <Field
            label="Password"
            type={show ? "text" : "password"}
            value={password}
            onChange={setPassword}
            placeholder="••••••••"
            autoComplete="current-password"
            required
          />
          <button
            type="button"
            className="btn--quiet"
            style={{ position: "absolute", right: 6, bottom: 6, padding: "6px 10px", fontSize: 13 }}
            onClick={() => setShow((v) => !v)}
          >
            {show ? "Hide" : "Show"}
          </button>
        </div>

        {error && <ErrorNote>{error}</ErrorNote>}

        <button className="btn btn--block" disabled={busy}>{busy ? "Signing in…" : "Log in"}</button>
      </form>

      <p className="prose" style={{ fontSize: 13, marginTop: "var(--sp-4)" }}>
        Officer and administrator accounts are created by your department, not through this form.
      </p>
    </AuthShell>
  );
}
