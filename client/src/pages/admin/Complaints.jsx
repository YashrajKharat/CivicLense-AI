import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../lib/api.js";
import IssueMap from "../../components/IssueMap.jsx";
import AssignOfficer from "../../components/AssignOfficer.jsx";
import Modal from "../../components/Modal.jsx";
import {
  ErrorNote, Badge, StatusBadge, SeverityBadge, Empty,
  PageHead, Thumb, Segment, SkeletonRows, Panel, Loading, Label,
} from "../../components/Primitives.jsx";
import { Icon } from "../../components/Icons.jsx";
import { ago } from "../../lib/format.js";

export default function Complaints() {
  // Open work by default. A queue that mixes finished and unfinished work is
  // not a queue — resolved complaints sat alongside live ones with a Reassign
  // button, and somebody sent an officer back to a job that was already done.
  // Closed work is still reachable through the status filter.
  const [filters, setFilters] = useState({
    status: "open", severity: "", ward: "", unassigned: "", overdue: "", q: "", sort: "newest",
  });
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [view, setView] = useState("list");
  const [assigning, setAssigning] = useState(null);
  const [batchModal, setBatchModal] = useState(false);
  const [batchBusy, setBatchBusy] = useState(false);
  const [batchResult, setBatchResult] = useState(null);
  const [batchError, setBatchError] = useState(null);
  const navigate = useNavigate();

  const load = useCallback(() => {
    api.adminComplaints(filters).then(setData).catch((e) => setError(e.message));
  }, [filters]);

  useEffect(() => { load(); }, [load]);

  const set = (key) => (value) => setFilters((f) => ({ ...f, [key]: value }));

  async function handleBatchAutoAssign() {
    setBatchBusy(true);
    setBatchError(null);
    try {
      const res = await api.autoAssignAll({ limit: 200 });
      setBatchResult(res);
      load();
    } catch (err) {
      setBatchError(err.message || "Batch assignment failed.");
    } finally {
      setBatchBusy(false);
    }
  }

  if (error) return <ErrorNote onRetry={load}>{error}</ErrorNote>;

  const rows = data?.complaints || [];
  const mappable = rows.filter(
    (r) => Number.isFinite(Number(r.lat)) && Number.isFinite(Number(r.lng))
  );
  const unassignedCount = rows.filter((r) => !r.assigned_officer).length;
  const overdueCount = rows.filter((r) => r.overdue).length;

  return (
    <div className="fade-in">
      <PageHead
        title="Complaints"
        sub={
          filters.status === "open"
            ? "Open complaints queue. Use the filters to refine by status, department, ward, or sort order."
            : "All municipal complaints matching selected filter criteria."
        }
        actions={
          <div className="row" style={{ gap: "var(--s-2)" }}>
            {unassignedCount > 0 && (
              <button
                className="btn btn--sm"
                style={{
                  background: "linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)",
                  color: "#ffffff",
                  border: "none",
                  boxShadow: "0 2px 8px rgba(99, 102, 241, 0.35)",
                  fontWeight: 600,
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                }}
                onClick={() => {
                  setBatchResult(null);
                  setBatchError(null);
                  setBatchModal(true);
                }}
                title="AI evaluates candidate officers' workload, ratings, speed and SLA to automatically assign all unassigned complaints"
              >
                <Icon.sparkle width={15} height={15} />
                AI Auto-Assign All ({unassignedCount})
              </button>
            )}
            <Segment
              value={view}
              onChange={setView}
              options={[{ id: "list", label: "List" }, { id: "map", label: "Map" }]}
            />
          </div>
        }
      />

      <div className="toolbar">
        <input
          className="input"
          style={{ width: 200 }}
          placeholder="Reference or address"
          value={filters.q}
          onChange={(e) => set("q")(e.target.value)}
        />
        <Select
          value={filters.sort}
          onChange={set("sort")}
          label="Sort order"
          options={[
            { value: "newest", label: "Newest first" },
            { value: "severity", label: "Severity priority" },
            { value: "deadline", label: "SLA deadline" },
            { value: "unassigned", label: "Unassigned first" },
          ]}
        />
        <Select value={filters.severity} onChange={set("severity")} label="Any severity"
          options={["critical", "high", "medium", "low"]} />
        <Select
          value={filters.status}
          onChange={set("status")}
          label="Everything"
          options={[
            { value: "open", label: "Open work" },
            { value: "ai_analysis", label: "Newly filed (AI Triage)" },
            { value: "submitted", label: "Submitted" },
            { value: "under_review", label: "Under review" },
            { value: "assigned", label: "Assigned" },
            { value: "work_started", label: "Work started" },
            { value: "verification", label: "Awaiting the resident" },
            { value: "resolved", label: "Resolved" },
            { value: "rejected", label: "Rejected" },
            { value: "reopened", label: "Reopened" },
          ]}
        />
        <Select value={filters.ward} onChange={set("ward")} label="Any ward" options={data?.wards || []} />

        <span className="toolbar__spacer" />
        <button
          className={filters.unassigned ? "btn btn--sm" : "btn btn--ghost btn--sm"}
          onClick={() => set("unassigned")(filters.unassigned ? "" : "true")}
        >
          Unassigned {unassignedCount > 0 && `(${unassignedCount})`}
        </button>
        <button
          className={filters.overdue ? "btn btn--sm" : "btn btn--ghost btn--sm"}
          onClick={() => set("overdue")(filters.overdue ? "" : "true")}
        >
          Past deadline {overdueCount > 0 && `(${overdueCount})`}
        </button>
      </div>

      {!data ? (
        <SkeletonRows rows={6} height={72} />
      ) : rows.length === 0 ? (
        <div style={{ marginTop: 20 }}>
          <Empty title="Nothing matches" body="Loosen the filters to see more." />
        </div>
      ) : view === "map" ? (
        <div style={{ marginTop: "var(--s-5)" }}>
          {/* Only rows that can actually be plotted. The list is not filtered on
              location — a complaint filed before coordinates were stored, or one
              whose geocoding failed, carries a null lat. Passing it to Leaflet
              throws and the error boundary takes the whole page, which is the
              blank "This page hit a problem" screen. */}
          {mappable.length === 0 ? (
            <Empty
              title="Nothing to plot"
              body="None of these complaints have a location recorded. Switch to the list view."
            />
          ) : (
          <IssueMap
            center={[mappable[0].lat, mappable[0].lng]}
            complaints={mappable}
            height={520}
            showClusters={false}
            showLayerToggle
            onSelect={(c) => navigate(`/admin/complaints/${c.ref}`)}
          />
          )}

          {mappable.length < rows.length && (
            <p className="label" style={{ marginTop: "var(--s-3)" }}>
              {rows.length - mappable.length} of {rows.length} have no location recorded and are
              not shown here.
            </p>
          )}
        </div>
      ) : (
        <Panel className="panel--table" title={`${rows.length} complaints`} flush>
          <table className="table table--stack table--wide">
            <thead>
              <tr>
                <th className="col-ref">Ref</th>
                <th>Issue</th>
                <th className="col-sev">Severity</th>
                <th className="col-status">Status</th>
                <th className="col-officer">Officer</th>
                <th className="col-when">Deadline</th>
                <th className="col-action" />
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.ref}>
                  <td data-label="Ref" className="mono">
                    <button className="link" onClick={() => navigate(`/admin/complaints/${c.ref}`)}>
                      {c.ref}
                    </button>
                  </td>
                  <td data-label="Issue">
                    <div className="cell-stack">
                      <Thumb src={c.image_url} alt="" fallback="—" />
                      <div>
                    <div className="truncate" style={{ fontWeight: 600 }}>{c.category}</div>
                    <div className="label truncate">
                      {c.address || `Ward ${c.ward_code}`}
                      {c.cluster_size > 1 && ` · ${c.cluster_size} in group`}
                    </div>
                      </div>
                    </div>
                  </td>
                  <td data-label="Severity"><SeverityBadge severity={c.severity} /></td>
                  <td data-label="Status">
                    <StatusBadge status={c.status} />
                    {c.rework_count > 0 && (
                      <Badge tone="warn">returned ×{c.rework_count}</Badge>
                    )}
                  </td>
                  <td data-label="Officer">
                    {c.officer || <span className="muted">— unassigned</span>}
                  </td>
                  <td data-label="Deadline">
                    <span style={{ color: c.overdue ? "var(--danger)" : "inherit" }}>
                      {c.overdue ? "overdue" : ago(c.sla_deadline)}
                    </span>
                  </td>
                  <td className="col-action" data-label="Action">
                    {/* A closed complaint has nothing to assign. Offering
                        "Reassign" on resolved work is how somebody ends up
                        sending an officer back to a job that was already done —
                        which is exactly what happened. */}
                    {["resolved", "rejected", "withdrawn"].includes(c.status) ? (
                      <span className="label">closed</span>
                    ) : (
                      <button className="btn btn--sm" onClick={() => setAssigning(c)}>
                        {c.assigned_officer ? "Reassign" : "Assign"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}

      {assigning && (
        <AssignOfficer
          complaint={assigning}
          onClose={() => setAssigning(null)}
          onDone={() => { setAssigning(null); load(); }}
        />
      )}

      {/* Batch AI Auto-Assign Modal */}
      {batchModal && (
        <Modal
          title="AI Batch Auto-Assignment Engine"
          subtitle={`Assign all ${unassignedCount} unassigned complaints across municipal departments using multi-factor AI matching`}
          onClose={() => { if (!batchBusy) { setBatchModal(false); setBatchResult(null); } }}
          width={680}
          footer={
            batchResult ? (
              <button
                className="btn btn--block"
                onClick={() => {
                  setBatchModal(false);
                  setBatchResult(null);
                }}
              >
                Done &amp; View Updated Queue
              </button>
            ) : (
              <div className="row row--between" style={{ width: "100%" }}>
                <button
                  className="btn btn--secondary"
                  onClick={() => setBatchModal(false)}
                  disabled={batchBusy}
                >
                  Cancel
                </button>
                <button
                  className="btn"
                  style={{
                    background: "linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)",
                    color: "#ffffff",
                    border: "none",
                  }}
                  onClick={handleBatchAutoAssign}
                  disabled={batchBusy}
                >
                  {batchBusy ? (
                    <div className="row" style={{ gap: "6px", alignItems: "center" }}>
                      <Loading /> AI Assigning {unassignedCount} cases…
                    </div>
                  ) : (
                    `Execute AI Auto-Assign (${unassignedCount} cases)`
                  )}
                </button>
              </div>
            )
          }
        >
          {batchError && <ErrorNote>{batchError}</ErrorNote>}

          {!batchResult ? (
            <div className="stack" style={{ gap: "var(--s-4)" }}>
              <div
                style={{
                  background: "var(--surface-2, #f8fafc)",
                  padding: "var(--s-4)",
                  borderRadius: "var(--r)",
                  border: "1px solid var(--border-soft, #e2e8f0)",
                }}
              >
                <h3 style={{ margin: "0 0 var(--s-2) 0", fontSize: "var(--t-sm)", fontWeight: 700 }}>
                  How the AI Assignment Engine Works:
                </h3>
                <p className="prose" style={{ fontSize: "var(--t-xs)", margin: "0 0 var(--s-3) 0", lineHeight: 1.6 }}>
                  The AI analyzes each unassigned complaint's department jurisdiction, incident urgency, and location. It dynamically evaluates every candidate officer across 5 dimensions:
                </p>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "var(--s-2)",
                    fontSize: "var(--t-xs)",
                  }}
                >
                  <div style={{ padding: "6px 10px", background: "var(--surface)", borderRadius: "var(--r)" }}>
                    <strong>1. Workload Capacity (30-35%):</strong> Prioritizes officers with low backlogs to balance workload.
                  </div>
                  <div style={{ padding: "6px 10px", background: "var(--surface)", borderRadius: "var(--r)" }}>
                    <strong>2. Citizen Rating (15-25%):</strong> Rewards officers with verified resident satisfaction.
                  </div>
                  <div style={{ padding: "6px 10px", background: "var(--surface)", borderRadius: "var(--r)" }}>
                    <strong>3. Turnaround Speed (20-25%):</strong> Evaluates operational days to resolution.
                  </div>
                  <div style={{ padding: "6px 10px", background: "var(--surface)", borderRadius: "var(--r)" }}>
                    <strong>4. SLA On-time Rate (15-20%):</strong> Assesses historical SLA adherence.
                  </div>
                </div>
                <p className="label" style={{ fontSize: "var(--t-xs)", marginTop: "var(--s-3)", color: "var(--brand)" }}>
                  ⚡ Dynamic Load Balancing: Caseloads are updated in real time during the run so no officer is overloaded.
                </p>
              </div>

              <div className="row row--between" style={{ padding: "var(--s-3)", background: "var(--surface)", borderRadius: "var(--r)" }}>
                <div>
                  <div className="label">Unassigned Queue</div>
                  <div className="num" style={{ fontSize: "var(--t-lg)", fontWeight: 700 }}>{unassignedCount} Cases</div>
                </div>
                <div>
                  <div className="label">Urgent / Critical</div>
                  <div className="num" style={{ fontSize: "var(--t-lg)", fontWeight: 700, color: "var(--danger)" }}>
                    {rows.filter((r) => !r.assigned_officer && (r.severity === "critical" || r.severity === "high")).length}
                  </div>
                </div>
                <div>
                  <div className="label">Action</div>
                  <span className="badge badge--ok">Ready to distribute</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="stack fade-in" style={{ gap: "var(--s-4)" }}>
              <div
                style={{
                  background: "var(--ok-bg, #ecfdf5)",
                  border: "1px solid var(--ok-line, #a7f3d0)",
                  borderRadius: "var(--r)",
                  padding: "var(--s-4)",
                  color: "var(--ok, #047857)",
                }}
              >
                <div className="row" style={{ gap: "var(--s-2)", alignItems: "center" }}>
                  <Icon.check width={20} height={20} />
                  <strong style={{ fontSize: "var(--t-md)" }}>
                    Successfully Assigned {batchResult.total_assigned} Complaints!
                  </strong>
                </div>
                <p style={{ margin: "4px 0 0 0", fontSize: "var(--t-xs)", color: "inherit" }}>
                  All unassigned cases have been routed to the optimal field officers with balanced workloads.
                </p>
              </div>

              {/* Department breakdown */}
              {batchResult.departments_summary?.length > 0 && (
                <div>
                  <div className="label">Departments Distributed:</div>
                  <div className="row row--wrap" style={{ gap: "var(--s-2)", marginTop: "var(--s-2)" }}>
                    {batchResult.departments_summary.map((d) => (
                      <span
                        key={d.department}
                        className="badge badge--info"
                        style={{ padding: "4px 10px", fontSize: "var(--t-xs)" }}
                      >
                        {d.department}: {d.count} {d.count === 1 ? "case" : "cases"}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Officers Summary table */}
              {batchResult.officers_summary?.length > 0 && (
                <div>
                  <div className="label">Assigned Officers &amp; Workload:</div>
                  <div className="scroll-x" style={{ maxHeight: 220, overflowY: "auto", marginTop: "var(--s-2)" }}>
                    <table className="table table--stack" style={{ fontSize: "var(--t-xs)" }}>
                      <thead>
                        <tr>
                          <th>Officer</th>
                          <th>Department</th>
                          <th>New Cases Assigned</th>
                          <th>Total Active Workload</th>
                        </tr>
                      </thead>
                      <tbody>
                        {batchResult.officers_summary.map((o) => (
                          <tr key={o.id}>
                            <td><strong>{o.name}</strong></td>
                            <td className="muted">{o.department}</td>
                            <td><Badge tone="ok">+{o.assigned_new_count}</Badge></td>
                            <td className="mono">{o.total_active_workload}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}

function Select({ value, onChange, label, options }) {
  // Accepts plain strings or { value, label } — the status filter needs real
  // wording ("Awaiting the resident" rather than "verification"), the others
  // are fine as they are.
  const items = options.map((o) =>
    typeof o === "string" ? { value: o, label: o.replace(/_/g, " ") } : o
  );

  return (
    <select
      className="input"
      style={{ width: "auto" }}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">{label}</option>
      {items.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

/**
 * Assignment is a deliberate act. The dialog shows current load and SLA record
 * for every candidate so the choice is informed, and only approved, active
 * officers appear — an unapproved account cannot be given work.
 */
