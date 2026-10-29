import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase.js";
import { api } from "../../lib/api.js";
import { ErrorNote, Badge } from "../../components/Primitives.jsx";
import GovShell, { GovField, GovSelect } from "./GovShell.jsx";

const GOV = /@([a-z0-9-]+\.)*(gov\.in|nic\.in)$/i;

/**
 * Registration and the access request are one flow, because they are one
 * intention. The account is created server-side and marked confirmed, so no
 * verification link is sent — these are internal government addresses, and a
 * link that never arrives leaves the applicant stranded.
 *
 * Nothing here grants access. The account is a resident until the right
 * administrator approves it:
 *
 *   super admin request  →  decided by a global super admin
 *   officer request      →  decided by that department's super admin
 */
export default function GovRegister() {
  const [step, setStep] = useState(1);
  const [departments, setDepartments] = useState([]);
  const [form, setForm] = useState({
    email: "", password: "", full_name: "", employee_id: "",
    requested_role: "officer", department_id: "",
    designation: "", phone: "", justification: "",
  });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  const set = (key) => (value) => setForm((f) => ({ ...f, [key]: value }));

  useEffect(() => {
    api.staffDepartments()
      .then((d) => setDepartments(d.departments))
      .catch(() => setDepartments([]));
  }, []);

  function next(e) {
    e.preventDefault();
    if (!GOV.test(form.email)) {
      setError("Staff accounts need an email ending in gov.in or nic.in.");
      return;
    }
    if (form.password.length < 8) {
      setError("Use at least eight characters for your password.");
      return;
    }
    setError(null);
    setStep(2);
  }

  async function submit(e) {
    e.preventDefault();
    if (!form.department_id) {
      setError("Choose the department you work for.");
      return;
    }

    setBusy(true);
    setError(null);

    try {
      await api.registerStaff({ ...form, department_id: Number(form.department_id) });

      // The account is already confirmed, so sign straight in and land on the
      // status page rather than asking them to log in again.
      await supabase.auth.signInWithPassword({ email: form.email, password: form.password });
      navigate("/gov/status", { replace: true });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  const approver =
    form.requested_role === "super_admin"
      ? "a global super admin"
      : "your department's super admin";

  return (
    <GovShell
      title="Request staff access"
      sub={step === 1 ? "Step 1 of 2 — your official account." : "Step 2 of 2 — your posting."}
      footer={<>Already have access? <Link to="/gov" className="link">Sign in</Link></>}
    >
      {step === 1 ? (
        <form onSubmit={next} className="stack">
          <GovField
            label="Government email"
            type="email"
            value={form.email}
            onChange={set("email")}
            placeholder="name@department.gov.in"
            hint="Must end in gov.in or nic.in. No verification email is sent — the account is created directly."
            autoComplete="email"
            required
          />
          <GovField
            label="Create a password"
            type="password"
            value={form.password}
            onChange={set("password")}
            placeholder="At least 8 characters"
            autoComplete="new-password"
            required
          />
          {error && <ErrorNote>{error}</ErrorNote>}
          <button className="btn btn--block">Continue</button>
        </form>
      ) : (
        <form onSubmit={submit} className="stack">
          <GovField label="Full name" value={form.full_name} onChange={set("full_name")} required />
          <GovField label="Employee / staff ID" value={form.employee_id} onChange={set("employee_id")} required />

          <GovSelect label="Role requested" value={form.requested_role} onChange={set("requested_role")}>
            <option value="officer">Field officer</option>
            <option value="super_admin">Department super admin</option>
          </GovSelect>

          <GovSelect label="Department" value={form.department_id} onChange={set("department_id")}>
            <option value="">Choose one</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </GovSelect>

          <GovField label="Designation (optional)" value={form.designation} onChange={set("designation")} />
          <GovField label="Phone (optional)" value={form.phone} onChange={set("phone")} />

          <div
            style={{
              padding: "var(--s-4)", borderRadius: "var(--r)",
              background: "var(--ink-900)", border: "1px solid var(--ink-line)",
            }}
          >
            <Badge tone="accent">Decided by {approver}</Badge>
            <p style={{ margin: "8px 0 0", fontSize: "var(--t-xs)", color: "var(--on-dark-2)", lineHeight: 1.6 }}>
              Until then your account behaves as an ordinary resident. Nothing in this form grants
              access by itself.
            </p>
          </div>

          {error && <ErrorNote>{error}</ErrorNote>}

          <div className="row" style={{ gap: "var(--s-3)" }}>
            <button type="button" className="btn btn--ghost-dark" onClick={() => setStep(1)}>Back</button>
            <button className="btn" style={{ flex: 1 }} disabled={busy}>
              {busy ? "Submitting…" : "Create account and request access"}
            </button>
          </div>
        </form>
      )}
    </GovShell>
  );
}
