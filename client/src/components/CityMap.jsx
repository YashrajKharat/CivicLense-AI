import { useEffect, useState } from "react";
import { MapContainer, TileLayer, CircleMarker, Polygon, Tooltip, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import MapPopup from "./MapPopup.jsx";
import PhotoMarkers from "./PhotoMarkers.jsx";

const TONE = {
  critical: "#B32D25",
  high: "#A15C09",
  medium: "#1B5FD4",
  low: "#6E7683",
  resolved: "#0F7A52",
};

/* Carto Positron — light, low-saturation, and it does not fight the markers.
   Default OSM tiles are far too colourful next to this palette. */
// OpenStreetMap's own tiles. Carto's free light_all endpoint now returns
// "API KEY REQUIRED" watermarked across every tile, which is what was showing
// on every map in the product. OSM needs no key and no account.
//
// Their tile policy asks for modest use and a visible attribution, both of
// which this respects. A production deployment should move to a paid provider
// or self-host, but that is a deployment decision rather than a code one.
const TILES = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const ATTR = "&copy; OpenStreetMap contributors";

const MUMBAI = [19.0728, 72.8826];

/**
 * Leaflet throws on a null coordinate rather than skipping the marker, and one
 * bad row takes down the whole map — which is what a cluster with no centroid
 * did here. Everything entering the map is filtered through this first.
 */
const hasCoords = (p) =>
  p &&
  Number.isFinite(Number(p.lat)) &&
  Number.isFinite(Number(p.lng)) &&
  Math.abs(Number(p.lat)) <= 90 &&
  Math.abs(Number(p.lng)) <= 180;

const asLatLng = (p) => [Number(p.lat), Number(p.lng)];

function FitBounds({ points }) {
  const map = useMap();

  useEffect(() => {
    if (!points.length) return;
    try {
      map.fitBounds(points.map(asLatLng), { padding: [28, 28], maxZoom: 16 });
    } catch {
      // A single degenerate bound should not blank the map.
      map.setView(MUMBAI, 12);
    }
  }, [points, map]);

  return null;
}

export default function CityMap({
  complaints = [],
  clusters = [],
  wards = [],
  mode = "complaints",
  photos: photosDefault = true,
  height = 440,
  onSelectCluster,
  onSelectComplaint,
  center = MUMBAI,
}) {
  const validComplaints = complaints.filter(hasCoords);
  const validClusters = clusters.filter(hasCoords);
  const validWards = wards.filter((w) => Array.isArray(w.polygon) && w.polygon.length >= 3);

  const [photos, setPhotos] = useState(photosDefault);
  const showPins = mode === "complaints";
  const showClusters = mode === "clusters" || mode === "density";
  const fitTo = showClusters ? validClusters : validComplaints;

  const safeCenter = hasCoords({ lat: center?.[0], lng: center?.[1] }) ? center : MUMBAI;

  const dropped =
    complaints.length - validComplaints.length + (clusters.length - validClusters.length);

  return (
    <div className="card" style={{ overflow: "hidden" }}>
      {/* position: relative so the absolutely-placed layer switch anchors
          here rather than escaping to the page. */}
      <div style={{ height: `clamp(240px, 48vh, ${height}px)`, position: "relative" }}>
        {showPins && (
          <div className="map-layers">
            <button aria-pressed={photos} onClick={() => setPhotos(true)}>Photos</button>
            <button aria-pressed={!photos} onClick={() => setPhotos(false)}>Dots</button>
          </div>
        )}

        <MapContainer
          center={safeCenter}
          zoom={12}
          scrollWheelZoom
          style={{ height: "100%", width: "100%", background: "var(--surface-2)" }}
        >
          <TileLayer url={TILES} attribution={ATTR} />

          {validWards.map((w) => (
            <Polygon
              key={w.code}
              positions={w.polygon}
              pathOptions={{ color: "#CFD5DE", weight: 1, fillColor: "#FFFFFF", fillOpacity: 0.4 }}
            >
              <Tooltip direction="center">{w.code}</Tooltip>
            </Polygon>
          ))}

          {showPins && photos && (
            <PhotoMarkers complaints={validComplaints} onSelect={onSelectComplaint} />
          )}

          {showPins && !photos &&
            validComplaints.map((c) => (
              <CircleMarker
                key={c.ref}
                center={asLatLng(c)}
                radius={c.severity === "critical" ? 6 : 4}
                pathOptions={{
                  color: "#fff",
                  weight: 1.5,
                  fillColor: TONE[c.status === "resolved" ? "resolved" : c.severity] || TONE.medium,
                  fillOpacity: 0.9,
                }}
              >
                <Tooltip>{c.category} · {c.ref}</Tooltip>
                <MapPopup complaint={c} onOpen={onSelectComplaint} />
              </CircleMarker>
            ))}

          {showClusters &&
            validClusters.map((cl) => (
              <CircleMarker
                key={cl.ref}
                center={asLatLng(cl)}
                radius={Math.min(10 + (cl.report_count || 1) * 0.35, 26)}
                eventHandlers={{ click: () => onSelectCluster?.(cl) }}
                pathOptions={{
                  color: TONE[cl.severity] || TONE.high,
                  weight: 1.5,
                  fillColor: TONE[cl.severity] || TONE.high,
                  fillOpacity: mode === "density" ? 0.28 : 0.14,
                }}
              >
                <Tooltip>
                  {cl.category} · {cl.report_count} reports
                </Tooltip>
              </CircleMarker>
            ))}

          <FitBounds points={fitTo} />
        </MapContainer>
      </div>

      <div
        className="row row--wrap"
        style={{ gap: 14, padding: "10px 14px", borderTop: "1px solid var(--line)" }}
      >
        {Object.entries(TONE).map(([key, colour]) => (
          <span key={key} className="label" style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <i style={{ width: 8, height: 8, borderRadius: "50%", background: colour, display: "block" }} />
            {key}
          </span>
        ))}

        {dropped > 0 && (
          <span className="label" style={{ marginLeft: "auto", color: "var(--warn)" }}>
            {dropped} record{dropped === 1 ? "" : "s"} without a location not shown
          </span>
        )}
      </div>
    </div>
  );
}