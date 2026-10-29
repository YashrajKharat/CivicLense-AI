import { STATUS_LABEL } from "./Primitives.jsx";

const ORDER = [
  "submitted", "ai_analysis", "under_review", "accepted", "assigned",
  "work_started", "work_completed", "verification", "resolved",
];

export default function StatusTimeline({ current, history = [] }) {
  const index = ORDER.indexOf(current);
  const byStatus = Object.fromEntries(history.map((h) => [h.to_status, h]));

  return (
    <ol style={{ listStyle: "none", margin: 0, padding: "0 0 0 24px", position: "relative" }}>
      <span style={{ position: "absolute", left: 5, top: 10, bottom: 12, width: 2, background: "var(--line)" }} />

      {ORDER.map((status, i) => {
        const done = i <= index;
        const active = i === index;
        const entry = byStatus[status];

        return (
          <li key={status} style={{ position: "relative", padding: "7px 0" }}>
            <span
              style={{
                position: "absolute", left: -24, top: 12, width: 12, height: 12, borderRadius: "50%",
                background: active ? "var(--accent)" : done ? "var(--text)" : "var(--surface)",
                border: `2px solid ${active ? "var(--accent)" : done ? "var(--text)" : "var(--line-firm)"}`,
                boxShadow: active ? "0 0 0 4px var(--accent-100)" : "none",
              }}
            />
            <div style={{ color: done ? "var(--text)" : "var(--muted)", fontWeight: active ? 600 : 400, fontSize: 14 }}>
              {STATUS_LABEL[status]}
            </div>
            {entry && (
              <div className="label" style={{ marginTop: 2 }}>
                {new Date(entry.at).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                {entry.actor_name ? ` · ${entry.actor_name}` : ""}
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
