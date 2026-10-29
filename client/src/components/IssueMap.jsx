import { useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, CircleMarker, Marker, Tooltip, ZoomControl, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import MapPopup from "./MapPopup.jsx";
import PhotoMarkers from "./PhotoMarkers.jsx";



/* Leaflet's default marker icons break under a bundler, so the pin is inline SVG. */
const pin = (colour) =>
  L.divIcon({
    className: "",
    html: `<svg width="30" height="40" viewBox="0 0 30 40" xmlns="http://www.w3.org/2000/svg">
      <path d="M15 39C15 39 28 24.6 28 14.6A13 13 0 1 0 2 14.6C2 24.6 15 39 15 39Z"
            fill="${colour}" stroke="white" stroke-width="2.5"/>
      <circle cx="15" cy="14.5" r="4.6" fill="white"/></svg>`,
    iconSize: [30, 40],
    iconAnchor: [15, 39],
  });

export const SEVERITY_COLOUR = {
  critical: "#C0342B",
  high: "#B45309",
  medium: "#1D4ED8",
  low: "#6B7280",
  resolved: "#047857",
};

const MUMBAI = [19.0728, 72.8826];

/**
 * Leaflet throws on a null coordinate instead of skipping the marker, so one bad
 * row blanks the entire map. Everything is filtered through this first.
 */
const hasCoords = (p) =>
  p &&
  Number.isFinite(Number(p.lat)) &&
  Number.isFinite(Number(p.lng)) &&
  Math.abs(Number(p.lat)) <= 90 &&
  Math.abs(Number(p.lng)) <= 180;

const validCenter = (c) =>
  Array.isArray(c) && Number.isFinite(Number(c[0])) && Number.isFinite(Number(c[1]));

// OpenStreetMap's own tiles. Carto's free light_all endpoint now returns
// "API KEY REQUIRED" watermarked across every tile, which is what was showing
// on every map in the product. OSM needs no key and no account.
//
// Their tile policy asks for modest use and a visible attribution, both of
// which this respects. A production deployment should move to a paid provider
// or self-host, but that is a deployment decision rather than a code one.
const TILES = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const ATTR = "&copy; OpenStreetMap contributors";

function Recentre({ center }) {
  const map = useMap();
  useEffect(() => {
    if (!validCenter(center)) return;
    try { map.setView(center, map.getZoom()); } catch { /* keep the current view */ }
  }, [center?.[0], center?.[1]]);
  return null;
}

/**
 * Re-centres on the device's own position. A resident opening the map wants to
 * see their street, and panning there by hand on a phone is tedious.
 */
function LocateButton() {
  const map = useMap();

  return (
    <button
      type="button"
      className="map-locate"
      aria-label="Centre on my location"
      onClick={() => {
        if (!navigator.geolocation) return;
        navigator.geolocation.getCurrentPosition(
          (p) => map.setView([p.coords.latitude, p.coords.longitude], 16),
          () => {},
          { enableHighAccuracy: true, timeout: 8000 }
        );
      }}
    >
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <circle cx="12" cy="12" r="7" />
        <path d="M12 2v3M12 19v3M2 12h3M19 12h3" strokeLinecap="round" />
        <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" />
      </svg>
    </button>
  );
}

function DropPin({ onMove }) {
  useMapEvents({ click: (e) => onMove([e.latlng.lat, e.latlng.lng]) });
  return null;
}

/**
 * One map for both jobs.
 *
 * `pickable` turns it into a location picker — the resident drags the pin to
 * where they actually saw the problem, which matters because GPS indoors can be
 * off by a street, and a pothole reported on the wrong road is a wasted trip
 * for the officer.
 */
export default function IssueMap({
  center,
  complaints = [],
  clusters = [],
  height = 380,
  size = "md",
  // Photographs by default. Dots were the safe choice and the wrong one — the
  // photograph is the report, and a map of identical dots hides the only thing
  // that makes a complaint map worth looking at. Dots remain one tap away for
  // when density matters more than content.
  photos: photosDefault = true,
  showLayerToggle = false,
  pickable = false,
  picked,
  onPick,
  onSelect,
  showClusters = true,
}) {
  const markerIcon = useMemo(() => pin("#F05A28"), []);

  const [photos, setPhotos] = useState(photosDefault);
  const safeCenter = validCenter(center) ? center : MUMBAI;
  const points = complaints.filter(hasCoords);
  const rings = clusters.filter(hasCoords);
  const pinAt = validCenter(picked) ? picked : safeCenter;

  return (
    <div>
      <div className={`mapbox mapbox--${size}`}>
        {showLayerToggle && (
          <div className="map-layers">
            <button aria-pressed={!photos} onClick={() => setPhotos(false)}>Dots</button>
            <button aria-pressed={photos} onClick={() => setPhotos(true)}>Photos</button>
          </div>
        )}
        <MapContainer
          center={safeCenter}
          zoom={15}
          scrollWheelZoom
          zoomControl={false}
          style={{ height: "100%", width: "100%" }}
        >
          <ZoomControl position="topright" />
          <TileLayer url={TILES} attribution={ATTR} />
          <Recentre center={safeCenter} />
          <LocateButton />

          {pickable && (
            <>
              <DropPin onMove={onPick} />
              <Marker
                position={pinAt}
                icon={markerIcon}
                draggable
                eventHandlers={{
                  dragend: (e) => {
                    const { lat, lng } = e.target.getLatLng();
                    onPick([lat, lng]);
                  },
                }}
              />
            </>
          )}

          {showClusters &&
            rings.map((c) => (
              <CircleMarker
                key={c.ref}
                center={[Number(c.lat), Number(c.lng)]}
                radius={Math.min(14 + c.report_count * 0.4, 34)}
                pathOptions={{
                  color: c.is_hotspot ? SEVERITY_COLOUR.critical : SEVERITY_COLOUR.high,
                  weight: 1.5,
                  fillColor: c.is_hotspot ? SEVERITY_COLOUR.critical : SEVERITY_COLOUR.high,
                  fillOpacity: 0.1,
                }}
              >
                <Tooltip>
                  {c.category} — {c.report_count} reports {c.is_hotspot ? "· hotspot" : ""}
                </Tooltip>
              </CircleMarker>
            ))}

          {photos && <PhotoMarkers complaints={points} onSelect={onSelect} />}

          {!photos && points.map((c) => {
            const tone = c.status === "resolved" ? "resolved" : c.severity;

            return (
              <CircleMarker
                key={c.ref}
                center={[Number(c.lat), Number(c.lng)]}
                radius={c.severity === "critical" ? 9 : c.severity === "high" ? 7.5 : 6}
                pathOptions={{
                  color: "#fff",
                  weight: 2,
                  fillColor: SEVERITY_COLOUR[tone] || SEVERITY_COLOUR.medium,
                  fillOpacity: 0.95,
                }}
              >
                {/* Hover still gives the one-line summary — a popup on hover
                    would fight the cursor on a dense map. Clicking opens the
                    photograph. */}
                <Tooltip>
                  <strong>{c.category}</strong>
                  <br />
                  {c.severity} · {c.status.replace(/_/g, " ")}
                </Tooltip>
                <MapPopup complaint={c} onOpen={onSelect} />
              </CircleMarker>
            );
          })}
        </MapContainer>
      </div>

      <div className="row row--wrap" style={{ gap: "var(--s-4)", padding: "var(--s-3) 2px" }}>
        {Object.entries(SEVERITY_COLOUR).map(([key, colour]) => (
          <span key={key} className="label" style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <i style={{ width: 9, height: 9, borderRadius: "50%", background: colour, display: "block" }} />
            {key}
          </span>
        ))}
      </div>
    </div>
  );
}