import { useState, useEffect } from "react";
import { NavLink, Outlet, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../lib/auth.jsx";
import { Logo } from "./Primitives.jsx";
import { Icon } from "./Icons.jsx";
import NotificationBell from "./NotificationBell.jsx";

const initials = (name = "") =>
  name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase() || "?";

/**
 * One shell for all three roles. The nav array differs; the chrome does not.
 *
 * Desktop  — persistent sidebar.
 * Phone    — the sidebar becomes a drawer and the four most-used destinations
 *            move to a bottom tab bar, because a drawer you must open before
 *            every navigation is the wrong primary nav on a phone.
 */
export default function AppShell({ nav, scopeLabel, tip, searchPlaceholder = "Search reports, addresses…" }) {
  const { profile, signOut } = useAuth();
  const [q, setQ] = useState("");
  const [drawer, setDrawer] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  // Navigating should always dismiss the drawer, including via browser back.
  useEffect(() => { setDrawer(false); }, [location.pathname]);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && setDrawer(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    document.body.style.overflow = drawer ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [drawer]);

  function search(e) {
    e.preventDefault();
    const ref = q.trim().toUpperCase();
    if (/^CP-\d+$/.test(ref)) navigate(`/admin/complaints/${ref}`);
  }

  const tabs = nav.slice(0, 4);

  return (
    <div className="shell">
      <div className="drawer-backdrop" data-open={drawer} onClick={() => setDrawer(false)} aria-hidden="true" />

      <aside className="sidebar" data-open={drawer}>
        <div className="row row--between">
          <Logo dark size={32} />
          <button
            className="btn--quiet mobile-only"
            onClick={() => setDrawer(false)}
            aria-label="Close menu"
            style={{ color: "var(--on-dark-2)" }}
          >
            ✕
          </button>
        </div>

        <nav className="sidebar__nav">
          {nav.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className="navlink">
              <item.icon />
              <span className="navlabel">{item.label}</span>
              {item.dot && <i className="navlink__dot" />}
            </NavLink>
          ))}
        </nav>

        {tip && (
          <div
            className="sidebar__foot"
            style={{
              marginTop: "auto", background: "var(--ink-800)", border: "1px solid var(--ink-line)",
              borderRadius: "var(--r)", padding: 16,
            }}
          >
            <div className="row" style={{ color: "var(--accent)", gap: 8 }}>
              <Icon.bulb width={15} height={15} />
              <span className="label" style={{ color: "var(--accent)" }}>{tip.title}</span>
            </div>
            <p style={{ margin: "8px 0 0", fontSize: 13, color: "var(--on-dark-2)" }}>{tip.body}</p>
          </div>
        )}
      </aside>

      <div style={{ minWidth: 0 }}>
        <header className="topbar">
          <button
            className="btn--quiet mobile-only"
            onClick={() => setDrawer(true)}
            aria-label="Open menu"
            aria-expanded={drawer}
            style={{ padding: 8 }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          </button>

          <form className="search" onSubmit={search}>
            <Icon.search width={17} height={17} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={searchPlaceholder} aria-label="Search" />
          </form>

          <div className="row" style={{ marginLeft: "auto", gap: 6 }}>
            {scopeLabel && <span className="label desktop-only">{scopeLabel}</span>}
            <NotificationBell />
            <button className="btn--quiet" onClick={signOut} title="Sign out" aria-label="Sign out" style={{ padding: 8 }}>
              <Icon.logout />
            </button>
            {/* The photograph if there is one, initials otherwise. The API has
                returned avatar_url since profiles gained photos; nothing read
                it, so uploading one appeared to do nothing at all. */}
            {profile?.avatar_url ? (
              <img
                src={profile.avatar_url}
                alt=""
                title={profile?.full_name}
                className="avatar avatar--photo"
              />
            ) : (
              <span className="avatar" title={profile?.full_name}>{initials(profile?.full_name)}</span>
            )}
          </div>
        </header>

        <main className="page">
          <Outlet />
        </main>
      </div>

      <nav className="tabbar" aria-label="Primary">
        {tabs.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.end}>
            <item.icon width={20} height={20} />
            <span>{item.label}</span>
          </NavLink>
        ))}
        <button
          onClick={() => setDrawer(true)}
          style={{
            flex: 1, display: "flex", flexDirection: "column", alignItems: "center",
            gap: 4, padding: "9px 0 10px", fontSize: 11, color: "var(--muted)",
          }}
        >
          <Icon.grid width={20} height={20} />
          <span>More</span>
        </button>
      </nav>
    </div>
  );
}
