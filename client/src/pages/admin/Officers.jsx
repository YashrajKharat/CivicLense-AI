import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../lib/api.js";
import { Icon } from "../../components/Icons.jsx";
import {
  Panel, Badge, ErrorNote, SkeletonRows, Empty, Label, PageHead,
} from "../../components/Primitives.jsx";

export default function Officers() {
  const navigate = useNavigate();
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);

  const load = () =>
    api.officers().then((r) => setRows(r.officers)).catch((e) => setError(e.message));

  useEffect(() => { load(); }, []);

  if (error) return <ErrorNote onRetry={load}>{error}</ErrorNote>;
  if (!rows) return <SkeletonRows rows={4} height={64} />;

  if (!rows.length) {
    return (
      <Empty
        icon={Icon.user}
        title="No officers yet"
        body="Approve a staff request and the officer appears here with their caseload."
      />
    );
  }

  const average = rows.reduce((a, o) => a + o.active_cases, 0) / rows.length;
  const overloaded = rows.filter((o) => o.active_cases > average * 2);

  return (
    <div className="fade-in">
      <PageHead
        title="Officers"
        sub={`${rows.length} approved · ${Math.round(average)} open cases on average · click a name for their full record`}
      />

      {overloaded.length > 0 && (
        <div
          className="row"
          style={{
            gap: "var(--s-3)", padding: "var(--s-4)", marginBottom: "var(--s-4)",
            background: "var(--warn-bg)", border: "1px solid var(--warn-line)",
            borderRadius: "var(--r)", color: "var(--warn)",
          }}
        >
          <Icon.alert width={16} height={16} />
          <span style={{ fontSize: "var(--t-sm)" }}>
            {overloaded.map((o) => o.name).join(", ")} {overloaded.length === 1 ? "is" : "are"} carrying
            more than twice the department average. New work is routed elsewhere.
          </span>
        </div>
      )}

      <Panel title="Caseload and record" flush>
        <div className="scroll-x">
          <table className="table table--stack">
            <thead>
              <tr>
                <th>Officer</th><th>Contact</th><th>Department</th><th>Open</th>
                <th>Closed</th><th>On time</th><th>Rating</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((o) => (
                <tr
                  key={o.id}
                  onClick={() => navigate(`/admin/officers/${o.id}`)}
                  style={{ cursor: "pointer" }}
                >
                  <td data-label="Officer">
                    <div className="row" style={{ gap: "var(--s-2)" }}>
                      <span className="link" style={{ fontWeight: 600 }}>{o.name}</span>
                      <Icon.arrow width={13} height={13} style={{ color: "var(--muted)" }} />
                    </div>
                    {o.distance && <div className="label">{o.distance} away</div>}
                  </td>
                  <td data-label="Contact" onClick={(e) => e.stopPropagation()}>
                    <a href={`mailto:${o.email}`} className="link mono" style={{ fontSize: "var(--t-xs)" }}>
                      {o.email}
                    </a>
                    {o.work_phone && <div className="label mono">{o.work_phone}</div>}
                  </td>
                  <td data-label="Department" className="muted">{o.department}</td>
                  <td data-label="Open">
                    <span className="mono" style={{ fontWeight: 600 }}>{o.active_cases}</span>
                    {o.active_cases > average * 2 && <Badge tone="warn">heavy</Badge>}
                  </td>
                  <td data-label="Closed" className="mono">{o.resolved_cases}</td>
                  <td data-label="On time">
                    <Badge tone={o.sla > 90 ? "ok" : o.sla > 80 ? "warn" : "danger"}>
                      {o.sla ?? "—"}%
                    </Badge>
                  </td>
                  <td data-label="Rating" className="mono">{o.rating || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <p className="label" style={{ marginTop: "var(--s-4)" }}>
        On-time is measured against each complaint's own deadline, which varies by severity.
        Jobs sent back to another department are excluded.
      </p>
    </div>
  );
}
