import { useEffect, useState } from "react";
import { api } from "../../lib/api.js";
import { Label, Loading, ErrorNote, Meter, Tile } from "../../components/Primitives.jsx";
import { Icon } from "../../components/Icons.jsx";
import { useAuth } from "../../lib/auth.jsx";
import { useT } from "../../lib/i18n.jsx";

export default function Profile() {
  const { profile } = useAuth();
  const { t } = useT();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const load = () => api.me().then(setData).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  if (error) return <ErrorNote onRetry={load}>{error}</ErrorNote>;
  if (!data) return <Loading />;

  const stats = data?.stats || { reports: 0, resolved: 0, groups_started: 0, confirmations: 0 };
  const badges = Array.isArray(data?.badges) ? data.badges : [];
  const earned = badges.filter((b) => b?.earned_at);
  const next = badges.find((b) => !b?.earned_at);

  return (
    <div className="fade-in">
      <h1 className="display d-md">{t("impact.title")}</h1>

      <div className="dash" style={{ marginTop: "var(--sp-5)" }}>
        <div className="stack-4">
          <section className="card card--pad" style={{ background: "var(--ink-900)", borderColor: "var(--ink-line)", color: "var(--on-dark)" }}>
            <Label style={{ color: "var(--on-dark-2)" }}>{t("impact.points")}</Label>
            <div className="display" style={{ fontSize: 62, color: "var(--accent)", marginTop: 6 }}>
              {profile?.points ?? 0}
            </div>
            <p style={{ color: "var(--on-dark-2)", marginTop: 8, marginBottom: 0 }}>
              Earned across {stats?.reports ?? 0} reports, {stats?.confirmations ?? 0} confirmations and{" "}
              {stats?.groups_started ?? 0} groups you were first to report.
            </p>
          </section>

          <div className="grid-4">
            {[
              ["Reports filed", stats.reports, Icon.file],
              ["Resolved", stats.resolved, Icon.check],
              ["Groups started", stats.groups_started, Icon.route],
              ["Confirmations", stats.confirmations, Icon.shield],
            ].map(([label, value, icon]) => (
              <div key={label} className="card card--tight">
                <Tile icon={icon} />
                <div className="display" style={{ fontSize: 26, marginTop: 14 }}>{value}</div>
                <Label style={{ marginTop: 4 }}>{label}</Label>
              </div>
            ))}
          </div>

          <section className="card card--pad">
            <h2 className="h h-lg">Badges</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12, marginTop: 16 }}>
              {badges.map((b) => (
                <div
                  key={b.code}
                  className="card card--tight"
                  style={{ opacity: b.earned_at ? 1 : 0.5, boxShadow: "none", background: b.earned_at ? "var(--accent-100)" : "var(--surface-2)", borderColor: "transparent" }}
                >
                  <Tile icon={Icon.shield} tone={b.earned_at ? "accent" : ""} />
                  <div style={{ fontWeight: 600, marginTop: 12 }}>{b.name}</div>
                  {/* "Locked" alone says nothing about how to unlock it. The
                      criteria are already sent, so the requirement and how far
                      along you are can both be shown. */}
                  <Label style={{ marginTop: 4 }}>
                    {b.earned_at ? "Earned" : requirementFor(b, stats)}
                  </Label>
                </div>
              ))}
            </div>
          </section>
        </div>

        <aside className="stack-4">
          <section className="card card--pad">
            <Label>Next badge</Label>
            {next ? (
              <>
                <div className="h h-lg" style={{ marginTop: 8 }}>{next.name}</div>
                <div style={{ marginTop: 14 }}>
                  <Meter value={Math.min(100, (stats.reports / (next.criteria.valid_reports || 1)) * 100)} />
                </div>
                <p className="prose" style={{ fontSize: 13, marginTop: 10 }}>
                  {stats.reports} of {next.criteria.valid_reports || "—"} verified reports.
                </p>
              </>
            ) : (
              <p className="prose" style={{ fontSize: 14, marginTop: 8 }}>Every badge earned.</p>
            )}
          </section>

          <section className="card card--pad">
            <Label>How points work</Label>
            <p className="prose" style={{ fontSize: 14, marginTop: 8 }}>{t("impact.note")}</p>
            <ul className="prose" style={{ fontSize: 14, paddingLeft: 18, marginTop: 10 }}>
              <li>Valid report — 10</li>
              <li>First to report a group — 25</li>
              <li>Confirming a resolution — 20</li>
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}


/**
 * What a locked badge still needs, in the resident's own numbers.
 *
 * A row of grey shields saying "Locked" tells somebody they have not earned
 * something without telling them what would. The criteria come from the
 * database, so the wording follows whatever the badge actually requires rather
 * than a hardcoded list that drifts from it.
 */
function requirementFor(badge, stats) {
  const [key, threshold] = Object.entries(badge.criteria || {})[0] || [];
  if (!key) return "Locked";

  const have = Number(
    {
      valid_reports: stats?.reports ?? 0,
      resolved: stats?.resolved ?? 0,
      // groups_started, not clusters — the stats object uses the resident-facing
      // word, and the wrong key would have read 0 for a badge already earned.
      clusters_started: stats?.groups_started ?? 0,
      critical_reports: stats?.critical ?? 0,
    }[key] ?? 0
  );

  const noun = {
    valid_reports: "reports",
    resolved: "resolved",
    clusters_started: "groups started",
    critical_reports: "critical reports",
  }[key] || key.replace(/_/g, " ");

  const short = Math.max(0, Number(threshold) - have);

  return short === 0
    ? "Earned — refresh to collect"
    : `${have} of ${threshold} ${noun}`;
}
