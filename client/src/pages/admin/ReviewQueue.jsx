import { useEffect, useState } from "react";
import { api } from "../../lib/api.js";
import { Label, Pill, Empty, ErrorNote } from "../../components/Primitives.jsx";
import { when } from "../../lib/format.js";

export default function ReviewQueue() {
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);
  const [note, setNote] = useState({});

  const load = () => api.reviewQueue().then((r) => setItems(r.items)).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  async function decide(ref, decision) {
    await api.reviewDecision(ref, decision, note[ref]);
    setItems((list) => list.filter((i) => i.ref !== ref));
  }

  if (error) return <ErrorNote onRetry={load}>{error}</ErrorNote>;
  if (!items) return <div className="label">Loading</div>;

  if (!items.length) {
    return (
      <Empty
        title="Nothing to review"
        body="Photos the analysis could not vouch for are queued here. An empty queue means every recent report passed."
      />
    );
  }

  return (
    <div>
      <Label>{items.length} awaiting a decision</Label>
      <h1 className="display" style={{ marginTop: 4 }}>Image review</h1>
      <p className="prose" style={{ marginTop: 8 }}>
        Nothing here has been rejected. A flag routes a photo to a person; it does not decide
        anything. Detection of synthetic images is not reliable enough to act on alone, so a human
        makes every call and their name goes on it.
      </p>

      <div className="stack" style={{ marginTop: "var(--sp-4)" }}>
        {items.map((item) => (
          <article key={item.ref} className="card card--pad">
            <div className="reviewgrid">
              {item.image_url ? (
                <img
                  src={item.image_url}
                  alt=""
                  style={{ width: "100%", aspectRatio: "4/3", objectFit: "cover", border: "1px solid var(--line)", borderRadius: "var(--radius)" }}
                />
              ) : (
                <div className="card" style={{ aspectRatio: "4/3", display: "grid", placeItems: "center", color: "var(--muted)" }}>
                  Image unavailable
                </div>
              )}

              <div>
                <div className="row" style={{ gap: 8 }}>
                  <Pill tone="high">{item.authenticity.replace(/_/g, " ")}</Pill>
                  <span className="mono label">{item.ref}</span>
                </div>
                <div className="title" style={{ marginTop: 6 }}>{item.category}</div>
                <div className="label" style={{ marginTop: 4 }}>
                  Ward {item.ward_code} · {item.citizen_name || "Anonymous"} · {when(item.created_at)}
                </div>

                <div style={{ marginTop: "var(--sp-3)" }}>
                  <Label>What the analysis noticed ({item.authenticity_confidence}% confidence)</Label>
                  <ul className="prose" style={{ fontSize: "var(--fs-sm)", marginTop: 6, paddingLeft: 18 }}>
                    {(item.notes || []).map((n, i) => <li key={i}>{n}</li>)}
                  </ul>
                </div>

                <input
                  value={note[item.ref] || ""}
                  onChange={(e) => setNote((n) => ({ ...n, [item.ref]: e.target.value }))}
                  placeholder="Note for the record (optional)"
                  style={{
                    width: "100%", marginTop: "var(--sp-3)", padding: "8px 10px", font: "inherit",
                    border: "1px solid var(--line-firm)", borderRadius: "var(--radius)",
                  }}
                />

                <div className="row" style={{ marginTop: "var(--sp-3)" }}>
                  <button className="btn" onClick={() => decide(item.ref, "accepted")}>Genuine — proceed</button>
                  <button className="btn btn--secondary" onClick={() => decide(item.ref, "rejected")}>Reject report</button>
                </div>
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
