import { useEffect, useState, useCallback, useRef } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api.js";
import { Icon } from "./Icons.jsx";
import { when } from "../lib/format.js";

export default function NotificationBell() {
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);

  // A panel that only closes via the button it opened from is a trap on mobile,
  // where the button is often under a thumb and off-screen.
  useEffect(() => {
    if (!open) return;

    const onPointer = (e) => {
      if (!boxRef.current?.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => e.key === "Escape" && setOpen(false);

    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const load = useCallback(() => {
    api.notifications()
      .then((r) => { setItems(r.notifications); setUnread(r.unread); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 45_000);
    return () => clearInterval(id);
  }, [load]);

  async function toggle() {
    const next = !open;
    setOpen(next);
    // The badge clears immediately, but the read/unread split on screen is kept
    // until the panel is closed — otherwise everything greys out under the
    // cursor before it has been read.
    if (next && unread > 0) {
      await api.markNotificationsRead().catch(() => {});
      setUnread(0);
    }
    if (!next) load();
  }

  return (
    <div style={{ position: "relative" }} ref={boxRef}>
      <button
        className="btn--quiet"
        onClick={toggle}
        aria-label={unread ? `${unread} unread notifications` : "Notifications"}
        style={{ position: "relative", padding: 8 }}
      >
        <Icon.bell />
        {unread > 0 && (
          <span
            style={{
              position: "absolute", top: 5, right: 5, width: 8, height: 8,
              borderRadius: "50%", background: "var(--accent)", border: "2px solid var(--bg)",
            }}
          />
        )}
      </button>

      {open && (
        <div
          className="card fade-in"
          style={{
            position: "absolute", right: 0, top: "calc(100% + 8px)", width: 340,
            maxHeight: 420, overflowY: "auto", zIndex: 60, boxShadow: "var(--shadow-lg)",
          }}
        >
          <div className="row row--between" style={{ padding: "14px 16px", borderBottom: "1px solid var(--line)" }}>
            <strong style={{ fontSize: 14 }}>Notifications</strong>
            <Link to="/app/notifications" className="link" style={{ fontSize: 13 }} onClick={() => setOpen(false)}>
              See all
            </Link>
          </div>

          {items.length === 0 && (
            <p className="prose" style={{ fontSize: "var(--t-sm)", padding: "var(--s-4)", margin: 0 }}>
              Updates on your reports will appear here.
            </p>
          )}

          {/* Unread first and visibly separated. A flat list means the one thing
              that changed since you last looked is buried among twenty that did
              not. */}
          {[
            { key: "unread", label: "New", rows: items.filter((n) => !n.read_at) },
            { key: "read", label: "Earlier", rows: items.filter((n) => n.read_at) },
          ]
            .filter((g) => g.rows.length)
            .map((group) => (
              <section key={group.key}>
                <div
                  className="row row--between"
                  style={{
                    padding: "8px var(--s-4)",
                    background: "var(--surface-2)",
                    borderBottom: "1px solid var(--line)",
                    position: "sticky",
                    top: 0,
                  }}
                >
                  <span className="label">{group.label}</span>
                  <span className="label">{group.rows.length}</span>
                </div>

                {group.rows.slice(0, 12).map((n) => (
                  <div
                    key={n.id}
                    style={{
                      padding: "var(--s-3) var(--s-4)",
                      borderBottom: "1px solid var(--line)",
                      background: n.read_at ? "transparent" : "var(--accent-50)",
                    }}
                  >
                    <div className="row row--between" style={{ gap: "var(--s-3)" }}>
                      <strong style={{ fontSize: "var(--t-sm)" }}>{n.title}</strong>
                      <span className="label" style={{ flex: "none" }}>{when(n.created_at)}</span>
                    </div>
                    <p style={{ margin: "4px 0 0", fontSize: "var(--t-sm)", color: "var(--text-2)" }}>
                      {n.body}
                    </p>
                    {n.complaint_ref && (
                      <span className="label mono" style={{ marginTop: 4, display: "block" }}>
                        {n.complaint_ref}
                      </span>
                    )}
                  </div>
                ))}
              </section>
            ))}
        </div>
      )}
    </div>
  );
}
