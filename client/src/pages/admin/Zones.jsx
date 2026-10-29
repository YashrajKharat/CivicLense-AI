import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../lib/api.js";
import {
  Panel, Badge, Label, ErrorNote, SkeletonRows, PageHead, Empty, SeverityBadge,
} from "../../components/Primitives.jsx";
import AssignOfficer from "../../components/AssignOfficer.jsx";
import { Icon } from "../../components/Icons.jsx";

/**
 * Work zones — one visit, one officer, everything within a radius.
 *
 * The complaints list schedules by report. That sends three officers to the
 * same hundred metres when a street has a pothole, an overflowing bin and a
 * dead streetlight: each does one job and drives past the other two.
 *
 * A zone is the same data cut by place instead of category. Assigning one
 * assigns every open report inside it.
 */
export default function Zones() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [assigning, setAssigning] = useState(null);
  const [onlyUnassigned, setOnlyUnassigned] = useState(false);
  const navigate = useNavigate();

  const load = () =>
    api.zones(onlyUnassigned ? { unassigned: "true" } : {})
      .then(setData)
      .catch((e) => setError(e.message));

  useEffect(() => { load(); }, [onlyUnassigned]);

  async function rebuild() {
    setBusy(true);
    try {
      await api.rebuildZones(250);
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (error && !data) return <ErrorNote onRetry={load}>{error}</ErrorNote>;

  const zones = data?.zones || [];

  return (
    <div className="fade-in">
      <PageHead
        title="Work zones"
        sub={data?.ordering}
        actions={
          <div className="row" style={{ gap: "var(--s-2)" }}>
            <button
              className="choice"
              aria-pressed={onlyUnassigned}
              onClick={() => setOnlyUnassigned((v) => !v)}
            >
              Unassigned only
            </button>
            <button className="btn btn--secondary btn--sm" onClick={rebuild} disabled={busy}>
              {busy ? "Rebuilding…" : "Rebuild"}
            </button>
          </div>
        }
      />

      {!data ? (
        <SkeletonRows rows={4} height={130} />
      ) : zones.length === 0 ? (
        <Empty
          icon={Icon.map}
          title="No open work to group"
          body="Zones are built from open reports. Rebuild after new ones arrive."
          action={<button className="btn" onClick={rebuild}>Rebuild zones</button>}
        />
      ) : (
        <div className="stack">
          {zones.map((z) => (
            <Panel
              key={z.ref}
              title={`${z.ward_name || z.ward_code} · ${z.open_count} open`}
              action={
                <div className="row" style={{ gap: "var(--s-2)" }}>
                  <SeverityBadge severity={z.top_severity} />
                  {z.department_count > 1 && (
                    <Badge tone="warn">{z.department_count} departments</Badge>
                  )}
                  {z.officer ? (
                    <Badge tone="ok">{z.officer}</Badge>
                  ) : (
                    <Badge tone="pending">unassigned</Badge>
                  )}
                </div>
              }
            >
              <div className="row row--wrap" style={{ gap: "var(--s-4)" }}>
                <span className="label">priority {z.priority_score}</span>
                <span className="label">within {z.radius_m} m</span>
                <span className="ref">{z.ref}</span>
              </div>

              {/* What the officer will actually find. Without this a zone is an
                  abstraction, and nobody dispatches against an abstraction. */}
              <div style={{ marginTop: "var(--s-4)" }}>
                {(z.items || []).slice(0, 6).map((item) => (
                  <button
                    key={item.ref}
                    className="listrow listrow--link"
                    onClick={() => navigate(`/admin/complaints/${item.ref}`)}
                  >
                    <SeverityBadge severity={item.severity} />
                    <span style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
                      <span className="truncate" style={{ display: "block", fontSize: "var(--t-sm)" }}>
                        {item.category}
                      </span>
                      <span className="label">{item.department}</span>
                    </span>
                    {item.overdue && <Badge tone="danger">overdue</Badge>}
                  </button>
                ))}
                {(z.items || []).length > 6 && (
                  <p className="label" style={{ marginTop: "var(--s-2)" }}>
                    and {z.items.length - 6} more in this zone
                  </p>
                )}
              </div>

              <div className="row" style={{ marginTop: "var(--s-4)", gap: "var(--s-3)" }}>
                <button className="btn btn--sm" onClick={() => setAssigning(z)}>
                  {z.officer ? "Reassign the zone" : `Assign all ${z.open_count}`}
                </button>
                {z.department_count > 1 && (
                  <span className="label">
                    Spans {z.department_count} departments — one visit covers all of them.
                  </span>
                )}
              </div>
            </Panel>
          ))}
        </div>
      )}

      {assigning && (
        <AssignOfficer
          complaint={{
            ref: assigning.ref,
            category: `${assigning.open_count} reports in ${assigning.ward_name || assigning.ward_code}`,
            address: `within ${assigning.radius_m} m`,
          }}
          onClose={() => setAssigning(null)}
          // The zone assigns every report inside it in one call, so it does the
          // assigning rather than letting the picker assign a single complaint.
          onAssign={(officerId) => api.assignZone(assigning.ref, officerId)}
          onDone={() => { setAssigning(null); load(); }}
        />
      )}
    </div>
  );
}
