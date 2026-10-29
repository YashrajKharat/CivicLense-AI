import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../lib/auth.jsx";
import { LANGUAGES, useT } from "../../lib/i18n.jsx";
import { ErrorNote, Label } from "../../components/Primitives.jsx";
import AuthShell, { Field } from "./AuthShell.jsx";
import GoogleButton, { OrDivider } from "../../components/GoogleButton.jsx";

export default function Register() {
  const { signUp } = useAuth();
  const { lang, setLang } = useT();
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  const set = (key) => (value) => setForm((f) => ({ ...f, [key]: value }));

  async function submit(e) {
    e.preventDefault();
    if (form.password.length < 8) return setError("Use at least eight characters for your password.");

    setBusy(true);
    setError(null);
    const { error: err } = await signUp(form.email, form.password, form.name);
    if (err) {
      setError(err.message?.includes("already")
        ? "An account with that email already exists."
        : "Registration did not complete. Check your details and try again.");
      setBusy(false);
      return;
    }
    navigate("/app", { replace: true });
  }

  return (
    <AuthShell
      title="Create account"
      sub="You only need this to track your reports and confirm fixes."
      footer={<>Already registered? <Link to="/signin" className="link">Log in</Link></>}
    >
      <GoogleButton label="Sign up with Google" onError={setError} />
      <OrDivider />

      <form onSubmit={submit} className="stack-4">
        <Field label="Full name" value={form.name} onChange={set("name")} placeholder="Iffat Khan" required />
        <Field label="Email" type="email" value={form.email} onChange={set("email")} placeholder="you@example.com" autoComplete="email" required />
        <Field
          label="Password"
          type="password"
          value={form.password}
          onChange={set("password")}
          placeholder="At least 8 characters"
          autoComplete="new-password"
          required
        />

        <div>
          <Label>Preferred language</Label>
          <div className="row" style={{ gap: 8, marginTop: 8 }}>
            {LANGUAGES.map((l) => (
              <button
                type="button"
                key={l.code}
                className={lang === l.code ? "btn btn--sm" : "btn btn--ghost btn--sm"}
                onClick={() => setLang(l.code)}
              >
                {l.label}
              </button>
            ))}
          </div>
          <p className="prose" style={{ fontSize: 13, marginTop: 8 }}>
            You write in this language. Officers read a translation; your original wording is kept.
          </p>
        </div>

        {error && <ErrorNote>{error}</ErrorNote>}

        <button className="btn btn--block" disabled={busy}>{busy ? "Creating account…" : "Create account"}</button>
      </form>
    </AuthShell>
  );
}
