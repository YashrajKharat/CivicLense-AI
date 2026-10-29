import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../lib/api.js";
import { Icon } from "../../components/Icons.jsx";
import {
  Panel, Badge, ErrorNote, SkeletonRows, Empty, PageHead, Stat, Pill, Segment,
} from "../../components/Primitives.jsx";

const DEPT_ICONS = {
  ROADS: Icon.barrier,
  SWM: Icon.trash,
  WATER: Icon.drop,
  DRAIN: Icon.drop,
  LIGHT: Icon.bulb,
  TRAFFIC: Icon.cone,
  HEALTH: Icon.shield,
  FSSAI: Icon.scan,
  GARDEN: Icon.sparkle,
  ENCROACH: Icon.building,
  TRIAGE: Icon.clipboard,
};

const DEPT_COLORS = {
  ROADS: "var(--brand, #2563eb)",
  SWM: "#16a34a",
  WATER: "#0284c7",
  DRAIN: "#0d9488",
  LIGHT: "#eab308",
  TRAFFIC: "#f97316",
  HEALTH: "#dc2626",
  FSSAI: "#9333ea",
  GARDEN: "#059669",
  ENCROACH: "#64748b",
  TRIAGE: "#6366f1",
};

export default function Departments() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [authorityFilter, setAuthorityFilter] = useState("all");
  const [caseloadFilter, setCaseloadFilter] = useState("all");
  const [viewMode, setViewMode] = useState("detailed"); // 'detailed' | 'grid'
  const [expandedDepts, setExpandedDepts] = useState({});
  const [officerSort, setOfficerSort] = useState("workload"); // 'workload' | 'rating' | 'sla' | 'name'

  const load = () => {
    api.departments()
      .then((res) => {
        setData(res);
        // Expand all departments by default
        const initialExpanded = {};
        res.departments?.forEach((d) => {
          initialExpanded[d.id] = true;
        });
        setExpandedDepts(initialExpanded);
      })
      .catch((e) => setError(e.message));
  };

  useEffect(() => {
    load();
  }, []);

  const toggleExpand = (id) => {
    setExpandedDepts((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const expandAll = () => {
    const next = {};
    data?.departments?.forEach((d) => { next[d.id] = true; });
    setExpandedDepts(next);
  };

  const collapseAll = () => {
    setExpandedDepts({});
  };

  // Filtered departments
  const filteredDepartments = useMemo(() => {
    if (!data?.departments) return [];
    return data.departments.filter((d) => {
      // Search term
      const term = search.toLowerCase().trim();
      const matchesSearch =
        !term ||
        d.name?.toLowerCase().includes(term) ||
        d.code?.toLowerCase().includes(term) ||
        d.authority?.toLowerCase().includes(term) ||
        d.head_name?.toLowerCase().includes(term) ||
        d.categories?.some((c) => c.name.toLowerCase().includes(term)) ||
        d.officers?.some(
          (o) =>
            o.name?.toLowerCase().includes(term) ||
            o.email?.toLowerCase().includes(term) ||
            o.designation?.toLowerCase().includes(term) ||
            o.employee_id?.toLowerCase().includes(term)
        );

      // Authority filter
      const matchesAuthority =
        authorityFilter === "all" || d.authority?.toLowerCase() === authorityFilter.toLowerCase();

      // Caseload filter
      let matchesCaseload = true;
      if (caseloadFilter === "heavy") matchesCaseload = Number(d.open_complaints) > 5;
      if (caseloadFilter === "breached") matchesCaseload = Number(d.sla_breached) > 0;
      if (caseloadFilter === "contracts") matchesCaseload = Number(d.active_contracts_count) > 0;

      return matchesSearch && matchesAuthority && matchesCaseload;
    });
  }, [data, search, authorityFilter, caseloadFilter]);

  // Unique authorities for filter
  const authorities = useMemo(() => {
    if (!data?.departments) return [];
    const set = new Set(data.departments.map((d) => d.authority).filter(Boolean));
    return Array.from(set);
  }, [data]);

  if (error) return <ErrorNote onRetry={load}>{error}</ErrorNote>;
  if (!data) return <SkeletonRows rows={6} height={90} />;

  const { summary } = data;

  return (
    <div className="fade-in">
      <PageHead
        title="Municipal Departments"
        sub="City departments, designated authorities, service-level agreements, active caseloads, and field officer rosters."
        actions={
          <div className="row" style={{ gap: "var(--s-2)" }}>
            <Segment
              value={viewMode}
              onChange={setViewMode}
              options={[
                { id: "detailed", label: "Detailed Roster" },
                { id: "grid", label: "Overview Grid" },
              ]}
            />
          </div>
        }
      />

      {/* KPI Overview Statistics */}
      <div className="grid grid--4" style={{ marginBottom: "var(--s-5)" }}>
        <Stat
          label="Departments"
          value={summary?.total_departments ?? data.departments.length}
          icon={Icon.building}
          note="Configured civic jurisdictions"
        />
        <Stat
          label="Field Officers"
          value={summary?.total_officers ?? 0}
          icon={Icon.user}
          tone="ok"
          note="Active engineers & inspectors"
        />
        <Stat
          label="Active Caseload"
          value={summary?.total_open_cases ?? 0}
          icon={Icon.clipboard}
          tone={summary?.total_open_cases > 50 ? "warn" : "info"}
          note={`${summary?.total_sla_breached ?? 0} overdue citywide`}
        />
        <Stat
          label="City SLA Compliance"
          value={`${summary?.avg_city_sla ?? 92}%`}
          icon={Icon.shield}
          tone={summary?.avg_city_sla >= 90 ? "ok" : "warn"}
          note={`${summary?.total_resolved_cases ?? 0} total cases resolved`}
        />
      </div>

      {/* Search & Filtering Toolbar */}
      <div className="toolbar" style={{ flexWrap: "wrap", gap: "var(--s-3)", marginBottom: "var(--s-4)" }}>
        <div style={{ position: "relative", minWidth: 260, flex: 1 }}>
          <input
            className="input"
            style={{ width: "100%", paddingLeft: 34 }}
            placeholder="Search departments, categories, officers, designations…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <span style={{ position: "absolute", left: 10, top: 10, color: "var(--muted)" }}>
            <Icon.search width={16} height={16} />
          </span>
        </div>

        <select
          className="input"
          style={{ width: "auto" }}
          value={authorityFilter}
          onChange={(e) => setAuthorityFilter(e.target.value)}
        >
          <option value="all">All Authorities</option>
          {authorities.map((auth) => (
            <option key={auth} value={auth}>{auth}</option>
          ))}
        </select>

        <select
          className="input"
          style={{ width: "auto" }}
          value={caseloadFilter}
          onChange={(e) => setCaseloadFilter(e.target.value)}
        >
          <option value="all">All Caseloads</option>
          <option value="heavy">Heavy Caseload (&gt; 5 open)</option>
          <option value="breached">With Overdue SLA</option>
          <option value="contracts">With Active Contracts</option>
        </select>

        <select
          className="input"
          style={{ width: "auto" }}
          value={officerSort}
          onChange={(e) => setOfficerSort(e.target.value)}
        >
          <option value="workload">Sort Officers: Workload</option>
          <option value="rating">Sort Officers: Rating (High to Low)</option>
          <option value="sla">Sort Officers: SLA Compliance</option>
          <option value="name">Sort Officers: Name (A-Z)</option>
        </select>

        <div className="row" style={{ gap: "var(--s-2)", marginLeft: "auto" }}>
          <button className="btn btn--ghost btn--sm" onClick={expandAll}>
            Expand All
          </button>
          <button className="btn btn--ghost btn--sm" onClick={collapseAll}>
            Collapse All
          </button>
        </div>
      </div>

      {filteredDepartments.length === 0 ? (
        <Empty
          icon={Icon.building}
          title="No departments match your filters"
          body="Try clearing the search query or adjusting authority and caseload filters."
        />
      ) : viewMode === "grid" ? (
        /* Overview Grid View */
        <div className="grid grid--2" style={{ gap: "var(--s-4)" }}>
          {filteredDepartments.map((dept) => (
            <DepartmentGridCard
              key={dept.id}
              dept={dept}
              onViewDetails={() => {
                setExpandedDepts({ [dept.id]: true });
                setViewMode("detailed");
              }}
              onViewComplaints={() => navigate(`/admin/complaints?q=${encodeURIComponent(dept.name)}`)}
            />
          ))}
        </div>
      ) : (
        /* Detailed Accordion / Cards View */
        <div className="stack" style={{ gap: "var(--s-5)" }}>
          {filteredDepartments.map((dept) => (
            <DepartmentDetailedCard
              key={dept.id}
              dept={dept}
              expanded={Boolean(expandedDepts[dept.id])}
              onToggle={() => toggleExpand(dept.id)}
              officerSort={officerSort}
              navigate={navigate}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Grid Summary Card
 */
function DepartmentGridCard({ dept, onViewDetails, onViewComplaints }) {
  const IconComp = DEPT_ICONS[dept.code] || Icon.building;
  const accentColor = DEPT_COLORS[dept.code] || "var(--brand)";

  return (
    <div
      className="card card--tight"
      style={{
        borderTop: `4px solid ${accentColor}`,
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        gap: "var(--s-4)",
      }}
    >
      <div>
        <div className="row row--between" style={{ alignItems: "flex-start", marginBottom: "var(--s-2)" }}>
          <div className="row" style={{ gap: "var(--s-3)" }}>
            <span
              className="tile tile--lg"
              style={{
                background: `color-mix(in srgb, ${accentColor} 15%, transparent)`,
                color: accentColor,
              }}
            >
              <IconComp width={22} height={22} />
            </span>
            <div>
              <div style={{ fontWeight: 700, fontSize: "var(--t-lg)", lineHeight: 1.2 }}>{dept.name}</div>
              <div className="label" style={{ marginTop: 2 }}>{dept.authority || "MCGM"} · <span className="mono">{dept.code}</span></div>
            </div>
          </div>
          <Badge tone={dept.open_complaints > 0 ? "warn" : "ok"}>
            {dept.open_complaints} open
          </Badge>
        </div>

        {/* Head of Department */}
        {dept.head_name && (
          <div
            className="row"
            style={{
              gap: "var(--s-2)",
              padding: "6px 10px",
              background: "var(--surface-2, rgba(0,0,0,0.03))",
              borderRadius: "var(--r)",
              fontSize: "var(--t-xs)",
              marginTop: "var(--s-2)",
              marginBottom: "var(--s-3)",
            }}
          >
            <Icon.user width={14} height={14} style={{ color: "var(--muted)" }} />
            <span style={{ fontWeight: 600 }}>Super Admin:</span>
            <span>{dept.head_name}</span>
            {dept.head_email && <span className="muted mono">({dept.head_email})</span>}
          </div>
        )}

        {/* Metrics Grid */}
        <div className="grid grid--3" style={{ gap: "var(--s-2)", textAlign: "center", marginTop: "var(--s-3)" }}>
          <div style={{ padding: "8px", background: "var(--surface-2, #f8fafc)", borderRadius: "var(--r)" }}>
            <div className="num" style={{ fontSize: "var(--t-md)", fontWeight: 700 }}>{dept.officers_count}</div>
            <div className="label" style={{ fontSize: "var(--t-xs)" }}>Officers</div>
          </div>
          <div style={{ padding: "8px", background: "var(--surface-2, #f8fafc)", borderRadius: "var(--r)" }}>
            <div className="num" style={{ fontSize: "var(--t-md)", fontWeight: 700, color: dept.sla_rate >= 90 ? "var(--ok)" : "inherit" }}>
              {dept.sla_rate ?? "—"}%
            </div>
            <div className="label" style={{ fontSize: "var(--t-xs)" }}>SLA Met</div>
          </div>
          <div style={{ padding: "8px", background: "var(--surface-2, #f8fafc)", borderRadius: "var(--r)" }}>
            <div className="num" style={{ fontSize: "var(--t-md)", fontWeight: 700 }}>
              {dept.avg_rating > 0 ? `⭐ ${dept.avg_rating}` : "—"}
            </div>
            <div className="label" style={{ fontSize: "var(--t-xs)" }}>Rating</div>
          </div>
        </div>

        {/* Categories tags preview */}
        {dept.categories?.length > 0 && (
          <div style={{ marginTop: "var(--s-3)" }}>
            <div className="label" style={{ marginBottom: 4 }}>Civic Categories:</div>
            <div className="row" style={{ flexWrap: "wrap", gap: 4 }}>
              {dept.categories.slice(0, 4).map((c) => (
                <span
                  key={c.id}
                  style={{
                    fontSize: "var(--t-xs)",
                    padding: "2px 8px",
                    background: "var(--surface-2, rgba(0,0,0,0.05))",
                    borderRadius: "12px",
                  }}
                >
                  {c.name}
                </span>
              ))}
              {dept.categories.length > 4 && (
                <span className="label" style={{ fontSize: "var(--t-xs)", alignSelf: "center" }}>
                  +{dept.categories.length - 4} more
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="row row--between" style={{ borderTop: "1px solid var(--border-soft, #e2e8f0)", paddingTop: "var(--s-3)" }}>
        <button className="btn btn--ghost btn--sm" onClick={onViewComplaints}>
          <Icon.clipboard width={14} height={14} />
          View Complaints ({dept.open_complaints})
        </button>
        <button className="btn btn--sm" onClick={onViewDetails}>
          View Officers Roster &rarr;
        </button>
      </div>
    </div>
  );
}

/**
 * Detailed Department Card with Full Officer Roster
 */
function DepartmentDetailedCard({ dept, expanded, onToggle, officerSort, navigate }) {
  const IconComp = DEPT_ICONS[dept.code] || Icon.building;
  const accentColor = DEPT_COLORS[dept.code] || "var(--brand)";

  // Sort officers for this department
  const sortedOfficers = useMemo(() => {
    if (!dept.officers) return [];
    return [...dept.officers].sort((a, b) => {
      if (officerSort === "workload") return (b.active_cases || 0) - (a.active_cases || 0);
      if (officerSort === "rating") return (Number(b.rating) || 0) - (Number(a.rating) || 0);
      if (officerSort === "sla") return (Number(b.sla) || 0) - (Number(a.sla) || 0);
      if (officerSort === "name") return a.name.localeCompare(b.name);
      return 0;
    });
  }, [dept.officers, officerSort]);

  // SLA Hours labels
  const slaConfig = dept.sla_hours || { critical: 12, high: 24, medium: 72, low: 168 };

  return (
    <Panel
      className="fade-in"
      style={{
        borderLeft: `5px solid ${accentColor}`,
        overflow: "hidden",
        padding: 0,
      }}
    >
      {/* Department Top Header Banner */}
      <div
        style={{
          padding: "var(--s-4) var(--s-5)",
          background: "var(--surface)",
          borderBottom: expanded ? "1px solid var(--border-soft, #e2e8f0)" : "none",
          cursor: "pointer",
        }}
        onClick={onToggle}
      >
        <div className="row row--between" style={{ alignItems: "flex-start", flexWrap: "wrap", gap: "var(--s-3)" }}>
          <div className="row" style={{ gap: "var(--s-3)", alignItems: "center" }}>
            <span
              className="tile tile--lg"
              style={{
                background: `color-mix(in srgb, ${accentColor} 18%, transparent)`,
                color: accentColor,
              }}
            >
              <IconComp width={24} height={24} />
            </span>
            <div>
              <div className="row" style={{ gap: "var(--s-2)", alignItems: "center" }}>
                <h2 style={{ fontSize: "var(--t-lg)", fontWeight: 700, margin: 0 }}>
                  {dept.name}
                </h2>
                <span
                  className="mono"
                  style={{
                    fontSize: "var(--t-xs)",
                    padding: "2px 6px",
                    background: "var(--surface-2, #f1f5f9)",
                    borderRadius: "var(--r)",
                    color: "var(--muted)",
                  }}
                >
                  {dept.code}
                </span>
                <Badge tone="info">{dept.authority || "MCGM"}</Badge>
              </div>

              {/* Head info */}
              <div className="row" style={{ gap: "var(--s-3)", marginTop: "4px", fontSize: "var(--t-xs)", color: "var(--muted)" }}>
                {dept.head_name ? (
                  <span>
                    <strong>Super Admin:</strong> {dept.head_name}
                    {dept.head_email && ` (${dept.head_email})`}
                    {dept.head_phone && ` · 📞 ${dept.head_phone}`}
                  </span>
                ) : (
                  <span><em>No designated super admin assigned</em></span>
                )}
              </div>
            </div>
          </div>

          {/* Header Quick Metrics & Expand Toggle */}
          <div className="row" style={{ gap: "var(--s-3)", alignItems: "center" }}>
            <div className="row" style={{ gap: "var(--s-2)" }}>
              <Badge tone={dept.open_complaints > 0 ? "warn" : "ok"}>
                {dept.open_complaints} open
              </Badge>
              <Badge tone="info">
                {dept.officers_count} {dept.officers_count === 1 ? "officer" : "officers"}
              </Badge>
              {dept.sla_rate != null && (
                <Badge tone={dept.sla_rate >= 90 ? "ok" : dept.sla_rate >= 80 ? "warn" : "danger"}>
                  {dept.sla_rate}% SLA
                </Badge>
              )}
            </div>

            <button
              className="btn btn--ghost btn--sm"
              onClick={(e) => { e.stopPropagation(); onToggle(); }}
              aria-label="Toggle department details"
            >
              <Icon.arrow
                width={16}
                height={16}
                style={{
                  transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
                  transition: "transform 0.2s ease",
                }}
              />
            </button>
          </div>
        </div>
      </div>

      {/* Expandable Department Body */}
      {expanded && (
        <div style={{ padding: "var(--s-5)" }}>
          {/* Department Operational Stats Strip */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
              gap: "var(--s-3)",
              background: "var(--surface-2, #f8fafc)",
              padding: "var(--s-3) var(--s-4)",
              borderRadius: "var(--r)",
              marginBottom: "var(--s-4)",
            }}
          >
            <div>
              <div className="label">Open Cases</div>
              <div className="num" style={{ fontSize: "var(--t-lg)", fontWeight: 700, color: dept.open_complaints > 0 ? "var(--warn)" : "inherit" }}>
                {dept.open_complaints}
              </div>
              {Number(dept.critical_cases) > 0 && (
                <div style={{ fontSize: "var(--t-xs)", color: "var(--danger)" }}>
                  ● {dept.critical_cases} critical
                </div>
              )}
            </div>

            <div>
              <div className="label">Resolved Cases</div>
              <div className="num" style={{ fontSize: "var(--t-lg)", fontWeight: 700 }}>
                {dept.resolved_complaints}
              </div>
              <div style={{ fontSize: "var(--t-xs)", color: "var(--muted)" }}>
                of {dept.total_complaints} total
              </div>
            </div>

            <div>
              <div className="label">SLA Compliance</div>
              <div className="num" style={{ fontSize: "var(--t-lg)", fontWeight: 700, color: dept.sla_rate >= 90 ? "var(--ok)" : "inherit" }}>
                {dept.sla_rate ?? "—"}%
              </div>
              {Number(dept.sla_breached) > 0 ? (
                <div style={{ fontSize: "var(--t-xs)", color: "var(--danger)" }}>
                  ⚠ {dept.sla_breached} overdue
                </div>
              ) : (
                <div style={{ fontSize: "var(--t-xs)", color: "var(--ok)" }}>
                  ✓ 0 overdue
                </div>
              )}
            </div>

            <div>
              <div className="label">Avg Turnaround</div>
              <div className="num" style={{ fontSize: "var(--t-lg)", fontWeight: 700 }}>
                {dept.avg_resolution_days ? `${dept.avg_resolution_days}d` : "—"}
              </div>
              <div style={{ fontSize: "var(--t-xs)", color: "var(--muted)" }}>
                Resolution speed
              </div>
            </div>

            <div>
              <div className="label">Citizen Rating</div>
              <div className="num" style={{ fontSize: "var(--t-lg)", fontWeight: 700 }}>
                {dept.avg_rating > 0 ? `⭐ ${dept.avg_rating}` : "—"}
              </div>
              <div style={{ fontSize: "var(--t-xs)", color: "var(--muted)" }}>
                {dept.total_feedback_count || 0} reviews
              </div>
            </div>

            <div>
              <div className="label">Contracts &amp; Hotspots</div>
              <div className="num" style={{ fontSize: "var(--t-lg)", fontWeight: 700 }}>
                {dept.active_contracts_count} / {dept.hotspots_count}
              </div>
              <div style={{ fontSize: "var(--t-xs)", color: "var(--muted)" }}>
                Active / Hotspots
              </div>
            </div>
          </div>

          {/* Department Scope & SLA Config Details */}
          <div
            className="row row--between"
            style={{
              flexWrap: "wrap",
              gap: "var(--s-3)",
              paddingBottom: "var(--s-4)",
              borderBottom: "1px solid var(--border-soft, #e2e8f0)",
              marginBottom: "var(--s-4)",
            }}
          >
            {/* Civic Categories Managed */}
            <div style={{ flex: 1, minWidth: 260 }}>
              <div className="label" style={{ marginBottom: 6, fontWeight: 600 }}>
                Categories Under Jurisdiction:
              </div>
              <div className="row" style={{ flexWrap: "wrap", gap: 6 }}>
                {dept.categories?.length > 0 ? (
                  dept.categories.map((c) => (
                    <span
                      key={c.id}
                      style={{
                        fontSize: "var(--t-xs)",
                        padding: "3px 10px",
                        background: "var(--surface-2, #f1f5f9)",
                        borderRadius: "12px",
                        border: "1px solid var(--border-soft, #e2e8f0)",
                      }}
                    >
                      {c.name}
                    </span>
                  ))
                ) : (
                  <span className="muted" style={{ fontSize: "var(--t-xs)" }}>
                    No specific categories assigned
                  </span>
                )}
              </div>
            </div>

            {/* SLA Limits */}
            <div style={{ minWidth: 260 }}>
              <div className="label" style={{ marginBottom: 6, fontWeight: 600 }}>
                SLA Deadlines by Severity:
              </div>
              <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                <span className="badge badge--danger" style={{ fontSize: "var(--t-xs)" }}>
                  Critical: {slaConfig.critical}h
                </span>
                <span className="badge badge--warn" style={{ fontSize: "var(--t-xs)" }}>
                  High: {slaConfig.high}h
                </span>
                <span className="badge badge--info" style={{ fontSize: "var(--t-xs)" }}>
                  Medium: {slaConfig.medium}h
                </span>
                <span className="badge badge--pending" style={{ fontSize: "var(--t-xs)" }}>
                  Low: {slaConfig.low}h
                </span>
              </div>
            </div>
          </div>

          {/* Active Contracts Summary if available */}
          {dept.contracts?.length > 0 && (
            <div style={{ marginBottom: "var(--s-4)" }}>
              <div className="label" style={{ marginBottom: 6, fontWeight: 600 }}>
                Active Maintenance Contracts ({dept.contracts.length}):
              </div>
              <div className="grid grid--2" style={{ gap: "var(--s-2)" }}>
                {dept.contracts.map((ct) => (
                  <div
                    key={ct.id}
                    style={{
                      padding: "8px 12px",
                      background: "var(--surface-2, #f8fafc)",
                      borderRadius: "var(--r)",
                      border: "1px solid var(--border-soft, #e2e8f0)",
                      fontSize: "var(--t-xs)",
                    }}
                  >
                    <div className="row row--between">
                      <span className="mono" style={{ fontWeight: 600 }}>{ct.contract_no}</span>
                      <span className="label">SLA: {ct.sla_hours}h</span>
                    </div>
                    <div style={{ fontWeight: 500, marginTop: 2 }}>{ct.scope}</div>
                    <div className="label" style={{ marginTop: 2 }}>
                      Agency: {ct.agency} · Ends: {ct.ends_on}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Field Officers Roster */}
          <div>
            <div className="row row--between" style={{ marginBottom: "var(--s-3)", alignItems: "center" }}>
              <div className="row" style={{ gap: "var(--s-2)", alignItems: "center" }}>
                <Icon.user width={16} height={16} style={{ color: accentColor }} />
                <h3 style={{ fontSize: "var(--t-md)", fontWeight: 700, margin: 0 }}>
                  Officers &amp; Engineers ({sortedOfficers.length})
                </h3>
              </div>

              <button
                className="btn btn--ghost btn--sm"
                onClick={() => navigate(`/admin/complaints?q=${encodeURIComponent(dept.name)}`)}
              >
                <Icon.clipboard width={14} height={14} />
                Department Complaints ({dept.open_complaints})
              </button>
            </div>

            {sortedOfficers.length === 0 ? (
              <div
                style={{
                  padding: "var(--s-4)",
                  background: "var(--surface-2, #f8fafc)",
                  borderRadius: "var(--r)",
                  textAlign: "center",
                }}
              >
                <p className="label" style={{ margin: 0 }}>
                  No active officers currently assigned to {dept.name}.
                </p>
                <button
                  className="btn btn--sm"
                  style={{ marginTop: "var(--s-2)" }}
                  onClick={() => navigate("/admin/staff")}
                >
                  Review Staff Applications
                </button>
              </div>
            ) : (
              <div className="scroll-x">
                <table className="table table--stack" style={{ fontSize: "var(--t-sm)" }}>
                  <thead>
                    <tr>
                      <th>Officer</th>
                      <th>Designation / ID</th>
                      <th>Contact</th>
                      <th>Workload</th>
                      <th>Resolved</th>
                      <th>Speed</th>
                      <th>SLA %</th>
                      <th>Rating</th>
                      <th>Recent Assignment</th>
                      <th className="col-action" />
                    </tr>
                  </thead>
                  <tbody>
                    {sortedOfficers.map((o) => (
                      <tr key={o.id} style={{ transition: "background 0.15s ease" }}>
                        {/* Name & Ward */}
                        <td data-label="Officer">
                          <div className="row" style={{ gap: "var(--s-2)", alignItems: "center" }}>
                            <div
                              style={{
                                width: 32,
                                height: 32,
                                borderRadius: "50%",
                                background: `color-mix(in srgb, ${accentColor} 20%, transparent)`,
                                color: accentColor,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontWeight: 700,
                                fontSize: "var(--t-xs)",
                              }}
                            >
                              {o.name?.slice(0, 2).toUpperCase()}
                            </div>
                            <div>
                              <button
                                className="link"
                                style={{ fontWeight: 600, textAlign: "left", display: "block" }}
                                onClick={() => navigate(`/admin/officers/${o.id}`)}
                              >
                                {o.name}
                              </button>
                              {o.primary_ward && (
                                <span className="label" style={{ fontSize: "var(--t-xs)" }}>
                                  Ward {o.primary_ward}
                                </span>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Designation / Emp ID */}
                        <td data-label="Designation">
                          <div style={{ fontWeight: 500 }}>{o.designation || "Field Officer"}</div>
                          {o.employee_id && (
                            <div className="mono label" style={{ fontSize: "var(--t-xs)" }}>
                              {o.employee_id}
                            </div>
                          )}
                        </td>

                        {/* Contact */}
                        <td data-label="Contact">
                          <a
                            href={`mailto:${o.email}`}
                            className="link mono"
                            style={{ fontSize: "var(--t-xs)", display: "block" }}
                          >
                            {o.email}
                          </a>
                          {(o.work_phone || o.profile_phone) && (
                            <a
                              href={`tel:${o.work_phone || o.profile_phone}`}
                              className="label mono"
                              style={{ fontSize: "var(--t-xs)", display: "block" }}
                            >
                              📞 {o.work_phone || o.profile_phone}
                            </a>
                          )}
                        </td>

                        {/* Workload */}
                        <td data-label="Workload">
                          <div className="row" style={{ gap: "var(--s-1)", alignItems: "center" }}>
                            <span className="mono" style={{ fontWeight: 700, fontSize: "var(--t-md)" }}>
                              {o.active_cases}
                            </span>
                            {o.active_cases > 6 ? (
                              <Badge tone="danger">overloaded</Badge>
                            ) : o.active_cases > 3 ? (
                              <Badge tone="warn">moderate</Badge>
                            ) : (
                              <Badge tone="ok">available</Badge>
                            )}
                          </div>
                          {Number(o.critical_cases) > 0 && (
                            <span style={{ fontSize: "var(--t-xs)", color: "var(--danger)" }}>
                              {o.critical_cases} critical
                            </span>
                          )}
                        </td>

                        {/* Resolved */}
                        <td data-label="Resolved" className="mono">
                          {o.resolved_cases}
                        </td>

                        {/* Speed */}
                        <td data-label="Speed" className="mono">
                          {o.avg_days ? `${o.avg_days}d` : "—"}
                        </td>

                        {/* SLA */}
                        <td data-label="SLA">
                          <Badge tone={o.sla >= 90 ? "ok" : o.sla >= 80 ? "warn" : "danger"}>
                            {o.sla != null ? `${o.sla}%` : "—"}
                          </Badge>
                        </td>

                        {/* Rating */}
                        <td data-label="Rating">
                          {o.rating > 0 ? (
                            <div>
                              <span style={{ fontWeight: 600 }}>⭐ {o.rating}</span>
                              <div className="label" style={{ fontSize: "10px" }}>({o.reviews_count})</div>
                            </div>
                          ) : (
                            <span className="muted">—</span>
                          )}
                        </td>

                        {/* Recent Case */}
                        <td data-label="Recent Case">
                          {o.recent_cases?.length > 0 ? (
                            <div>
                              <button
                                className="link mono"
                                style={{ fontSize: "var(--t-xs)" }}
                                onClick={() => navigate(`/admin/complaints/${o.recent_cases[0].ref}`)}
                              >
                                {o.recent_cases[0].ref}
                              </button>
                              <div className="label truncate" style={{ maxWidth: 140 }}>
                                {o.recent_cases[0].category}
                              </div>
                            </div>
                          ) : (
                            <span className="muted label">— None</span>
                          )}
                        </td>

                        {/* Action */}
                        <td className="col-action" data-label="Action">
                          <button
                            className="btn btn--ghost btn--sm"
                            onClick={() => navigate(`/admin/officers/${o.id}`)}
                          >
                            Details
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </Panel>
  );
}
