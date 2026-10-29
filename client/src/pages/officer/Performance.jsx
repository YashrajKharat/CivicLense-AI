import { useEffect, useState } from "react";
import { api } from "../../lib/api.js";
import { Label, Stat, Meter, ErrorNote } from "../../components/Primitives.jsx";
import { TrendChart } from "../../components/Charts.jsx";

export default function Performance() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const load = () => api.officerPerformance().then(setData).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  if (error) return <ErrorNote onRetry={load}>{error}</ErrorNote>;
  if (!data) return <div className="label">Loading</div>;

  return (
    <div>
      <Label>Your record</Label>
      <h1 className="display" style={{ marginTop: 4 }}>Performance</h1>

      <div className="grid-stats" style={{ marginTop: "var(--sp-4)" }}>
        <Stat label="Open cases" value={data.open_cases} />
        <Stat label="Resolved" value={data.resolved} tone="ok" />
        <Stat label="Average days" value={data.avg_days ?? "—"} />
        <Stat label="Resident rating" value={data.rating ?? "—"} note="out of 5" />
      </div>

      <div className="card card--pad" style={{ marginTop: "var(--sp-4)" }}>
        <div className="row row--between">
          <Label>SLA compliance</Label>
          <span className="mono">{data.sla ?? "—"}%</span>
        </div>
        <div style={{ marginTop: 8 }}>
          <Meter value={data.sla ?? 0} tone={data.sla > 90 ? "ok" : data.sla > 80 ? "high" : "critical"} />
        </div>
        <p className="prose" style={{ fontSize: "var(--fs-sm)", marginTop: "var(--sp-3)" }}>
          Measured against each complaint's own deadline, which varies by severity. Jobs sent back to
          another department are excluded.
        </p>
      </div>

      <div className="card card--pad" style={{ marginTop: "var(--sp-4)" }}>
        <Label>Resolved per week</Label>
        <div style={{ marginTop: "var(--sp-3)" }}>
          <TrendChart data={data.weekly} xKey="week" series={[{ key: "resolved", label: "Resolved" }]} />
        </div>
      </div>
    </div>
  );
}
