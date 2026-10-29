import { useEffect, useState } from "react";
import { api } from "../../lib/api.js";
import { Label, Stat, ErrorNote, Panel, PageHead, Segment, SkeletonStats } from "../../components/Primitives.jsx";
import { TrendChart, RankChart, SplitChart, Legend } from "../../components/Charts.jsx";

const RANGES = [7, 30, 90, 365];

export default function Analytics() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const load = (d = days) => {
    setData(null);
    api.analytics(d).then(setData).catch((e) => setError(e.message));
  };
  useEffect(() => { load(days); }, [days]);

  if (error) return <ErrorNote onRetry={() => load()}>{error}</ErrorNote>;

  return (
    <div>
      <div className="row row--between" style={{ flexWrap: "wrap", gap: "var(--sp-3)" }}>
        <div>
          <Label>Performance</Label>
          <h1 className="display" style={{ marginTop: 4 }}>Analytics</h1>
        </div>
        <Segment
          value={days}
          onChange={setDays}
          options={RANGES.map((d) => ({ id: d, label: d === 365 ? "1 year" : `${d}d` }))}
        />
      </div>

      {!data ? (
        <div style={{ marginTop: "var(--s-4)" }}><SkeletonStats /></div>
      ) : (
        <>
          <div className="grid-stats" style={{ marginTop: "var(--sp-4)" }}>
            <Stat label="Resolution rate" value={`${data.health.resolution_rate ?? 0}%`} tone="ok" />
            <Stat label="SLA compliance" value={`${data.health.sla_compliance ?? 0}%`} />
            <Stat label="Average days to close" value={data.health.avg_days ?? "—"} />
            <Stat label="Reopened" value={data.health.reopened} tone="high" note="citizen rejected the fix" />
          </div>

          <Panel title="Filed against resolved" style={{ marginTop: "var(--s-4)" }}>
            <div>
              <TrendChart
                data={data.daily}
                series={[{ key: "filed", label: "Filed" }, { key: "resolved", label: "Resolved" }]}
              />
            </div>
            <Legend items={["Filed", "Resolved"]} />
            <p className="prose" style={{ fontSize: "var(--t-sm)", marginTop: "var(--s-4)" }}>
              A widening gap between the two lines means intake is outrunning capacity, regardless of
              how good the resolution rate looks in isolation.
            </p>
          </Panel>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--sp-4)", marginTop: "var(--sp-4)" }}>
            <section className="card card--pad">
              <Label>By category</Label>
              <div style={{ marginTop: "var(--sp-3)" }}>
                <RankChart data={data.by_category} />
              </div>
            </section>

            <section className="card card--pad">
              <Label>By ward</Label>
              <div style={{ marginTop: "var(--sp-3)" }}>
                <RankChart data={data.by_ward} />
              </div>
            </section>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--sp-4)", marginTop: "var(--sp-4)" }}>
            <section className="card card--pad">
              <Label>Time to resolve</Label>
              <div style={{ marginTop: "var(--sp-3)" }}>
                <SplitChart
                  data={[
                    { label: "Within a day", value: data.resolution_time.within_day },
                    { label: "1–3 days", value: data.resolution_time.within_three },
                    { label: "3–7 days", value: data.resolution_time.within_week },
                    { label: "Over a week", value: data.resolution_time.beyond_week },
                  ]}
                />
              </div>
              <Legend items={["Within a day", "1–3 days", "3–7 days", "Over a week"]} />
            </section>

            <section className="card card--pad">
              <Label>Citizen verification</Label>
              <div className="grid-stats" style={{ marginTop: "var(--sp-3)" }}>
                <Stat label="Confirmed fixed" value={data.feedback.confirmed ?? 0} tone="ok" />
                <Stat label="Disputed" value={data.feedback.disputed ?? 0} tone="critical" />
                <Stat label="Average rating" value={data.feedback.avg_rating ?? "—"} />
              </div>
              <p className="prose" style={{ fontSize: "var(--fs-sm)", marginTop: "var(--sp-3)" }}>
                Disputed closures are the number worth watching. A department can hit its SLA while
                residents keep saying the problem is still there.
              </p>
            </section>
          </div>
        </>
      )}
    </div>
  );
}
