import { useEffect, useMemo, useState } from "react";
import { Marker, useMap } from "react-leaflet";
import L from "leaflet";
import MapPopup from "./MapPopup.jsx";

/**
 * Complaint photographs as map markers, grouped the way a photo library groups
 * them.
 *
 * Coloured dots say where reports are and nothing about what they are, so
 * reading a street means opening every pin in turn. The photograph is the
 * report — a row of overflowing bins along one road is obvious at a glance in a
 * way six identical dots never are.
 *
 * Grouping is by distance **on screen**, not by distance on the ground. Two
 * complaints 40 m apart overlap at city zoom and are clearly separate at street
 * zoom, so the clusters have to be recomputed whenever the view changes. Doing
 * it geographically would either overlap at one zoom or split at another.
 */

const SEVERITY = {
  critical: "#B32D25",
  high: "#A15C09",
  medium: "#1B5FD4",
  low: "#6E7683",
  resolved: "#0F7A52",
};

/** Marker footprint in pixels; two markers closer than this would overlap. */
const CELL = 58;

const rank = { critical: 4, high: 3, medium: 2, low: 1 };

/**
 * Stand-ins for complaints filed before photographs were stored, and for the
 * seeded data. Emoji rather than an icon font because these are injected as
 * raw HTML into a Leaflet divIcon, where a React component cannot go.
 */
const GLYPH = {
  "Pothole": "\u26A0", "Road crack": "\u26A0", "Open manhole": "\u26A0",
  "Broken footpath": "\u26A0", "Road obstruction": "\u26D4",
  "Garbage overflow": "\uD83D\uDDD1", "Illegal dumping": "\uD83D\uDDD1",
  "Dead animal": "\u2620",
  "Water leakage": "\uD83D\uDCA7", "Broken pipeline": "\uD83D\uDCA7",
  "Damp or seepage on a structure": "\uD83D\uDCA7",
  "Flooding": "\uD83C\uDF0A", "Sewage overflow": "\u2623",
  "Broken streetlight": "\uD83D\uDCA1", "Exposed wire": "\u26A1",
  "Damaged traffic signal": "\uD83D\uDEA6", "Illegal parking": "\uD83D\uDEA7",
  "Unhygienic food stall": "\uD83C\uDF74",
  "Stagnant water": "\uD83E\uDD9F",
  "Dangerous or dead tree": "\uD83C\uDF33",
  "Spitting / paan stains": "\uD83D\uDD34",
  "Defaced wall or property": "\uD83D\uDD8C",
  "Public urination spot": "\uD83D\uDEBB",
  "Persistent noise nuisance": "\uD83D\uDD0A",
  "Stray animal concern": "\uD83D\uDC15",
};

/**
 * Groups points into screen-space cells.
 *
 * A grid rather than true k-means: it is O(n), stable as you pan (a point does
 * not jump between clusters because a neighbour moved), and at this marker size
 * the difference is invisible. Clever clustering that flickers while panning
 * would be worse than a grid that does not.
 */
function cluster(points, map, cell = CELL) {
  const cells = new Map();

  for (const p of points) {
    const pt = map.latLngToContainerPoint([p.lat, p.lng]);
    const key = `${Math.floor(pt.x / cell)}:${Math.floor(pt.y / cell)}`;

    if (!cells.has(key)) cells.set(key, []);
    cells.get(key).push(p);
  }

  return [...cells.values()].map((members) => {
    // The cover photo is the most serious report in the group, then the most
    // recent. Showing an arbitrary member would misrepresent the cluster.
    const sorted = [...members].sort((a, b) => {
      const s = (rank[b.severity] || 0) - (rank[a.severity] || 0);
      return s !== 0 ? s : new Date(b.created_at || 0) - new Date(a.created_at || 0);
    });

    const cover = sorted[0];

    return {
      cover,
      members: sorted,
      count: members.length,
      // Positioned on the cover, not the centroid — a centroid can land in the
      // sea or on a rooftop, and the photograph should sit where it was taken.
      lat: cover.lat,
      lng: cover.lng,
    };
  });
}

function icon({ cover, count }) {
  const tone = cover.status === "resolved" ? "resolved" : cover.severity;
  const colour = SEVERITY[tone] || SEVERITY.medium;

  // Seeded and older complaints have no photograph, and most of a map showing
  // a blank tile is worse than a dot was. The category glyph at least says what
  // the report is, which was the whole reason for moving away from dots.
  const image = cover.image_url
    ? `<img src="${cover.image_url}" alt="" loading="lazy" />`
    : `<span class="photopin__blank" style="background:${colour}1A;color:${colour}">
         ${GLYPH[cover.category] || "!"}
       </span>`;

  return L.divIcon({
    className: "photopin",
    iconSize: [56, 68],
    iconAnchor: [28, 68],
    popupAnchor: [0, -64],
    html: `
      <span class="photopin__stack">
        ${count > 1 ? '<i class="photopin__behind photopin__behind--2"></i>' : ""}
        ${count > 2 ? '<i class="photopin__behind photopin__behind--3"></i>' : ""}
        <span class="photopin__frame" style="border-color:${colour}">${image}</span>
        ${count > 1 ? `<b class="photopin__count">${count > 99 ? "99+" : count}</b>` : ""}
      </span>
      <i class="photopin__tail" style="border-top-color:${colour}"></i>`,
  });
}

export default function PhotoMarkers({ complaints, onSelect }) {
  const map = useMap();
  const [version, setVersion] = useState(0);

  // Recluster after the view settles. `moveend` rather than `move`, so panning
  // stays smooth instead of regrouping on every frame.
  useEffect(() => {
    const bump = () => setVersion((v) => v + 1);
    map.on("moveend zoomend", bump);
    return () => map.off("moveend zoomend", bump);
  }, [map]);

  const groups = useMemo(() => {
    const usable = complaints.filter(
      (c) => Number.isFinite(Number(c.lat)) && Number.isFinite(Number(c.lng))
    );
    return cluster(usable, map);
    // version is the dependency that matters — the map object is stable.
  }, [complaints, map, version]);

  return (
    <>
      {groups.map((g) => (
        <Marker
          key={`${g.cover.ref}-${g.count}`}
          position={[g.lat, g.lng]}
          icon={icon(g)}
          eventHandlers={{
            click: () => {
              // A group zooms in rather than opening one of its members — the
              // point of tapping a stack is to see what is inside it.
              if (g.count > 1 && map.getZoom() < 17) {
                map.flyTo([g.lat, g.lng], Math.min(17, map.getZoom() + 2), {
                  duration: 0.5,
                });
              }
            },
          }}
        >
          {g.count === 1 && <MapPopup complaint={g.cover} onOpen={onSelect} />}
        </Marker>
      ))}
    </>
  );
}