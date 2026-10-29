import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "./supabase.js";
import { api, SESSION_LOST } from "./api.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (!data.session) setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      if (!next) {
        setProfile(null);
        setLoading(false);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // A token that cannot be refreshed means the session is genuinely gone —
  // signed out on another device, or revoked. Clearing it here sends the person
  // to sign in instead of leaving them clicking buttons that quietly fail.
  useEffect(() => {
    const onLost = () => { supabase.auth.signOut().catch(() => {}); setSession(null); setProfile(null); };
    window.addEventListener(SESSION_LOST, onLost);
    return () => window.removeEventListener(SESSION_LOST, onLost);
  }, []);

  useEffect(() => {
    if (!session) return;
    let live = true;
    api.me()
      .then((r) => live && setProfile(r.profile))
      .catch(() => live && setProfile(null))
      .finally(() => live && setLoading(false));
    return () => { live = false; };
  }, [session]);

  const value = {
    session,
    profile,
    loading,
    role: profile?.role ?? null,
    signIn: (email, password) => supabase.auth.signInWithPassword({ email, password }),
    signInWithGoogle: () =>
      supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          queryParams: { access_type: "offline", prompt: "consent" },
        },
      }),
    signUp: (email, password, fullName) =>
      supabase.auth.signUp({ email, password, options: { data: { full_name: fullName } } }),
    signOut: () => supabase.auth.signOut(),
    refresh: () => api.me().then((r) => setProfile(r.profile)),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
};

/** Where each role lands after signing in. */
export const homeFor = (role) =>
  ({ citizen: "/app", officer: "/officer", super_admin: "/admin", global_admin: "/admin" }[role] || "/app");
