import { Popup } from "react-leaflet";

/**
 * What a pin says when you click it.
 *
 * A tooltip could only carry text, so a map of 300 complaints was 300 identical
 * dots — you had to open each one to learn anything. The photograph is the
 * whole basis of a report, and seeing it here is the difference between "a dot
 * in Kurla" and knowing at a glance whether it is worth sending someone.
 */
export default function MapPopup({ complaint, onOpen }) {
  const c = complaint;

  return (
    <Popup minWidth={210} maxWidth={240} closeButton={false}>
      <div style={{ width: 210 }}>
        {c.image_url ? (
          <img
            src={c.image_url}
            alt={c.category}
            loading="lazy"
            style={{
              width: "100%", aspectRatio: "4/3", objectFit: "cover",
              borderRadius: "var(--r-sm)", display: "block",
              background: "var(--surface-2)",
            }}
          />
        ) : (
          <div
            style={{
              width: "100%", aspectRatio: "4/3", borderRadius: "var(--r-sm)",
              background: "var(--surface-2)", display: "grid", placeItems: "center",
              color: "var(--muted)", fontSize: "var(--t-xs)",
            }}
          >
            No photo
          </div>
        )}

        <div style={{ marginTop: 8 }}>
          <div className="row row--between" style={{ gap: 8 }}>
            <strong style={{ fontSize: "var(--t-sm)" }}>{c.category}</strong>
            <span
              className={`badge badge--${
                { critical: "danger", high: "warn", medium: "info", low: "pending" }[c.severity] ||
                "pending"
              }`}
              style={{ flex: "none", fontSize: 10 }}
            >
              {c.severity}
            </span>
          </div>

          <div className="label" style={{ marginTop: 3 }}>
            {c.ref}
            {c.ward_code && ` · Ward ${c.ward_code}`}
            {c.distance_m != null && ` · ${c.distance_m} m away`}
          </div>

          {c.report_count > 1 && (
            <div className="label" style={{ marginTop: 3 }}>
              {c.report_count} residents reported this
            </div>
          )}

          {onOpen && (
            <button
              className="btn btn--sm btn--block"
              style={{ marginTop: 8 }}
              onClick={() => onOpen(c)}
            >
              Open report
            </button>
          )}
        </div>
      </div>
    </Popup>
  );
}
