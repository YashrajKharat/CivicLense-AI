import { useEffect, useState, useCallback } from "react";
import { api } from "../../lib/api.js";
import { useAuth } from "../../lib/auth.jsx";
import {
  Panel, Badge, Label, ErrorNote, SkeletonRows, PageHead, Segment, Empty,
} from "../../components/Primitives.jsx";
import { Icon } from "../../components/Icons.jsx";
import { ago } from "../../lib/format.js";

const PARTY = {
  contractor: { label: "Contractor", note: "an agency is paid to maintain this" },
  establishment: { label: "Premises", note: "a licensed business is answerable" },
  department: { label: "Department", note: "handled by a departmental crew" },
};

export default function Categories() {
  const { profile } = useAuth();
  const [rows, setRows] = useState(null);
  const [departments, setDepartments] = useState([]);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState("active");
  const [editing, setEditing] = useState(null);

  const load = useCallback(() => {
    api.categories(true).then((r) => setRows(r.categories)).catch((e) => setError(e.message));
    api.staffDepartments().then((d) => setDepartments(d.departments)).catch(() => {});
  }, []);

  useEffect(() => { load(); }, [load]);

  async function toggle(cat) {
    setError(null);
    try {
      const r = await api.setCategoryActive(cat.id, !cat.active);
      if (r.note) setError(r.note);
      load();
    } catch (e) {
      setError(e.message);
    }
  }

  if (error && !rows) return <ErrorNote onRetry={load}>{error}</ErrorNote>;

  const shown = !rows ? [] : rows.filter((c) =>
    filter === "all" ? true : filter === "active" ? c.active : !c.active
  );

  const scoped = profile?.role === "super_admin";

  return (
    <div className="fade-in">
      <PageHead
        title="Categories"
        sub={
          scoped
            // department_name is null for a global admin, who has no single
            // department — it printed "report to null" on the page header.
            ? `What residents can report to ${profile?.department_name || "your department"}. Adding one takes effect immediately.`
            : "What residents can report, and which department each one routes to."
        }
        actions={
          <div className="row" style={{ gap: "var(--s-2)" }}>
            <Segment
              value={filter}
              onChange={setFilter}
              options={[
                { id: "active", label: "Active", count: rows?.filter((c) => c.active).length },
                { id: "inactive", label: "Retired" },
                { id: "all", label: "All" },
              ]}
            />
            <button className="btn" onClick={() => setEditing({})}>
              <Icon.file width={15} height={15} /> New category
            </button>
          </div>
        }
      />

      {error && <div style={{ marginBottom: "var(--s-4)" }}><ErrorNote>{error}</ErrorNote></div>}

      {!rows ? (
        <SkeletonRows rows={6} height={58} />
      ) : shown.length === 0 ? (
        <Empty
          icon={Icon.file}
          title={filter === "inactive" ? "Nothing retired" : "No categories"}
          body="Add one and residents can report it from their next visit."
          action={<button className="btn" onClick={() => setEditing({})}>New category</button>}
        />
      ) : (
        <Panel title={`${shown.length} categories`} flush>
          <div className="scroll-x">
            <table className="table table--stack">
              <thead>
                <tr>
                  <th>Category</th><th>Routes to</th><th>Answerable</th>
                  <th>Base severity</th><th>Used</th><th></th>
                </tr>
              </thead>
              <tbody>
                {shown.map((c) => (
                  <tr key={c.id} style={{ opacity: c.active ? 1 : 0.55 }}>
                    <td data-label="Category">
                      <div className="row" style={{ gap: "var(--s-2)" }}>
                        <span style={{ fontWeight: 600 }}>{c.name}</span>
                        {!c.active && <Badge tone="pending">retired</Badge>}
                      </div>
                      <div className="label mono">{c.code}</div>
                      {c.description && <div className="label">{c.description}</div>}
                    </td>
                    <td data-label="Routes to">{c.department || "—"}</td>
                    <td data-label="Answerable">
                      <Badge tone="pending">{PARTY[c.responsible_party]?.label || c.responsible_party}</Badge>
                    </td>
                    <td data-label="Base severity" className="mono">{c.base_severity}</td>
                    <td data-label="Used">
                      <span className="mono">{c.total || 0}</span>
                      {c.open > 0 && <span className="label"> · {c.open} open</span>}
                      {c.last_used && <div className="label">last {ago(c.last_used)}</div>}
                    </td>
                    <td data-label="">
                      <div className="row" style={{ gap: 6, justifyContent: "flex-end" }}>
                        <button className="btn btn--secondary btn--sm" onClick={() => setEditing(c)}>
                          Edit
                        </button>
                        <button className="btn--quiet" onClick={() => toggle(c)}>
                          {c.active ? "Retire" : "Restore"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      {/* The gap between what the taxonomy allows and what the classifier can
          recognise is worth stating on the page that lists them. Fourteen of
          these can be predicted from a photograph; the rest reach the right
          department because a resident picked them, which is the intended path
          rather than a shortcoming. */}
      <div
        style={{
          marginTop: "var(--s-5)", padding: "var(--s-4)",
          background: "var(--record-bg)", border: "1px solid var(--record-line)",
          borderRadius: "var(--r)",
        }}
      >
        <strong style={{ fontSize: "var(--t-sm)" }}>
          The classifier recognises 14 of these
        </strong>
        <p className="prose" style={{ fontSize: "var(--t-sm)", marginTop: "var(--s-2)" }}>
          It was trained on the categories there were photographs for. Several are
          deliberately grouped, because a photograph cannot separate them — leakage,
          seepage, flooding and contamination all look alike, so the model predicts
          one water category and the resident's answers decide which.
        </p>
        <p className="prose" style={{ fontSize: "var(--t-sm)", marginTop: "var(--s-2)" }}>
          Everything else still routes correctly. A resident picks it, or the report goes
          to ward triage. Categories are added here freely; the classifier catches up when
          there are photographs to train it on.
        </p>
      </div>

      <p className="prose" style={{ fontSize: "var(--t-sm)", marginTop: "var(--s-4)" }}>
        Categories are retired, never deleted — complaints reference them, and removing one would
        orphan its history. A retired category disappears from the resident's report form while
        existing reports keep their classification.
      </p>

      {editing && (
        <CategoryDialog
          category={editing}
          departments={departments}
          scopedTo={scoped ? profile?.department_id : null}
          onClose={() => setEditing(null)}
          onDone={() => { setEditing(null); load(); }}
        />
      )}
    </div>
  );
}

function CategoryDialog({ category, departments, scopedTo, onClose, onDone }) {
  const isNew = !category.id;
  const [form, setForm] = useState({
    code: category.code || "",
    name: category.name || "",
    description: category.description || "",
    default_department_id: category.department_id || scopedTo || "",
    base_severity: category.base_severity ?? 40,
    responsible_party: category.responsible_party || "contractor",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const payload = {
        ...form,
        default_department_id: Number(form.default_department_id),
        base_severity: Number(form.base_severity),
      };
      if (isNew) await api.createCategory(payload);
      else {
        delete payload.code;
        await api.updateCategory(category.id, payload);
      }
      onDone();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      style={{
        position: "fixed", inset: 0, zIndex: 150, background: "rgba(8,8,10,.55)",
        display: "grid", placeItems: "center", padding: "var(--s-4)",
      }}
    >
      <form
        onSubmit={submit}
        className="card card--pad"
        style={{ width: "100%", maxWidth: 520, maxHeight: "88vh", overflowY: "auto" }}
      >
        <div className="row row--between">
          <h2 className="h h-lg">{isNew ? "New category" : `Edit ${category.name}`}</h2>
          <button type="button" className="btn--quiet" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="stack" style={{ marginTop: "var(--s-5)" }}>
          {isNew && (
            <label className="field">
              <span className="label">Code</span>
              <input
                className="input mono"
                value={form.code}
                onChange={(e) => set("code")(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ""))}
                placeholder="FALLEN_BRANCH"
                required
              />
              <span className="label" style={{ marginTop: 4, display: "block" }}>
                Permanent. Capitals, digits and underscores.
              </span>
            </label>
          )}

          <label className="field">
            <span className="label">Name residents see</span>
            <input className="input" value={form.name} onChange={(e) => set("name")(e.target.value)} required />
          </label>

          <label className="field">
            <span className="label">Description (optional)</span>
            <input
              className="input"
              value={form.description}
              onChange={(e) => set("description")(e.target.value)}
              placeholder="Helps the classifier and the resident pick correctly"
            />
          </label>

          <label className="field">
            <span className="label">Routes to</span>
            <select
              className="input"
              value={form.default_department_id}
              onChange={(e) => set("default_department_id")(e.target.value)}
              disabled={Boolean(scopedTo)}
              required
            >
              <option value="">Choose a department</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
            {scopedTo && (
              <span className="label" style={{ marginTop: 4, display: "block" }}>
                Fixed to your department. Only a global super admin can route work elsewhere.
              </span>
            )}
          </label>

          <div>
            <Label>Who is answerable</Label>
            <div className="stack-sm" style={{ marginTop: "var(--s-2)" }}>
              {Object.entries(PARTY).map(([id, { label, note }]) => (
                <label
                  key={id}
                  className="row"
                  style={{
                    gap: "var(--s-3)", padding: "var(--s-3)", cursor: "pointer",
                    border: "1px solid var(--line)", borderRadius: "var(--r)",
                    background: form.responsible_party === id ? "var(--accent-50)" : "var(--surface)",
                    borderColor: form.responsible_party === id ? "var(--accent-100)" : "var(--line)",
                  }}
                >
                  <input
                    type="radio"
                    name="party"
                    checked={form.responsible_party === id}
                    onChange={() => set("responsible_party")(id)}
                  />
                  <span>
                    <strong style={{ fontSize: "var(--t-sm)" }}>{label}</strong>
                    <span className="label" style={{ display: "block" }}>{note}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>

          <label className="field">
            <span className="label">Base severity — {form.base_severity}</span>
            <input
              type="range"
              min={0}
              max={100}
              value={form.base_severity}
              onChange={(e) => set("base_severity")(e.target.value)}
              style={{ width: "100%", marginTop: 6 }}
            />
            <span className="label" style={{ marginTop: 4, display: "block" }}>
              The starting score before context is added. An open manhole sits near 85; a faded
              road sign near 30.
            </span>
          </label>

          {error && <ErrorNote>{error}</ErrorNote>}

          <div className="row" style={{ gap: "var(--s-3)" }}>
            <button className="btn" disabled={busy}>
              {busy ? "Saving…" : isNew ? "Create category" : "Save changes"}
            </button>
            <button type="button" className="btn btn--secondary" onClick={onClose}>Cancel</button>
          </div>

          {isNew && (
            <p className="label">
              Default SLA rules are created with it — 12h critical, 24h high, 3d medium, 7d low.
            </p>
          )}
        </div>
      </form>
    </div>
  );
}
