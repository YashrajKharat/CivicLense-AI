import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../lib/api.js";
import { Label, Pill, ErrorNote, Panel, PageHead, SkeletonRows, Badge } from "../../components/Primitives.jsx";

export default function Clusters() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  const load = () => api.clusters().then(setData).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  if (error) return <ErrorNote onRetry={load}>{error}</ErrorNote>;
  if (!data) return <SkeletonRows rows={5} height={64} />;

  return (
    <div>
      <Label>Grouped reports</Label>
      <h1 className="display" style={{ marginTop: 4 }}>Groups & hotspots</h1>
      <p className="prose" style={{ marginTop: 8 }}>
        Reports are grouped on five signals — distance, time, category, text similarity and image
        similarity — so forty-three citizens reporting one overflowing bin become one issue with
        forty-three witnesses rather than forty-three tickets.
      </p>

      <Panel title="All groups" flush>
      <div className="scroll-x">
      <table className="table table--stack">
        <thead>
          <tr>
            <th>Group</th><th>Issue</th><th>Reports</th><th>Citizens</th><th>Trend 48h</th><th>SLA</th>
          </tr>
        </thead>
        <tbody>
          {data.clusters.map((c) => (
            <tr key={c.ref} data-clickable="true" onClick={() => navigate(`/admin/clusters/${c.ref}`)}>
              <td data-label="Group" className="mono">{c.ref}</td>
              <td data-label="Issue">
                <div style={{ fontWeight: 500 }}>{c.category}</div>
                <div className="label">{c.location}</div>
              </td>
              <td data-label="Reports" className="mono">{c.report_count}</td>
              <td data-label="Citizens" className="mono">{c.citizen_count}</td>
              <td data-label="Trend" className="mono">+{c.trend_pct}%</td>
              <td data-label="SLA">
                <Pill tone={c.sla === "breached" ? "critical" : c.sla === "approaching" ? "high" : "resolved"}>
                  {c.sla}
                </Pill>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
      </Panel>

      <section style={{ marginTop: "var(--s-6)" }}>
        <Label>Emerging — flagged before they became hotspots</Label>
        <div className="grid-stats" style={{ marginTop: "var(--s-3)" }}>
          {data.emerging.map((e) => (
            <div key={e.area} className="card card--pad" style={{ borderLeft: "2px solid var(--high)" }}>
              <Label>{e.category}</Label>
              <div className="title" style={{ marginTop: 4 }}>{e.area}</div>
              <div className="mono" style={{ marginTop: 8, fontSize: "var(--fs-sm)" }}>{e.series.join(" → ")}</div>
              <div className="label" style={{ marginTop: 4 }}>over {e.days} days</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
