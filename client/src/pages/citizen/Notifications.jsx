import { useEffect, useState } from "react";
import { api } from "../../lib/api.js";
import { Loading, ErrorNote, Empty, Tile, Label } from "../../components/Primitives.jsx";
import { Icon } from "../../components/Icons.jsx";
import { when } from "../../lib/format.js";

const KIND_ICON = {
  received: Icon.file, analysed: Icon.scan, routed: Icon.route, assigned: Icon.user,
  work_started: Icon.clock, verify: Icon.check, resolved: Icon.check,
  reopened: Icon.alert, sla_breach: Icon.alert, escalated: Icon.alert,
};

export default function Notifications() {
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);

  const load = () =>
    api.notifications()
      .then((r) => { setItems(r.notifications); return api.markNotificationsRead(); })
      .catch((e) => setError(e.message));

  useEffect(() => { load(); }, []);

  if (error) return <ErrorNote onRetry={load}>{error}</ErrorNote>;
  if (!items) return <Loading />;

  if (!items.length) {
    return (
      <Empty
        icon={Icon.bell}
        title="No notifications yet"
        body="You'll be told when your report is analysed, routed, assigned, and when an officer says it is fixed."
      />
    );
  }

  return (
    <div className="fade-in">
      <h1 className="display d-md">Notifications</h1>

      <section className="card" style={{ marginTop: "var(--sp-5)", padding: "0 var(--sp-5)" }}>
        {items.map((n) => {
          const Ico = KIND_ICON[n.kind] || Icon.bell;
          return (
            <div key={n.id} className="listrow" style={{ alignItems: "flex-start" }}>
              <Tile icon={Ico} tone={n.read_at ? "" : "accent"} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="row row--between" style={{ gap: 12 }}>
                  <strong>{n.title}</strong>
                  <span className="label">{when(n.created_at)}</span>
                </div>
                <p className="prose" style={{ fontSize: 14, marginTop: 4 }}>{n.body}</p>
                {n.complaint_ref && <Label style={{ marginTop: 6 }}>{n.complaint_ref}</Label>}
              </div>
            </div>
          );
        })}
      </section>
    </div>
  );
}
