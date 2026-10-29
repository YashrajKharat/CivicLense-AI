import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase.js";
import { api } from "../../lib/api.js";
import { ErrorNote } from "../../components/Primitives.jsx";
import GovShell, { GovField } from "./GovShell.jsx";

const GOV = /@([a-z0-9-]+\.)*(gov\.in|nic\.in)$/i;

export default function GovLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  async function submit(e) {
    e.preventDefault();

    setBusy(true);
    setError(null);

    const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (err) {
      setError("That email and password did not match a staff account.");
      setBusy(false);
      return;
    }

    // Route by what the account actually is, not by what it asked for.
    try {
      const { profile } = await api.me();
      if (profile.role === "global_admin" || profile.role === "super_admin") navigate("/admin", { replace: true });
      else if (profile.role === "officer") navigate("/officer", { replace: true });
      else navigate("/gov/status", { replace: true });
    } catch {
      navigate("/gov/status", { replace: true });
    }
  }

  return (
    <GovShell
      title="Staff sign in"
      sub="For officers, department administrators and the municipal command centre."
      footer={<>No account yet? <Link to="/gov/register" className="link">Request access</Link></>}
    >
      <form onSubmit={submit} className="stack-4">
        <GovField
          label="Government email"
          type="email"
          value={email}
          onChange={setEmail}
          placeholder="name@department.gov.in"
          autoComplete="email"
          required
        />

        <div style={{ position: "relative" }}>
          <GovField
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
            onClick={() => setShow((v) => !v)}
            style={{
              position: "absolute", right: 10, bottom: 9, fontSize: "var(--t-xs)",
              color: "var(--on-dark-2)", padding: 4,
            }}
          >
            {show ? "Hide" : "Show"}
          </button>
        </div>

        {error && <ErrorNote>{error}</ErrorNote>}

        <button className="btn btn--block" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <p style={{ marginTop: "var(--sp-4)", fontSize: "var(--t-xs)", color: "var(--on-dark-2)", lineHeight: 1.6 }}>
        Access is granted by a global administrator, never by registering. Every action you take
        here is recorded against your name in an audit log that cannot be edited.
      </p>
    </GovShell>
  );
}
