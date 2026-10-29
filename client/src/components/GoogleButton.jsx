import { useState } from "react";
import { useAuth } from "../lib/auth.jsx";

/** Official four-colour mark. Google's brand terms require it not be recoloured. */
function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#4285F4" d="M45.1 24.5c0-1.6-.1-3.2-.4-4.7H24v8.9h11.8c-.5 2.7-2 5.1-4.4 6.6v5.5h7.1c4.2-3.8 6.6-9.5 6.6-16.3" />
      <path fill="#34A853" d="M24 46c6 0 11-2 14.6-5.4l-7.1-5.5c-2 1.3-4.5 2.1-7.5 2.1-5.8 0-10.7-3.9-12.4-9.941H4.3v5.7C7.9 41.1 15.4 46 24 46" />
      <path fill="#FBBC05" d="M11.6 27.3c-.4-1.3-.7-2.7-.7-4.1s.3-2.8.7-4.1v-5.7H4.3A21.9 21.9 0 0 0 2 23.2c0 3.6.9 6.9 2.3 9.8z" />
      <path fill="#EA4335" d="M24 10.7c3.3 0 6.2 1.1 8.5 3.3l6.3-6.3C35 4.1 30 2 24 2 15.4 2 7.9 6.9 4.3 14.1l7.3 5.7C13.3 14.6 18.2 10.7 24 10.7" />
    </svg>
  );
}

export default function GoogleButton({ onError, label = "Continue with Google" }) {
  const { signInWithGoogle } = useAuth();
  const [busy, setBusy] = useState(false);

  async function go() {
    setBusy(true);
    const { error } = await signInWithGoogle();
    if (error) {
      onError?.("Google sign-in could not start. Try email instead.");
      setBusy(false);
    }
    // On success the browser leaves for Google, so there is nothing to reset.
  }

  return (
    <button type="button" className="btn btn--white btn--block" onClick={go} disabled={busy}>
      <GoogleMark />
      {busy ? "Redirecting…" : label}
    </button>
  );
}

export function OrDivider() {
  return (
    <div className="row" style={{ gap: 14, margin: "var(--sp-4) 0" }}>
      <span style={{ flex: 1, height: 1, background: "var(--line)" }} />
      <span className="label">or</span>
      <span style={{ flex: 1, height: 1, background: "var(--line)" }} />
    </div>
  );
}
