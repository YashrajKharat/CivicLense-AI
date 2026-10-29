import { useEffect, useState } from "react";
import { api } from "../../lib/api.js";
import { Label, Pill, Meter, ErrorNote, Panel, PageHead, StatBar, SkeletonRows } from "../../components/Primitives.jsx";
import { Icon } from "../../components/Icons.jsx";

export default function Contracts() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const load = () => api.contracts().then(setData).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  if (error) return <ErrorNote onRetry={load}>{error}</ErrorNote>;
  if (!data) return <SkeletonRows rows={4} height={110} />;

  return (
    <div>
      <Label>Registry · maintained by department administrators</Label>
      <h1 className="display" style={{ marginTop: 4 }}>Contract intelligence</h1>
      <p className="prose" style={{ marginTop: 8 }}>
        Contracts are entered by authorised staff, not scraped from public sources. Complaints are
        matched to them by ward, asset and scope, which turns a pile of reports into a performance
        record for each agency.
      </p>

      <StatBar
        items={[
          { label: "Active contracts", value: data.stats.active, icon: Icon.building },
          { label: "Expiring in 90 days", value: data.stats.expiring, icon: Icon.clock },
          { label: "With open complaints", value: data.stats.with_open, icon: Icon.file },
          { label: "Breaching SLA", value: data.stats.breaching, icon: Icon.alert, alert: data.stats.breaching > 0 },
        ]}
      />

      <div className="stack" style={{ marginTop: "var(--sp-4)" }}>
        {data.contracts.map((c) => (
          <article key={c.contract_no} className="card card--pad">
            <div className="row row--between" style={{ flexWrap: "wrap", gap: "var(--sp-3)" }}>
              <div>
                <div className="mono label">{c.contract_no}</div>
                <div className="title" style={{ marginTop: 4 }}>{c.scope}</div>
                <div className="muted" style={{ fontSize: "var(--fs-sm)", marginTop: 2 }}>{c.agency}</div>
              </div>
              <Pill tone={c.status === "expiring" ? "high" : "resolved"}>{c.status}</Pill>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(110px,1fr))", gap: "var(--sp-4)", marginTop: "var(--sp-4)" }}>
              {[
                ["Coverage", c.coverage],
                ["Term", `${c.starts_on} — ${c.ends_on}`],
                ["Linked", c.linked],
                ["Resolved", c.resolved],
                ["Overdue", c.overdue],
              ].map(([k, v]) => (
                <div key={k}>
                  <Label>{k}</Label>
                  <div className="mono" style={{ fontSize: "var(--fs-sm)", marginTop: 4, color: k === "Overdue" && v > 10 ? "var(--critical)" : undefined }}>
                    {v}
                  </div>
                </div>
              ))}
            </div>

            <div style={{ marginTop: "var(--sp-3)" }}>
              <Meter value={(c.resolved / c.linked) * 100} tone="ok" />
              <div className="label" style={{ marginTop: 6 }}>
                {Math.round((c.resolved / c.linked) * 100)}% of linked complaints closed
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
