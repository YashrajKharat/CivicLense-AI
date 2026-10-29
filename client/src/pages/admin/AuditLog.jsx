import { useEffect, useState } from "react";
import { api } from "../../lib/api.js";
import { Label, ErrorNote, Panel, PageHead, SkeletonRows } from "../../components/Primitives.jsx";
import { when } from "../../lib/format.js";

export default function AuditLog() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  const load = () => api.auditLog().then((r) => setRows(r.entries)).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  if (error) return <ErrorNote onRetry={load}>{error}</ErrorNote>;
  if (!rows) return <SkeletonRows rows={8} height={44} />;

  return (
    <div>
      <Label>Append-only</Label>
      <h1 className="display" style={{ marginTop: 4 }}>Audit log</h1>

      <Panel title="Recent activity" flush>
      <div className="scroll-x">
      <table className="table table--stack">
        <thead>
          <tr><th>Time</th><th>Actor</th><th>Event</th><th>Action</th></tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td data-label="Time" className="mono muted">{when(r.at)}</td>
              <td data-label="Actor">{r.actor_name || "System"}</td>
              <td data-label="Event">{r.description}</td>
              <td data-label="Action" className="mono muted">{r.action}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
      </Panel>

      <p className="prose" style={{ marginTop: "var(--sp-4)" }}>
        Every state change writes here with actor, timestamp and prior value. No role, including
        global administrator, has permission to update or delete these rows.
      </p>
    </div>
  );
}
