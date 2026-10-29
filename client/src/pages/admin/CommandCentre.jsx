import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../lib/api.js";
import { useRealtime } from "../../lib/useRealtime.js";
import CityMap from "../../components/CityMap.jsx";
import AskAssistant from "./AskAssistant.jsx";
import { Icon } from "../../components/Icons.jsx";
import {
  Panel, StatBar, Live, Badge, SeverityBadge, ErrorNote, SkeletonRows, Segment, Empty,
} from "../../components/Primitives.jsx";
import { num } from "../../lib/format.js";

const MODES = [
  { id: "complaints", label: "Pins" },
  { id: "clusters", label: "Groups" },
  { id: "density", label: "Density" },
];

export default function CommandCentre() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [mode, setMode] = useState("complaints");
  const navigate = useNavigate();

  const load = useCallback(() => {
    api.overview().then(setData).catch((e) => setError(e.message));
  }, []);

  useEffect(() => { load(); }, [load]);

  // A command centre left open on a wall display has to stay current.
  useRealtime("complaints", { event: "INSERT", onChange: load });

  if (error) return <ErrorNote onRetry={load}>{error}</ErrorNote>;

  const s = data?.stats;

  return (
    <div className="fade-in">
      <header className="page-head">
        <div className="page-head__text">
          <div className="row" style={{ gap: "var(--s-3)", marginBottom: 6 }}>
            <Live>Mumbai · all departments</Live>
            <span className="label">
              {new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long" })}
            </span>
          </div>
          <h1 className="display d-md">Command centre</h1>
        </div>

        {s?.sla_breached > 0 && (
          <Badge tone="danger">
            <Icon.alert width={13} height={13} /> {s.sla_breached} past deadline
          </Badge>
        )}
      </header>

      <div style={{ marginBottom: "var(--s-5)" }}>
        <AskAssistant />
      </div>

      {!data ? (
        <SkeletonRows rows={2} height={96} />
      ) : (
        <>
          <StatBar
            items={[
              { label: "Complaints", value: num(s.total), note: `+${s.today} today`, icon: Icon.file },
              { label: "Critical open", value: s.critical, note: `${s.sla_breached} past SLA`, icon: Icon.alert, alert: s.critical > 0 },
              { label: "Active hotspots", value: s.hotspots, note: `${s.emerging} emerging`, icon: Icon.map },
              { label: "Resolution rate", value: `${s.resolution_rate ?? 0}%`, note: "30-day", icon: Icon.check },
            ]}
          />

          <div className="cc-grid" style={{ marginTop: "var(--s-4)" }}>
            <Panel
              className="mappanel"
              title="Live map"
              action={<Segment value={mode} onChange={setMode} options={MODES} />}
              flush
            >
              <CityMap
                mode={mode}
                complaints={data.map.complaints}
                clusters={data.map.clusters}
                wards={data.map.wards}
                height={520}
                onSelectCluster={(c) => navigate(`/admin/clusters/${c.ref}`)}
                onSelectComplaint={(c) => navigate(`/admin/complaints/${c.ref}`)}
              />
            </Panel>

            <div className="stack">
              <Panel
                title="Escalations"
                action={
                  <button className="btn--quiet" onClick={() => navigate("/admin/clusters")}>
                    All groups
                  </button>
                }
                list
              >
                {data.escalations.length === 0 ? (
                  <p className="prose" style={{ fontSize: "var(--t-sm)", padding: "var(--s-4) 0" }}>
                    Nothing escalated. Groups appear here as they grow.
                  </p>
                ) : (
                  data.escalations.map((c) => (
                    <button
                      key={c.ref}
                      className="railrow"
                      onClick={() => navigate(`/admin/clusters/${c.ref}`)}
                    >
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span className="truncate" style={{ display: "block", fontWeight: 600, fontSize: "var(--t-sm)" }}>
                          {c.category}
                        </span>
                        <span className="label">{c.ref} · {c.location}</span>
                      </span>
                      <span className="mono" style={{ fontSize: "var(--t-md)", fontWeight: 600 }}>
                        {c.report_count}
                      </span>
                    </button>
                  ))
                )}
              </Panel>

              <Panel title="Department load" list>
                {data.departments.map((d) => (
                  <div key={d.name} className="railrow" style={{ display: "block" }}>
                    <div className="row row--between">
                      <span style={{ fontSize: "var(--t-sm)" }}>{d.name}</span>
                      <span className="mono label">{d.open} open</span>
                    </div>
                    <div className="railrow__bar">
                      <i
                        style={{
                          width: `${Math.max(2, d.load)}%`,
                          background:
                            d.load > 85 ? "var(--danger)" : d.load > 55 ? "var(--warn)" : "var(--accent)",
                        }}
                      />
                    </div>
                  </div>
                ))}
              </Panel>

              <Panel
                title="Waiting on a human"
                foot={
                  <button className="btn btn--secondary btn--sm btn--block" onClick={() => navigate("/admin/review")}>
                    Open review queue
                  </button>
                }
              >
                <div className="row" style={{ gap: "var(--s-4)" }}>
                  <span className="tile tile--accent"><Icon.scan /></span>
                  <div>
                    <div className="mono" style={{ fontSize: "var(--t-lg)", fontWeight: 600 }}>
                      {s.flagged_images}
                    </div>
                    <p className="prose" style={{ fontSize: "var(--t-xs)", marginTop: 2 }}>
                      images the analysis could not vouch for. None rejected automatically.
                    </p>
                  </div>
                </div>
              </Panel>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
