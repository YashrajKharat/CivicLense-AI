import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../lib/api.js";
import {
  Panel, Badge, Label, ErrorNote, SkeletonRows, Segment, Empty,
} from "../../components/Primitives.jsx";
import { Icon } from "../../components/Icons.jsx";

/**
 * Who is doing the work, on both sides.
 *
 * Two rankings measuring different things, and the basis of each is printed
 * rather than left to be guessed:
 *
 * Residents rank on points from verified contributions, not report count. A
 * duplicate earns nothing and confirming a fix earns more than filing one, so
 * the person at the top is the one who helped most, not the one who filed most.
 *
 * Officers rank on closing within each complaint's own deadline, not on how
 * many they closed. Volume is a decision somebody else made when they assigned
 * the work; being on time is the officer's.
 */
export default function Leaderboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState("residents");

  useEffect(() => {
    api.leaderboard().then(setData).catch((e) => setError(e.message));
  }, []);

  if (error) return <ErrorNote>{error}</ErrorNote>;

  const rows = data?.[tab] || [];

  return (
    <div className="container" style={{ padding: "var(--s-7) var(--s-5) var(--s-9)", maxWidth: 820 }}>
      <div style={{ marginBottom: "var(--s-4)" }}>
        <Link to="/app" className="btn--quiet">← Dashboard</Link>
      </div>
      <div className="eyebrow">Open record</div>
      <h1 className="display d-lg" style={{ marginTop: "var(--s-3)" }}>Who is doing the work</h1>

      <div style={{ marginTop: "var(--s-5)" }}>
        <Segment
          value={tab}
          onChange={setTab}
          options={[
            { id: "residents", label: "Residents" },
            { id: "officers", label: "Officers" },
          ]}
        />
      </div>

      {data && (
        <p className="prose" style={{ marginTop: "var(--s-4)" }}>{data.basis[tab]}</p>
      )}

      {!data ? (
        <div style={{ marginTop: "var(--s-5)" }}><SkeletonRows rows={6} height={64} /></div>
      ) : rows.length === 0 ? (
        <div style={{ marginTop: "var(--s-5)" }}>
          <Empty
            icon={Icon.user}
            title={tab === "officers" ? "No officer qualifies yet" : "Nobody on the board yet"}
            body={
              tab === "officers"
                ? "An officer appears here after closing five reports — one job closed on time is not a record."
                : "Points come from filing reports that are acted on, and confirming fixes."
            }
          />
        </div>
      ) : (
        <Panel title={tab === "residents" ? "Residents" : "Officers"} flush style={{ marginTop: "var(--s-5)" }}>
          <div className="scroll-x">
            <table className="table table--stack">
              <thead>
                {tab === "residents" ? (
                  <tr>
                    <th style={{ width: 48 }}>#</th><th>Resident</th><th>Points</th>
                    <th>Badges</th><th>Reports</th><th>Confirmed</th>
                  </tr>
                ) : (
                  <tr>
                    <th style={{ width: 48 }}>#</th><th>Officer</th><th>On time</th>
                    <th>Resolved</th><th>Avg days</th><th>Rating</th>
                  </tr>
                )}
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.id}>
                    <td data-label="#">
                      <span className="mono" style={{ fontWeight: i < 3 ? 600 : 400 }}>
                        {r.position ?? i + 1}
                      </span>
                    </td>

                    <td data-label={tab === "residents" ? "Resident" : "Officer"}>
                      <div className="row" style={{ gap: "var(--s-2)" }}>
                        {r.avatar_url && (
                          <img src={r.avatar_url} alt="" className="avatar avatar--photo" style={{ width: 26, height: 26 }} />
                        )}
                        <span style={{ fontWeight: 600 }}>{r.full_name}</span>
                      </div>
                      {r.department && <div className="label">{r.department}</div>}
                    </td>

                    {tab === "residents" ? (
                      <>
                        <td data-label="Points" className="mono">{r.points}</td>
                        <td data-label="Badges">
                          {r.badges > 0 ? <Badge tone="accent">{r.badges}</Badge> : <span className="label">—</span>}
                        </td>
                        <td data-label="Reports" className="mono">{r.reports}</td>
                        <td data-label="Confirmed" className="mono">{r.confirmations}</td>
                      </>
                    ) : (
                      <>
                        <td data-label="On time">
                          <Badge tone={r.on_time_rate >= 90 ? "ok" : r.on_time_rate >= 75 ? "warn" : "danger"}>
                            {r.on_time_rate ?? "—"}%
                          </Badge>
                        </td>
                        <td data-label="Resolved" className="mono">{r.resolved}</td>
                        <td data-label="Avg days" className="mono">{r.avg_days ?? "—"}</td>
                        <td data-label="Rating">
                          {r.rating ? (
                            <span style={{ color: "var(--warn)" }}>{"★".repeat(Math.round(r.rating))}</span>
                          ) : (
                            <span className="label">no reviews</span>
                          )}
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      {tab === "officers" && rows.length > 0 && (
        <p className="label" style={{ marginTop: "var(--s-4)" }}>
          An officer with work sent back by residents will show a lower rating even where the
          on-time figure looks good — closing quickly and closing properly are different things.
        </p>
      )}
    </div>
  );
}
