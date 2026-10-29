import { useEffect, useState } from "react";
import { api } from "../lib/api.js";
import IssueMap from "./IssueMap.jsx";
import { Badge, Label } from "./Primitives.jsx";
import { Icon } from "./Icons.jsx";

const ago = (iso) => {
  const days = Math.floor((Date.now() - new Date(iso)) / 864e5);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
};

/**
 * Shows the resident what is already reported at this spot before they file.
 *
 * A duplicate is not waste — it adds a witness and pushes the group up the
 * priority list. But that should be a decision someone makes knowingly, and
 * "eleven neighbours have already reported this" is far more reassuring than a
 * silent confirmation screen that gives no sense of whether anyone else cares.
 */
export default function DuplicateNotice({ lat, lng, categoryId, lang = "en" }) {
  const [data, setData] = useState(null);
  const [showMap, setShowMap] = useState(false);

  useEffect(() => {
    if (!lat || !lng) return;
    let live = true;
    api.duplicates(lat, lng, categoryId)
      .then((r) => live && setData(r))
      .catch(() => live && setData(null));
    return () => { live = false; };
  }, [lat, lng, categoryId]);

  if (!data || data.already_reported === 0) return null;

  const group = data.strongest;
  const count = group?.report_count || data.already_reported;

  const copy = {
    en: {
      title: `${count} ${count === 1 ? "person has" : "people have"} already reported this`,
      body: "Your report still counts — it adds a witness and pushes this group higher up the list. Nothing is wasted by reporting it again.",
      see: "See them on the map",
      hide: "Hide the map",
    },
    hi: {
      title: `${count} ${count === 1 ? "व्यक्ति" : "लोग"} पहले ही इसकी शिकायत कर चुके हैं`,
      body: "आपकी शिकायत फिर भी गिनी जाएगी — इससे गवाह बढ़ते हैं और यह मामला ऊपर आता है।",
      see: "नक्शे पर देखें",
      hide: "नक्शा छिपाएँ",
    },
    mr: {
      title: `${count} ${count === 1 ? "व्यक्तीने" : "लोकांनी"} याची आधीच तक्रार केली आहे`,
      body: "तुमची तक्रार तरीही मोजली जाईल — साक्षीदार वाढतात आणि हे प्रकरण वर येते.",
      see: "नकाशावर पहा",
      hide: "नकाशा लपवा",
    },
  }[lang];

  return (
    <section
      style={{
        marginTop: "var(--s-4)",
        padding: "var(--s-4)",
        background: "var(--accent-50)",
        border: "1px solid var(--accent-100)",
        borderRadius: "var(--r)",
      }}
    >
      <div className="row row--top" style={{ gap: "var(--s-3)" }}>
        <Icon.map width={18} height={18} style={{ color: "var(--accent)", flex: "none", marginTop: 2 }} />

        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="row row--wrap" style={{ gap: "var(--s-2)" }}>
            <strong style={{ fontSize: "var(--t-sm)" }}>{copy.title}</strong>
            {group?.is_hotspot && <Badge tone="warn">hotspot</Badge>}
          </div>

          <p className="prose" style={{ fontSize: "var(--t-sm)", marginTop: "var(--s-2)" }}>
            {copy.body}
          </p>

          {group && (
            <div className="row row--wrap" style={{ gap: "var(--s-3)", marginTop: "var(--s-3)" }}>
              <span className="label">{group.category}</span>
              <span className="label">{group.distance_m} m away</span>
              <span className="label">first reported {ago(group.first_reported)}</span>
            </div>
          )}

          <button
            className="btn btn--secondary btn--sm"
            style={{ marginTop: "var(--s-3)" }}
            onClick={() => setShowMap((v) => !v)}
          >
            {showMap ? copy.hide : copy.see}
          </button>
        </div>
      </div>

      {showMap && (
        <div style={{ marginTop: "var(--s-4)" }}>
          <IssueMap
            center={[lat, lng]}
            complaints={data.nearby}
            clusters={data.clusters}
            size="sm"
          />
          <Label style={{ marginTop: "var(--s-2)" }}>
            Rings are groups of reports about the same problem.
          </Label>
        </div>
      )}
    </section>
  );
}
