import { useState } from "react";
import { Label, Badge } from "./Primitives.jsx";
import { Icon } from "./Icons.jsx";

/**
 * Lets the resident overrule the classifier.
 *
 * A photograph of paan staining was confidently filed as water leakage, and the
 * person who took it — standing in front of the wall, who knows exactly what it
 * is — had no way to say so. The model gets the first guess because it is fast,
 * not because it is authoritative.
 *
 * Deliberately quiet by default. Most classifications are right, and a
 * prominent "is this wrong?" invites second-guessing of answers that were fine.
 */
export default function CategoryCorrection({ analysis, categories, value, onChange, lang = "en" }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const copy = {
    en: {
      prompt: "Not what this is?",
      action: "Choose the right one",
      close: "Never mind",
      searching: "Search categories",
      corrected: "You changed this",
      revert: "Use the original guess",
    },
    hi: {
      prompt: "यह सही नहीं है?",
      action: "सही श्रेणी चुनें",
      close: "रहने दें",
      searching: "श्रेणी खोजें",
      corrected: "आपने इसे बदला है",
      revert: "पहला अनुमान रखें",
    },
    mr: {
      prompt: "हे बरोबर नाही?",
      action: "योग्य निवडा",
      close: "नको",
      searching: "श्रेणी शोधा",
      corrected: "तुम्ही हे बदलले आहे",
      revert: "मूळ अंदाज ठेवा",
    },
  }[lang];

  const chosen = categories?.find((c) => c.id === value);

  if (value && chosen) {
    return (
      <div
        style={{
          marginTop: "var(--s-4)", padding: "var(--s-3) var(--s-4)",
          background: "var(--accent-50)", border: "1px solid var(--accent-100)",
          borderRadius: "var(--r)",
        }}
      >
        <div className="row row--between row--wrap" style={{ gap: "var(--s-2)" }}>
          <span className="row" style={{ gap: "var(--s-2)" }}>
            <Icon.check width={15} height={15} style={{ color: "var(--accent)" }} />
            <span style={{ fontSize: "var(--t-sm)" }}>
              {copy.corrected}: <strong>{chosen.name}</strong>
            </span>
          </span>
          <button className="btn--quiet" onClick={() => { onChange(null); setOpen(false); }}>
            {copy.revert}
          </button>
        </div>
        <p className="label" style={{ marginTop: 4 }}>
          Routed to {chosen.department}. The original guess is kept on the record.
        </p>
      </div>
    );
  }

  // A guess is not a result. When the classifier did not recognise the
  // photograph, choosing the category is the task — not an optional correction
  // tucked under an answer that looks settled.
  if (!open && analysis?.low_confidence) {
    return (
      <div
        style={{
          marginTop: "var(--s-4)", padding: "var(--s-4)",
          background: "var(--accent-50)", border: "1px solid var(--accent-100)",
          borderRadius: "var(--r)",
        }}
      >
        <strong style={{ fontSize: "var(--t-sm)" }}>What is this a photo of?</strong>
        <p className="prose" style={{ fontSize: "var(--t-sm)", marginTop: "var(--s-2)" }}>
          The classifier did not recognise it. That often means an ordinary problem it has
          not been trained on yet — not that anything is wrong with your photo.
        </p>
        <button className="btn btn--sm" style={{ marginTop: "var(--s-3)" }} onClick={() => setOpen(true)}>
          Choose the category
        </button>
      </div>
    );
  }

  if (!open) {
    return (
      <button
        className="btn--quiet"
        style={{ marginTop: "var(--s-3)", padding: 0 }}
        onClick={() => setOpen(true)}
      >
        {copy.prompt} <span className="link">{copy.action}</span>
      </button>
    );
  }

  const shown = (categories || []).filter((c) =>
    `${c.name} ${c.department || ""}`.toLowerCase().includes(search.trim().toLowerCase())
  );

  return (
    <div
      style={{
        marginTop: "var(--s-4)", padding: "var(--s-4)",
        background: "var(--surface-2)", borderRadius: "var(--r)",
      }}
    >
      <div className="row row--between">
        <Label>{copy.action}</Label>
        <button className="btn--quiet" onClick={() => setOpen(false)}>{copy.close}</button>
      </div>

      <input
        className="input"
        style={{ marginTop: "var(--s-3)" }}
        placeholder={copy.searching}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        autoFocus
      />

      <div
        style={{
          marginTop: "var(--s-3)", maxHeight: 260, overflowY: "auto",
          display: "grid", gap: 6,
        }}
      >
        {shown.map((c) => (
          <button
            key={c.id}
            className="listrow listrow--link"
            style={{ padding: "var(--s-3)", margin: 0, borderRadius: "var(--r-sm)", background: "var(--surface)" }}
            onClick={() => { onChange(c.id); setOpen(false); }}
          >
            <span style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
              <span className="truncate" style={{ display: "block", fontWeight: 600, fontSize: "var(--t-sm)" }}>
                {c.name}
              </span>
              <span className="label">{c.department}</span>
            </span>
            {analysis?.category === c.name && <Badge tone="pending">suggested</Badge>}
          </button>
        ))}

        {shown.length === 0 && (
          <p className="prose" style={{ fontSize: "var(--t-sm)" }}>Nothing matches that.</p>
        )}
      </div>
    </div>
  );
}
