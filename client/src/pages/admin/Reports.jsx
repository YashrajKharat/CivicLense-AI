import { useEffect, useState } from "react";
import { api } from "../../lib/api.js";
import { useAuth } from "../../lib/auth.jsx";
import ReportSection from "../../components/ReportSection.jsx";
import {
  Panel, Label, ErrorNote, PageHead, Loading, Badge, Empty, SkeletonRows,
} from "../../components/Primitives.jsx";
import { Icon } from "../../components/Icons.jsx";
import { when } from "../../lib/format.js";

const RANGES = [
  { id: 7, label: "7 days" },
  { id: 30, label: "30 days" },
  { id: 90, label: "Quarter" },
  { id: 365, label: "Year" },
];

const iso = (d) => d.toISOString().slice(0, 10);
const ago = (days) => iso(new Date(Date.now() - days * 864e5));

export default function Reports() {
  const { profile } = useAuth();
  const [sections, setSections] = useState([]);
  const [chosen, setChosen] = useState(["volume", "categories", "sla", "verification"]);
  const [days, setDays] = useState(30);
  const [report, setReport] = useState(null);
  const [history, setHistory] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.reportSections().then((r) => setSections(r.sections)).catch(() => setSections([]));
    api.reports().then((r) => setHistory(r.reports)).catch(() => setHistory([]));
  }, []);

  async function build() {
    setBusy(true);
    setError(null);
    try {
      setReport(
        await api.generateReport({
          from: ago(days),
          to: iso(new Date()),
          sections: chosen,
          departmentId: profile?.role === "global_admin" ? null : profile?.department_id,
        })
      );
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const toggle = (id) =>
    setChosen((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));

  return (
    <div className="fade-in">
      <PageHead
        title="Reports"
        sub="Every figure comes from a query. Nothing here is estimated or generated."
      />

      <Panel title="Build a report">
        <div className="row row--wrap" style={{ gap: "var(--s-2)", marginBottom: "var(--s-5)" }}>
          {RANGES.map((r) => (
            <button
              key={r.id}
              className="choice"
              aria-pressed={days === r.id}
              onClick={() => setDays(r.id)}
            >
              {r.label}
            </button>
          ))}
        </div>

        <Label>Sections</Label>
        <div className="row row--wrap" style={{ gap: "var(--s-2)", marginTop: "var(--s-2)" }}>
          {sections.map((s) => (
            <button
              key={s.id}
              className="choice"
              aria-pressed={chosen.includes(s.id)}
              onClick={() => toggle(s.id)}
            >
              {s.label}
            </button>
          ))}
        </div>

        <div className="row" style={{ marginTop: "var(--s-5)", gap: "var(--s-3)" }}>
          <button className="btn" onClick={build} disabled={busy || chosen.length === 0}>
            {busy ? "Building…" : "Build report"}
          </button>
          {report && (
            <button className="btn btn--secondary" onClick={() => window.print()}>
              <Icon.file width={15} height={15} /> Print
            </button>
          )}
        </div>

        {error && <div style={{ marginTop: "var(--s-4)" }}><ErrorNote>{error}</ErrorNote></div>}
      </Panel>

      {busy && <div style={{ marginTop: "var(--s-5)" }}><SkeletonRows rows={3} height={280} /></div>}

      {report && !busy && (
        <div className="stack" style={{ marginTop: "var(--s-5)" }}>
          <Panel
            title={`${report.from} to ${report.to}`}
            action={<Badge tone="pending">{Object.keys(report.sections).length} sections</Badge>}
          >
            {report.summary ? (
              <p className="prose">{report.summary}</p>
            ) : (
              /* The report is complete without it; saying so is better than a
                 blank space that looks like something failed. */
              <p className="label">
                The written summary was unavailable. Every section below is complete —
                the summary only restates them.
              </p>
            )}
          </Panel>

          {Object.entries(report.sections).map(([key, section]) => (
            <ReportSection key={key} section={section} />
          ))}

          <p className="label">
            Generated {when(report.created_at)}. Figures are drawn live at build time and
            will differ from a report built later over the same period.
          </p>
        </div>
      )}

      {!report && !busy && history?.length > 0 && (
        <Panel title="Earlier reports" list style={{ marginTop: "var(--s-5)" }}>
          {history.slice(0, 10).map((r) => (
            <div key={r.id} className="listrow">
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontSize: "var(--t-sm)" }}>
                  {r.period_from} → {r.period_to}
                </span>
                <span className="label" style={{ display: "block" }}>
                  {(r.sections || []).join(", ")}
                </span>
              </span>
              <span className="label">{when(r.created_at)}</span>
            </div>
          ))}
        </Panel>
      )}

      {!report && !busy && history?.length === 0 && (
        <div style={{ marginTop: "var(--s-5)" }}>
          <Empty
            icon={Icon.file}
            title="No reports yet"
            body="Choose a period and the sections you want, then build one. It takes a second."
          />
        </div>
      )}
    </div>
  );
}
