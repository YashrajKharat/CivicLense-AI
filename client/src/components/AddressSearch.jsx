import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api.js";
import { Icon } from "./Icons.jsx";

/**
 * Type an address, pick a result, move the pin.
 *
 * GPS is wrong indoors, and useless when someone is reporting a hazard they
 * walked past an hour ago. Dragging a pin across a city on a phone is worse.
 * Typing is the only reliable way in, so it belongs above the map rather than
 * hidden behind it.
 */
export default function AddressSearch({ near, onPick }) {
  const [text, setText] = useState("");
  const [results, setResults] = useState(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);

  // Debounced: Nominatim asks for no more than one request a second, and
  // firing on every keystroke would get the whole IP blocked.
  useEffect(() => {
    if (text.trim().length < 3) {
      setResults(null);
      return;
    }

    let live = true;
    setBusy(true);

    const timer = setTimeout(() => {
      api.searchAddress(text, near)
        .then((r) => { if (live) { setResults(r.results); setOpen(true); } })
        .catch(() => live && setResults([]))
        .finally(() => live && setBusy(false));
    }, 550);

    return () => { live = false; clearTimeout(timer); };
  }, [text]);

  useEffect(() => {
    const onDown = (e) => { if (!boxRef.current?.contains(e.target)) setOpen(false); };
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  function choose(r) {
    onPick([r.lat, r.lng], r);
    setText(r.title);
    setOpen(false);
  }

  return (
    <div style={{ position: "relative" }} ref={boxRef}>
      <div className="search" style={{ maxWidth: "none", width: "100%" }}>
        <Icon.search width={16} height={16} />
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onFocus={() => results && setOpen(true)}
          placeholder="Search a street, landmark or area"
          aria-label="Search for an address"
        />
        {busy && <span className="label">searching…</span>}
        {text && !busy && (
          <button
            className="btn--quiet"
            style={{ padding: 4 }}
            onClick={() => { setText(""); setResults(null); }}
            aria-label="Clear"
          >
            ✕
          </button>
        )}
      </div>

      {open && results && (
        <div
          className="card"
          style={{
            position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0,
            zIndex: 500, maxHeight: 280, overflowY: "auto", boxShadow: "var(--sh-3)",
          }}
        >
          {results.length === 0 ? (
            <p className="prose" style={{ fontSize: "var(--t-sm)", padding: "var(--s-4)", margin: 0 }}>
              Nothing found. Try a nearby landmark, or drag the pin instead.
            </p>
          ) : (
            results.map((r, i) => (
              <button
                key={i}
                className="listrow listrow--link"
                style={{ padding: "var(--s-3) var(--s-4)", margin: 0, borderRadius: 0 }}
                onClick={() => choose(r)}
              >
                <Icon.pin width={15} height={15} style={{ color: "var(--accent)", flex: "none" }} />
                <span style={{ minWidth: 0 }}>
                  <span className="truncate" style={{ display: "block", fontWeight: 600, fontSize: "var(--t-sm)" }}>
                    {r.title}
                  </span>
                  <span className="truncate label" style={{ display: "block" }}>
                    {r.subtitle || r.full}
                  </span>
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
