import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../lib/api.js";
import IssueMap from "../../components/IssueMap.jsx";
import { Loading, ErrorNote, Badge, StatusBadge, Label, Tile } from "../../components/Primitives.jsx";
import { Icon, CATEGORY_ICON } from "../../components/Icons.jsx";
import { ago } from "../../lib/format.js";

const RADII = [
  { m: 1000, label: "1 km" },
  { m: 2000, label: "2 km" },
  { m: 5000, label: "5 km" },
];

export default function CityMapPage() {
  const [center, setCenter] = useState(null);
  const [radius, setRadius] = useState(2000);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null);
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    if (!navigator.geolocation) {
      setCenter([19.0728, 72.8826]); // Mumbai, so the map is never blank
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => setCenter([p.coords.latitude, p.coords.longitude]),
      () => setCenter([19.0728, 72.8826]),
      { timeout: 8000 }
    );
  }, []);

  useEffect(() => {
    if (!center) return;
    setData(null);
    api.nearby(center[0], center[1], radius).then(setData).catch((e) => setError(e.message));
  }, [center, radius]);

  if (error) return <ErrorNote onRetry={() => setCenter([...center])}>{error}</ErrorNote>;
  if (!center) return <Loading label="Finding you" />;

  const shown =
    !data ? []
      : filter === "open" ? data.complaints.filter((c) => !["resolved", "rejected"].includes(c.status))
      : filter === "critical" ? data.complaints.filter((c) => c.severity === "critical")
      : filter === "resolved" ? data.complaints.filter((c) => c.status === "resolved")
      : data.complaints;

  return (
    <div className="fade-in">
      <div className="row row--between row--wrap" style={{ gap: 14 }}>
        <div>
          <h1 className="display d-md">Around you</h1>
          <p className="prose" style={{ marginTop: 4 }}>
            What your neighbours have reported nearby. Names are never shown.
          </p>
        </div>
        <Link to="/app/report" className="btn"><Icon.camera /> Report an issue</Link>
      </div>

      <div className="row row--wrap" style={{ gap: 8, marginTop: 18 }}>
        {[["all", "All"], ["open", "Still open"], ["critical", "Critical"], ["resolved", "Fixed"]].map(
          ([id, label]) => (
            <button
              key={id}
              className={filter === id ? "btn btn--sm" : "btn btn--ghost btn--sm"}
              onClick={() => setFilter(id)}
            >
              {label}
            </button>
          )
        )}
        <span style={{ flex: 1 }} />
        {RADII.map((r) => (
          <button
            key={r.m}
            className={radius === r.m ? "btn btn--sm" : "btn btn--ghost btn--sm"}
            onClick={() => setRadius(r.m)}
          >
            {r.label}
          </button>
        ))}
      </div>

      {data && (
        <div className="row row--wrap" style={{ gap: 10, marginTop: 14 }}>
          <Badge tone="pending">{data.summary.total} nearby</Badge>
          <Badge tone="info">{data.summary.open} open</Badge>
          {data.summary.critical > 0 && <Badge tone="danger">{data.summary.critical} critical</Badge>}
          {data.clusters.length > 0 && (
            <Badge tone="warn">{data.clusters.length} clustered</Badge>
          )}
        </div>
      )}

      <div style={{ marginTop: 16 }}>
        {!data ? (
          <Loading label="Loading the map" />
        ) : (
          <IssueMap
            center={center}
            complaints={shown}
            clusters={data.clusters}
            size="lg"
            onSelect={setSelected}
            showLayerToggle
          />
        )}
      </div>

      {selected && (
        <section className="card card--pad fade-in" style={{ marginTop: 16 }}>
          <div className="row row--between row--wrap" style={{ gap: 12 }}>
            <div className="row">
              <Tile icon={CATEGORY_ICON[selected.category] || Icon.file} tone="accent" />
              <div>
                <div className="h h-lg">{selected.category}</div>
                <Label style={{ marginTop: 2 }}>
                  Ward {selected.ward_code} · {selected.distance_m} m away · reported {ago(selected.created_at)}
                </Label>
              </div>
            </div>
            <StatusBadge status={selected.status} />
          </div>

          {selected.cluster_ref && (
            <p className="prose" style={{ fontSize: "var(--t-sm)", marginTop: 12 }}>
              Grouped with {selected.report_count - 1} other reports of the same problem. Reporting it
              again adds weight to that group rather than creating a duplicate.
            </p>
          )}

          <button className="btn btn--ghost btn--sm" style={{ marginTop: 14 }} onClick={() => setSelected(null)}>
            Close
          </button>
        </section>
      )}

      {data && shown.length === 0 && (
        <p className="prose" style={{ marginTop: 16, textAlign: "center" }}>
          Nothing matching that filter within {RADII.find((r) => r.m === radius)?.label}.
        </p>
      )}
    </div>
  );
}
