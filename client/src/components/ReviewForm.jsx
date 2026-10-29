import { useState } from "react";
import { api } from "../lib/api.js";
import { Label, Badge, ErrorNote } from "./Primitives.jsx";

const STARS = [1, 2, 3, 4, 5];

function Stars({ value, onChange, label }) {
  return (
    <div>
      <Label>{label}</Label>
      <div className="row" style={{ gap: 4, marginTop: 4 }}>
        {STARS.map((n) => (
          <button
            key={n}
            type="button"
            aria-label={`${n} out of 5`}
            onClick={() => onChange(n)}
            style={{
              fontSize: 22,
              lineHeight: 1,
              padding: "2px 3px",
              color: n <= value ? "var(--warn)" : "var(--line-firm)",
            }}
          >
            ★
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * A thumbs-up closed the complaint but said nothing about the quality of the
 * work, so a department could hit every deadline and still do a bad job. Speed
 * and quality are asked separately because they fail independently — a fast,
 * shoddy patch and a slow, proper repair are different problems.
 */
export default function ReviewForm({ complaintRef, existing, onDone }) {
  const [rating, setRating] = useState(existing?.rating ?? 0);
  const [speed, setSpeed] = useState(existing?.speed_rating ?? 0);
  const [quality, setQuality] = useState(existing?.quality_rating ?? 0);
  const [comment, setComment] = useState(existing?.comment ?? "");
  const [again, setAgain] = useState(existing?.would_report_again ?? true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  if (existing && !busy) {
    return (
      <div
        style={{
          padding: "var(--s-4)",
          background: "var(--surface-2)",
          borderRadius: "var(--r)",
        }}
      >
        <div className="row row--between">
          <Label>Your review</Label>
          <span style={{ color: "var(--warn)" }}>{"★".repeat(existing.rating)}</span>
        </div>
        {existing.comment && (
          <p className="prose" style={{ fontSize: "var(--t-sm)", marginTop: "var(--s-2)" }}>
            {existing.comment}
          </p>
        )}
        <p className="label" style={{ marginTop: "var(--s-3)" }}>
          Shared with the officer and their department. Your name is not attached.
        </p>
      </div>
    );
  }

  async function submit(e) {
    e.preventDefault();
    if (!rating) {
      setError("Give an overall rating first.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.reviewComplaint(complaintRef, {
        rating,
        speed_rating: speed || undefined,
        quality_rating: quality || undefined,
        comment: comment.trim() || undefined,
        would_report_again: again,
      });
      // The parent reloads and this form is replaced by the saved review, so
      // clearing busy looked unnecessary. It is not: onDone triggers a fetch,
      // and until that resolves this component is still mounted showing
      // "Sending…" — for a second or two on a fast connection, indefinitely if
      // the reload fails. The review had already saved.
      onDone?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      style={{
        padding: "var(--s-5)",
        background: "var(--accent-50)",
        border: "1px solid var(--accent-100)",
        borderRadius: "var(--r)",
      }}
    >
      <strong>How did they do?</strong>
      <p className="prose" style={{ fontSize: "var(--t-sm)", marginTop: 4 }}>
        Your rating goes on the officer's record and the agency's scorecard.
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))",
          gap: "var(--s-4)",
          marginTop: "var(--s-4)",
        }}
      >
        <Stars label="Overall" value={rating} onChange={setRating} />
        <Stars label="How quickly" value={speed} onChange={setSpeed} />
        <Stars label="How well" value={quality} onChange={setQuality} />
      </div>

      <label className="field" style={{ marginTop: "var(--s-4)" }}>
        <span className="label">Anything worth saying? (optional)</span>
        <textarea
          className="input"
          rows={3}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Was it actually fixed properly? Did it take too long?"
        />
      </label>

      <label className="row" style={{ marginTop: "var(--s-3)", gap: "var(--s-2)", cursor: "pointer" }}>
        <input type="checkbox" checked={again} onChange={(e) => setAgain(e.target.checked)} />
        <span style={{ fontSize: "var(--t-sm)" }}>I would report another issue here</span>
      </label>

      {error && <div style={{ marginTop: "var(--s-3)" }}><ErrorNote>{error}</ErrorNote></div>}

      <button className="btn" style={{ marginTop: "var(--s-4)" }} disabled={busy}>
        {busy ? "Sending…" : "Submit review"}
      </button>
    </form>
  );
}
