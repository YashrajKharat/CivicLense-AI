import { useEffect, useState } from "react";
import { api } from "../../lib/api.js";
import { Label, ErrorNote, PageHead, SkeletonRows } from "../../components/Primitives.jsx";
import { when } from "../../lib/format.js";

const TONE = { critical: "critical", high: "high", medium: "medium", low: "low" };

export default function Insights() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = () => api.insights().then(setData).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  async function refresh() {
    setBusy(true);
    try {
      const r = await api.refreshInsights();
      // The brief now carries a headline and summary alongside the items;
      // keeping only `items` threw both away.
      setData(r);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (error) return <ErrorNote onRetry={load}>{error}</ErrorNote>;
  if (!data) return <SkeletonRows rows={4} height={110} />;

  return (
    <div>
      <div className="row row--between" style={{ flexWrap: "wrap", gap: "var(--sp-3)" }}>
        <div>
          <Label>Generated {when(data.generated_at)}</Label>
          <h1 className="display" style={{ marginTop: 4 }}>Today's brief</h1>
        </div>
        <button className="btn btn--secondary" disabled={busy} onClick={refresh}>
          {busy ? "Rebuilding" : "Rebuild"}
        </button>
      </div>

      <div className="stack" style={{ marginTop: "var(--sp-4)" }}>
        {data.summary && (
          <section className="sheet" style={{ marginBottom: "var(--s-5)" }}>
            <h2 className="h h-xl">{data.headline}</h2>
            <p className="prose" style={{ marginTop: "var(--s-3)" }}>{data.summary}</p>
            <p className="label" style={{ marginTop: "var(--s-3)" }}>{data.generated}</p>
          </section>
        )}

        {(data.items || []).map((item, i) => (
          <article
            key={i}
            className="card card--pad"
            style={{ borderLeft: `2px solid var(--${TONE[item.severity] || "medium"})` }}
          >
            <Label style={{ color: `var(--${TONE[item.severity] || "medium"})` }}>{item.tag}</Label>
            <h2 className="title" style={{ marginTop: 6 }}>{item.headline}</h2>
            <p className="prose" style={{ marginTop: 6 }}>{item.detail}</p>
          </article>
        ))}
      </div>

      <p className="prose" style={{ fontSize: "var(--fs-sm)", marginTop: "var(--sp-4)" }}>
        The brief is assembled from four fixed queries rather than an open search, so the same day's
        data always produces the same brief and every figure traces back to a row.
      </p>
    </div>
  );
}
