import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell,
} from "recharts";

/* Chart colours come from the same earth-tone set as the rest of the UI.
   Recharts defaults are saturated and would look wrong here. */
const SERIES = ["#F45D22", "#0F1115", "#1D4ED8", "#047857", "#B45309", "#6B7280"];

const AXIS = { stroke: "#6B7280", fontSize: 11, fontFamily: "JetBrains Mono, monospace" };
const GRID = { stroke: "#E6E8EC", strokeDasharray: "0" };

const TOOLTIP = {
  contentStyle: {
    background: "#FFFFFF",
    border: "1px solid #E6E8EC",
    borderRadius: 10,
    fontSize: 12,
    fontFamily: "Inter, sans-serif",
    boxShadow: "0 4px 16px rgba(15,17,21,.08)",
  },
  cursor: { fill: "#F7F8FA" },
};

export function TrendChart({ data, xKey = "label", series }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: -18 }}>
        <CartesianGrid {...GRID} vertical={false} />
        <XAxis dataKey={xKey} {...AXIS} tickLine={false} axisLine={{ stroke: "#E6E8EC" }} minTickGap={24} />
        <YAxis {...AXIS} tickLine={false} axisLine={false} />
        <Tooltip {...TOOLTIP} />
        {series.map((s, i) => (
          <Line
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={s.label}
            stroke={SERIES[i % SERIES.length]}
            strokeWidth={2.25}
            dot={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

export function RankChart({ data, xKey = "label", valueKey = "value" }) {
  return (
    <ResponsiveContainer width="100%" height={Math.max(180, data.length * 32)}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
        <CartesianGrid {...GRID} horizontal={false} />
        <XAxis type="number" {...AXIS} tickLine={false} axisLine={false} />
        <YAxis type="category" dataKey={xKey} {...AXIS} width={130} tickLine={false} axisLine={false} />
        <Tooltip {...TOOLTIP} />
        <Bar dataKey={valueKey} fill={SERIES[0]} radius={[0, 6, 6, 0]} barSize={16} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function SplitChart({ data }) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="label" innerRadius={48} outerRadius={78} paddingAngle={1} stroke="#FFFFFF">
          {data.map((_, i) => (
            <Cell key={i} fill={SERIES[i % SERIES.length]} />
          ))}
        </Pie>
        <Tooltip {...TOOLTIP} />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function Legend({ items }) {
  return (
    <div className="row" style={{ flexWrap: "wrap", gap: 14, marginTop: 10 }}>
      {items.map((item, i) => (
        <span key={item} className="label" style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <i style={{ width: 9, height: 9, background: SERIES[i % SERIES.length], display: "block", borderRadius: 3 }} />
          {item}
        </span>
      ))}
    </div>
  );
}
