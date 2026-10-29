import {
  ResponsiveContainer, LineChart, BarChart, Line, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";
import { Panel, Label, Badge } from "./Primitives.jsx";

/**
 * One section of a report: chart, figures, and the sentence that goes with them.
 *
 * The sentence is a template filled from the same query that drew the chart, so
 * it cannot contradict what is above it. A model writing prose around numbers
 * eventually writes a sentence the numbers do not support, and doing that in a
 * document carrying a municipality's name is not a risk worth taking for a
 * paragraph.
 */

const SERIES_COLOURS = ["#1B3A5C", "#E8500F", "#0F7A52", "#A15C09"];

const axis = {
  stroke: "var(--muted)",
  fontSize: 11,
  tickLine: false,
  axisLine: { stroke: "var(--line)" },
};

export default function ReportSection({ section }) {
  if (section.error) {
    return (
      <Panel title={section.title}>
        <p className="prose" style={{ fontSize: "var(--t-sm)" }}>
          This section could not be built: {section.error}
        </p>
      </Panel>
    );
  }

  const { chart } = section;
  const rows = chart?.x.map((label, i) => {
    const row = { label };
    chart.series.forEach((s) => { row[s.name] = s.values[i]; });
    return row;
  }) || [];

  const Chart = chart?.style === "line" ? LineChart : BarChart;

  return (
    <Panel title={section.title}>
      {section.stats?.length > 0 && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(auto-fit, minmax(120px, 1fr))`,
            gap: "var(--s-4)",
            marginBottom: "var(--s-5)",
          }}
        >
          {section.stats.map((s) => (
            <div key={s.label}>
              <Label>{s.label}</Label>
              <div
                className="num"
                style={{
                  fontSize: "var(--t-lg)",
                  marginTop: 2,
                  color: s.alert ? "var(--danger)" : "var(--text)",
                }}
              >
                {s.value}
              </div>
            </div>
          ))}
        </div>
      )}

      {rows.length > 0 && (
        <div style={{ width: "100%", height: 240 }}>
          <ResponsiveContainer>
            <Chart data={rows} margin={{ top: 4, right: 8, bottom: 0, left: -18 }}>
              <CartesianGrid stroke="var(--line)" vertical={false} />
              <XAxis dataKey="label" {...axis} interval="preserveStartEnd" />
              <YAxis {...axis} allowDecimals={false} width={38} />
              <Tooltip
                cursor={{ fill: "var(--surface-2)" }}
                contentStyle={{
                  border: "1px solid var(--line)",
                  borderRadius: "var(--r)",
                  fontSize: "var(--t-xs)",
                  boxShadow: "var(--sh-2)",
                }}
              />
              {chart.series.length > 1 && <Legend wrapperStyle={{ fontSize: 11 }} />}

              {chart.series.map((s, i) =>
                chart.style === "line" ? (
                  <Line
                    key={s.name}
                    type="monotone"
                    dataKey={s.name}
                    stroke={SERIES_COLOURS[i % SERIES_COLOURS.length]}
                    strokeWidth={2}
                    dot={false}
                  />
                ) : (
                  <Bar
                    key={s.name}
                    dataKey={s.name}
                    fill={SERIES_COLOURS[i % SERIES_COLOURS.length]}
                    radius={[3, 3, 0, 0]}
                    maxBarSize={38}
                  />
                )
              )}
            </Chart>
          </ResponsiveContainer>
        </div>
      )}

      {section.narrative && (
        <p className="prose" style={{ fontSize: "var(--t-sm)", marginTop: "var(--s-4)" }}>
          {section.narrative}
        </p>
      )}

      {section.table?.length > 0 && (
        <details style={{ marginTop: "var(--s-4)" }}>
          <summary className="label" style={{ cursor: "pointer" }}>
            The figures behind this
          </summary>
          <div className="scroll-x" style={{ marginTop: "var(--s-3)" }}>
            <table className="table table--stack">
              <thead>
                <tr>
                  {Object.keys(section.table[0]).map((k) => (
                    <th key={k}>{k.replace(/_/g, " ")}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {section.table.map((row, i) => (
                  <tr key={i}>
                    {Object.entries(row).map(([k, v]) => (
                      <td key={k} data-label={k.replace(/_/g, " ")}>
                        {typeof v === "number" ? <span className="mono">{v}</span> : String(v ?? "—")}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </Panel>
  );
}
