import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../../lib/api.js";
import { useAuth } from "../../lib/auth.jsx";
import { Badge, Loading, ErrorNote } from "../../components/Primitives.jsx";
import GovShell, { GovField, GovSelect } from "./GovShell.jsx";

/**
 * Where a staff account waits. Also the recovery path for anyone who confirmed
 * their email after signing up, since their request was never filed.
 */
export default function GovStatus() {
  const { profile, signOut } = useAuth();
  const [application, setApplication] = useState(undefined);
  const navigate = useNavigate();

  useEffect(() => {
    if (["global_admin", "super_admin"].includes(profile?.role)) {
      navigate("/admin", { replace: true });
      return;
    }
    if (profile?.role === "officer") {
      navigate("/officer", { replace: true });
      return;
    }
    api.myApplication().then((r) => setApplication(r.application)).catch(() => setApplication(null));
  }, [profile?.role]);

  if (application === undefined) return <Loading label="Checking your access" />;
  if (!application) return <FinishRequest onDone={setApplication} />;

  const copy = {
    pending: {
      title: "Awaiting approval",
      body: "A global administrator has your request. You will not see the staff interface until it is approved.",
      tone: "warn",
    },
    approved: {
      title: "Access granted",
      body: "Sign out and back in to pick up your new role.",
      tone: "ok",
    },
    rejected: {
      title: "Request declined",
      body: application.decision_note || "No reason was recorded.",
      tone: "danger",
    },
  }[application.status];

  return (
    <GovShell
      title={copy.title}
      sub={`Requested ${application.requested_role.replace("_", " ")}`}
      badge="Access status"
    >
      <Badge tone={copy.tone}>{application.status}</Badge>
      <p style={{ marginTop: 14, color: "var(--on-dark-2)", lineHeight: 1.65 }}>{copy.body}</p>

      <div className="row" style={{ gap: 10, marginTop: "var(--s-6)" }}>
        {application.status === "approved" ? (
          <button className="btn" onClick={signOut}>Sign out and back in</button>
        ) : (
          <Link to="/app" className="btn btn--ghost-dark">Use the resident app meanwhile</Link>
        )}
      </div>
    </GovShell>
  );
}

function FinishRequest({ onDone }) {
  const { session, profile } = useAuth();
  const [departments, setDepartments] = useState([]);
  const [form, setForm] = useState({
    full_name: profile?.full_name || "",
    employee_id: "",
    requested_role: "officer",
    department_id: "",
    designation: "",
  });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    fetch(`${import.meta.env.VITE_API_URL || ""}/api/staff/departments`)
      .then((r) => r.json())
      .then((d) => setDepartments(d.departments || []))
      .catch(() => setDepartments([]));
  }, []);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api.applyForStaff({ ...form, department_id: Number(form.department_id) });
      onDone(r.application);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <GovShell title="Finish your request" sub={`Signed in as ${session?.user?.email}`} badge="One step left">
      <form onSubmit={submit} className="stack">
        <GovField label="Full name" value={form.full_name} onChange={set("full_name")} required />
        <GovField label="Employee / staff ID" value={form.employee_id} onChange={set("employee_id")} required />

        <GovSelect label="Role requested" value={form.requested_role} onChange={set("requested_role")}>
          <option value="officer">Field officer</option>
          <option value="super_admin">Department super admin</option>
        </GovSelect>

        <GovSelect label="Department" value={form.department_id} onChange={set("department_id")}>
          <option value="">Choose one</option>
          {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </GovSelect>

        <GovField label="Designation (optional)" value={form.designation} onChange={set("designation")} />

        {error && <ErrorNote>{error}</ErrorNote>}
        <button className="btn btn--block" disabled={busy}>
          {busy ? "Submitting…" : "Submit request"}
        </button>
      </form>
    </GovShell>
  );
}
