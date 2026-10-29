import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "../../lib/api.js";
import { Label, Stat, Pill, KV, ErrorNote } from "../../components/Primitives.jsx";
import CityMap from "../../components/CityMap.jsx";
import ResponsibilitySpine, { buildChain } from "../../components/ResponsibilitySpine.jsx";
import { when } from "../../lib/format.js";

export default function ClusterDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [cluster, setCluster] = useState(null);
  const [brief, setBrief] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let live = true;
    api.cluster(id)
      .then((c) => { if (live) setCluster(c); return api.clusterBrief(id); })
      .then((b) => live && setBrief(b))
      .catch((e) => live && setError(e.message));
    return () => { live = false; };
  }, [id]);

  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (!cluster) return <div className="label">Loading</div>;

  return (
    <div>
      <button className="btn btn--quiet" onClick={() => navigate("/admin/clusters")}>← Groups</button>

      <header className="row row--between" style={{ marginTop: "var(--sp-3)", flexWrap: "wrap", gap: "var(--sp-3)" }}>
        <div>
          <Label>{cluster.ref} · hotspot</Label>
          <h1 className="display" style={{ marginTop: 4 }}>{cluster.category}</h1>
          <div className="label" style={{ marginTop: 4 }}>{cluster.location}</div>
        </div>
        <Pill tone={cluster.sla === "breached" ? "critical" : "high"}>SLA {cluster.sla}</Pill>
      </header>

      <div className="grid-stats" style={{ marginTop: "var(--sp-4)" }}>
        <Stat label="Reports" value={cluster.report_count} />
        <Stat label="Distinct citizens" value={cluster.citizen_count} note="deduplicated" />
        <Stat label="Radius" value={`${cluster.radius_m} m`} />
        <Stat label="Growth 48h" value={`+${cluster.trend_pct}%`} />
      </div>

      <div className="split" style={{ marginTop: "var(--sp-4)" }}>
        <div className="stack">
          <CityMap mode="density" clusters={[cluster]} complaints={cluster.reports} height={320} />

          <div className="card card--pad">
            <Label>Merged reports</Label>
            <div className="scroll-x" style={{ marginTop: "var(--sp-2)" }}>
            <table className="table table--stack">
              <thead>
                <tr><th>Ref</th><th>Citizen</th><th>Filed</th><th>Match</th></tr>
              </thead>
              <tbody>
                {cluster.reports.slice(0, 6).map((r) => (
                  <tr key={r.ref} data-clickable="true" onClick={() => navigate(`/admin/complaints/${r.ref}`)}>
                    <td data-label="Ref" className="mono">{r.ref}</td>
                    <td data-label="Citizen">{r.citizen_name || "Anonymous"}</td>
                    <td data-label="Filed" className="mono muted">{when(r.created_at)}</td>
                    <td data-label="Match" className="mono">{r.match_score}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
            {cluster.report_count > 6 && (
              <div className="label" style={{ marginTop: 10 }}>+{cluster.report_count - 6} more</div>
            )}
          </div>
        </div>

        <aside className="stack">
          <div className="card card--pad" style={{ borderLeft: "2px solid var(--accent)" }}>
            <Label>Group brief</Label>
            {!brief && <p className="label" style={{ marginTop: 8 }}>Writing</p>}
            {brief && (
              <>
                <p className="prose" style={{ marginTop: 8 }}>{brief.summary}</p>
                {brief.action && (
                  <div style={{ marginTop: "var(--sp-3)", paddingTop: "var(--sp-3)", borderTop: "1px solid var(--line)" }}>
                    <Label>Recommended</Label>
                    <div style={{ marginTop: 4 }}>{brief.action}</div>
                  </div>
                )}
                {brief.risk && <p className="prose" style={{ fontSize: "var(--fs-sm)", marginTop: "var(--sp-3)" }}>{brief.risk}</p>}
              </>
            )}
          </div>

          <div className="card card--pad">
            <Label>Responsibility</Label>
            <div style={{ marginTop: "var(--sp-3)" }}>
              <ResponsibilitySpine chain={buildChain(cluster.responsibility)} />
            </div>
          </div>

          <div className="card card--pad">
            <Label>Suggested officer</Label>
            <div className="title" style={{ marginTop: 6 }}>{cluster.suggested_officer.name}</div>
            <div style={{ marginTop: "var(--sp-3)" }}>
              <KV k="Distance" v={cluster.suggested_officer.distance} />
              <KV k="Open cases" v={cluster.suggested_officer.active_cases} />
              <KV k="SLA compliance" v={`${cluster.suggested_officer.sla}%`} />
            </div>
            <div className="row" style={{ marginTop: "var(--sp-3)" }}>
              <button className="btn" style={{ flex: 1 }}>Assign</button>
              <button className="btn btn--secondary" style={{ flex: 1 }}>Choose another</button>
            </div>
            <p className="label" style={{ marginTop: 10 }}>Overrides are logged.</p>
          </div>
        </aside>
      </div>
    </div>
  );
}
