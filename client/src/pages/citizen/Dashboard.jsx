import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../lib/api.js";
import { Icon, CATEGORY_ICON } from "../../components/Icons.jsx";
import { Stat, Label, StatusBadge, Loading, ErrorNote, Meter, Tile } from "../../components/Primitives.jsx";
import { TrendChart, Legend } from "../../components/Charts.jsx";
import { useT } from "../../lib/i18n.jsx";
import { ago } from "../../lib/format.js";
import { useAuth } from "../../lib/auth.jsx";

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
};

export default function Dashboard() {
  const { profile } = useAuth();
  const { t } = useT();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const load = () =>
    api.citizenDashboard().then(setData).catch((e) => setError(e.message));

  useEffect(() => { load(); }, []);

  if (error) return <ErrorNote onRetry={load}>{error}</ErrorNote>;
  if (!data) return <Loading />;

  const { stats, reports, by_category, weekly, nearby } = data;

  return (
    <div className="fade-in">
      <div className="row row--between row--wrap" style={{ marginBottom: "var(--sp-5)", gap: 16 }}>
        <div>
          <div className="muted" style={{ fontSize: 15 }}>
            {greeting()}, {profile?.full_name?.split(" ")[0] || "there"}
          </div>
          <h1 className="display d-md" style={{ marginTop: 6 }}>Your civic lense today</h1>
        </div>
        <Link to="/app/report" className="btn"><Icon.camera /> Report an issue</Link>
      </div>

      <div className="dash">
        <div className="stack-4">
          <ProfileCard profile={profile} stats={stats} />

          <div className="grid-4">
            <Stat label="Total reports" value={stats.reports} icon={Icon.file} />
            <Stat label="Resolved" value={`${stats.resolved_pct}%`} icon={Icon.check} tone="accent" />
            <Stat label="Avg resolution" value={stats.avg_days ? `${stats.avg_days}d` : "—"} icon={Icon.clock} />
            <Stat label="Overdue" value={stats.overdue} icon={Icon.alert} />
          </div>

          <section className="card card--pad">
            <div className="row row--between">
              <h2 className="h h-lg">Weekly activity</h2>
              <Legend items={["Filed", "Resolved"]} />
            </div>
            <div style={{ marginTop: 16 }}>
              <TrendChart data={weekly} xKey="label" series={[{ key: "filed", label: "Filed" }, { key: "resolved", label: "Resolved" }]} />
            </div>
          </section>

          <section className="card">
            <div className="row row--between" style={{ padding: "var(--sp-5) var(--sp-5) var(--sp-3)" }}>
              <h2 className="h h-lg">Recent reports</h2>
              <Link to="/app/reports" className="link row" style={{ gap: 6, fontSize: 14 }}>
                View all <Icon.arrow width={15} height={15} />
              </Link>
            </div>

            <div style={{ padding: "0 var(--sp-5) var(--sp-4)" }}>
              {reports.length === 0 && (
                <p className="prose" style={{ padding: "var(--sp-4) 0" }}>
                  Nothing filed yet. Your first report takes under a minute.
                </p>
              )}

              {reports.map((r) => {
                const Ico = CATEGORY_ICON[r.category] || Icon.file;
                return (
                  <Link key={r.ref} to="/app/reports" className="listrow">
                    <Tile icon={Ico} />
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: "block", fontWeight: 600 }}>{r.category}</span>
                      <span className="truncate muted" style={{ display: "block", fontSize: 13 }}>
                        {r.address || `Ward ${r.ward_code}`}
                      </span>
                    </span>
                    <span style={{ textAlign: "right" }}>
                      <StatusBadge status={r.status} />
                      <span className="label" style={{ display: "block", marginTop: 6 }}>{ago(r.created_at)}</span>
                    </span>
                  </Link>
                );
              })}
            </div>
          </section>
        </div>

        <aside className="stack-4">
          <section className="card card--pad">
            <h2 className="h h-lg">Reports by category</h2>
            <div style={{ marginTop: 16, display: "grid", gap: 14 }}>
              {by_category.length === 0 && <p className="prose" style={{ fontSize: 14 }}>No reports yet.</p>}
              {by_category.map((c) => (
                <div key={c.label} className="row" style={{ gap: 12 }}>
                  <span style={{ flex: 1, fontSize: 14 }} className="truncate">{c.label}</span>
                  <span style={{ width: 88 }}><Meter value={c.pct} /></span>
                  <span className="mono" style={{ fontSize: 13, width: 16, textAlign: "right" }}>{c.value}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="card card--pad">
            <h2 className="h h-lg">Nearby civic issues</h2>
            <p className="prose" style={{ fontSize: 13, marginTop: 6 }}>
              Open reports from other residents within a kilometre.
            </p>
            <div style={{ marginTop: 12 }}>
              {nearby.length === 0 && <p className="prose" style={{ fontSize: 14 }}>Nothing open near you.</p>}
              {nearby.map((n) => {
                const Ico = CATEGORY_ICON[n.category] || Icon.file;
                return (
                  <div key={n.ref} className="listrow">
                    <Tile icon={Ico} />
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span className="truncate" style={{ display: "block", fontWeight: 600, fontSize: 14 }}>
                        {n.category}
                      </span>
                      <span className="label" style={{ marginTop: 2 }}>{n.distance_m} m away</span>
                    </span>
                    <StatusBadge status={n.status} />
                  </div>
                );
              })}
            </div>
          </section>

          <section className="card card--pad" style={{ background: "var(--ink-900)", borderColor: "var(--ink-line)", color: "var(--on-dark)" }}>
            <div className="row" style={{ color: "var(--accent)", gap: 8 }}>
              <Icon.trend width={16} height={16} />
              <span className="label" style={{ color: "var(--accent)" }}>City-wide</span>
            </div>
            <div className="display" style={{ fontSize: 30, marginTop: 12, color: "#fff" }}>
              {data.city.resolution_rate}%
            </div>
            <div className="label" style={{ marginTop: 4 }}>resolved in the last 30 days</div>
            <p style={{ fontSize: 13, color: "var(--on-dark-2)", marginTop: 14, marginBottom: 0 }}>
              {data.city.open} reports currently open across {data.city.wards} wards.
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}

function ProfileCard({ profile, stats }) {
  const initials = (profile?.full_name || "")
    .split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();

  return (
    <section className="card card--pad">
      <div className="row row--between row--wrap" style={{ gap: 16 }}>
        <div className="row">
          <span className="avatar" style={{ width: 48, height: 48, fontSize: 16 }}>{initials}</span>
          <div>
            <div className="h h-lg">{profile?.full_name}</div>
            <div className="label" style={{ marginTop: 2 }}>Mumbai, Maharashtra</div>
          </div>
        </div>
        <Link to="/app/profile" className="link row" style={{ gap: 6, fontSize: 14 }}>
          View profile <Icon.arrow width={15} height={15} />
        </Link>
      </div>

      <div className="row" style={{ gap: 12, marginTop: 20 }}>
        {[
          ["Contribution score", profile?.points ?? 0],
          ["Reports filed", stats.reports],
          ["Resolved", stats.resolved],
        ].map(([label, value]) => (
          <div key={label} style={{ flex: 1, background: "var(--surface-2)", borderRadius: "var(--r)", padding: 16 }}>
            <div className="display" style={{ fontSize: 26 }}>{value}</div>
            <Label style={{ marginTop: 4 }}>{label}</Label>
          </div>
        ))}
      </div>
    </section>
  );
}
