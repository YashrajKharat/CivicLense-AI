import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase.js";
import { homeFor } from "../../lib/auth.jsx";
import { Loading, ErrorNote } from "../../components/Primitives.jsx";

/**
 * Where Google returns the user. Supabase parses the URL fragment itself, so we
 * only have to wait for the session to land and then route by role.
 */
export default function Callback() {
  const navigate = useNavigate();
  const [error, setError] = useState(null);

  useEffect(() => {
    let done = false;

    const finish = async (session) => {
      if (done || !session) return;
      done = true;

      // The profile row is created by a database trigger on auth.users, which
      // can land a moment after the session does.
      let role = "citizen";
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const { data } = await supabase.from("profiles").select("role").eq("id", session.user.id).maybeSingle();
        if (data?.role) { role = data.role; break; }
        await new Promise((r) => setTimeout(r, 400));
      }
      navigate(homeFor(role), { replace: true });
    };

    supabase.auth.getSession().then(({ data }) => finish(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => finish(session));

    const timeout = setTimeout(() => {
      if (!done) setError("Sign-in did not complete. Please try again.");
    }, 12_000);

    return () => { sub.subscription.unsubscribe(); clearTimeout(timeout); };
  }, [navigate]);

  if (error) {
    return (
      <div style={{ display: "grid", placeItems: "center", minHeight: "100vh", padding: 24 }}>
        <div style={{ maxWidth: 380 }}>
          <ErrorNote onRetry={() => navigate("/signin", { replace: true })}>{error}</ErrorNote>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", placeItems: "center", minHeight: "100vh" }}>
      <Loading label="Signing you in" />
    </div>
  );
}
