import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../lib/api.js";
import { useAuth } from "../../lib/auth.jsx";
import { LANGUAGES, useT } from "../../lib/i18n.jsx";
import Modal from "../../components/Modal.jsx";
import {
  Panel, Label, Badge, ErrorNote, PageHead, Segment, Loading,
} from "../../components/Primitives.jsx";
import { Icon } from "../../components/Icons.jsx";

const STATES = [
  "Maharashtra", "Gujarat", "Karnataka", "Delhi", "Tamil Nadu", "Telangana",
  "West Bengal", "Rajasthan", "Uttar Pradesh", "Madhya Pradesh", "Kerala", "Punjab",
];

export default function Settings() {
  const { profile, session, refresh, signOut } = useAuth();
  const { lang, setLang } = useT();
  const navigate = useNavigate();

  const [me, setMe] = useState(null);
  const [tab, setTab] = useState("profile");
  const [form, setForm] = useState(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [dialog, setDialog] = useState(null);
  const fileRef = useRef();

  useEffect(() => {
    api.me().then((r) => {
      setMe(r.profile);
      setForm({
        full_name: r.profile.full_name || "",
        phone: r.profile.phone || "",
        area: r.profile.area || "",
        city: r.profile.city || "",
        state: r.profile.state || "",
        pincode: r.profile.pincode || "",
      });
    }).catch((e) => setError(e.message));
  }, []);

  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await api.updateMe({ ...form, language: lang });
      await refresh();
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function onAvatar(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const r = await api.uploadAvatar(file);
      setMe((m) => ({ ...m, avatar_url: r.avatar_url }));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  }

  if (!me || !form) return <Loading />;

  const initials = (me.full_name || "").split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();

  return (
    <div className="fade-in" style={{ maxWidth: 720 }}>
      <PageHead
        title="Profile"
        sub="Everything except your name is optional."
        actions={
          <Segment
            value={tab}
            onChange={setTab}
            options={[
              { id: "profile", label: "Details" },
              { id: "security", label: "Security" },
            ]}
          />
        }
      />

      {error && <div style={{ marginBottom: "var(--s-4)" }}><ErrorNote>{error}</ErrorNote></div>}

      {tab === "profile" ? (
        <div className="stack">
          <Panel title="You">
            <div className="row row--wrap" style={{ gap: "var(--s-5)" }}>
              <div style={{ position: "relative", flex: "none" }}>
                {me.avatar_url ? (
                  <img
                    src={me.avatar_url}
                    alt=""
                    style={{
                      width: 76, height: 76, borderRadius: "50%",
                      objectFit: "cover", border: "1px solid var(--line)",
                    }}
                  />
                ) : (
                  <span className="avatar" style={{ width: 76, height: 76, fontSize: "var(--t-lg)" }}>
                    {initials || "?"}
                  </span>
                )}

                <input ref={fileRef} type="file" accept="image/*" onChange={onAvatar} style={{ display: "none" }} />
                <button
                  className="btn btn--sm"
                  onClick={() => fileRef.current.click()}
                  disabled={busy}
                  style={{ position: "absolute", bottom: -6, left: "50%", transform: "translateX(-50%)" }}
                >
                  {me.avatar_url ? "Change" : "Add"}
                </button>
              </div>

              <div style={{ flex: 1, minWidth: 220 }}>
                {/* A short identifier someone can read aloud at a ward counter.
                    A UUID is not that. */}
                <Label>Your resident ID</Label>
                <div className="row" style={{ gap: "var(--s-2)", marginTop: 4 }}>
                  <span className="mono" style={{ fontSize: "var(--t-md)", fontWeight: 600 }}>
                    {me.citizen_ref}
                  </span>
                  <Badge tone="pending">quote this at a ward office</Badge>
                </div>

                <div className="label" style={{ marginTop: "var(--s-3)" }}>{me.email}</div>
                <div className="label">{me.points} points</div>
              </div>
            </div>
          </Panel>

          <Panel title="Details">
            <div className="stack">
              <Field label="Full name" value={form.full_name} onChange={set("full_name")} required />
              <Field label="Phone (optional)" value={form.phone} onChange={set("phone")} placeholder="+91 …" />

              <div>
                <Label>Language</Label>
                <div className="row" style={{ gap: "var(--s-2)", marginTop: "var(--s-2)" }}>
                  {LANGUAGES.map((l) => (
                    <button
                      key={l.code}
                      className={lang === l.code ? "btn btn--sm" : "btn btn--secondary btn--sm"}
                      onClick={() => setLang(l.code)}
                    >
                      {l.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </Panel>

          <Panel
            title="Where you live"
            action={<Label>optional</Label>}
          >
            <p className="prose" style={{ fontSize: "var(--t-sm)", marginBottom: "var(--s-4)" }}>
              Only used to show issues near you and to reach you about a report. Never shown to other
              residents, and you can leave it all blank.
            </p>

            <div className="stack">
              <Field label="Area or locality" value={form.area} onChange={set("area")} placeholder="Ghatkopar West" />

              <div className="row" style={{ gap: "var(--s-3)", alignItems: "flex-end", flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 150 }}>
                  <Field label="City" value={form.city} onChange={set("city")} placeholder="Mumbai" />
                </div>
                <div style={{ flex: 1, minWidth: 150 }}>
                  <Label>State</Label>
                  <select
                    className="input"
                    value={form.state}
                    onChange={(e) => set("state")(e.target.value)}
                    style={{ marginTop: 6 }}
                  >
                    <option value="">Not set</option>
                    {STATES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div style={{ width: 120 }}>
                  <Field label="PIN" value={form.pincode} onChange={set("pincode")} placeholder="400086" />
                </div>
              </div>
            </div>
          </Panel>

          <div className="row" style={{ gap: "var(--s-3)" }}>
            <button className="btn" onClick={save} disabled={busy}>
              {busy ? "Saving…" : "Save changes"}
            </button>
            {saved && <Badge tone="ok">Saved</Badge>}
          </div>
        </div>
      ) : (
        <div className="stack">
          <Panel title="Password">
            <p className="prose" style={{ fontSize: "var(--t-sm)" }}>
              Changing this does not sign you out anywhere. Use the option below if you think someone
              else has access.
            </p>
            <button className="btn btn--secondary" style={{ marginTop: "var(--s-4)" }} onClick={() => setDialog("password")}>
              Change password
            </button>
          </Panel>

          <Panel title="Sessions">
            <p className="prose" style={{ fontSize: "var(--t-sm)" }}>
              Signs out every device, including this one. Worth doing if you have used a shared
              computer or lost a phone.
            </p>
            <button className="btn btn--secondary" style={{ marginTop: "var(--s-4)" }} onClick={() => setDialog("sessions")}>
              Sign out everywhere
            </button>
          </Panel>

          <Panel title="Delete account" style={{ borderColor: "var(--danger-line)" }}>
            {/* Said plainly, because a checkbox implying everything vanishes
                would be untrue — other people's reports are grouped with yours. */}
            <p className="prose" style={{ fontSize: "var(--t-sm)" }}>
              Your profile, points and badges are erased. Your reports are <strong>not</strong> —
              they are public civic records and other residents' complaints are grouped with them.
              They stay, detached from you, with your name and description removed.
            </p>
            <button className="btn btn--danger" style={{ marginTop: "var(--s-4)" }} onClick={() => setDialog("delete")}>
              Delete my account
            </button>
          </Panel>

          <button className="btn btn--secondary" onClick={signOut}>Sign out</button>
        </div>
      )}

      {dialog === "password" && <PasswordDialog onClose={() => setDialog(null)} />}
      {dialog === "sessions" && (
        <ConfirmDialog
          title="Sign out everywhere"
          body="Every device signs out, including this one. You will need to log in again."
          confirmLabel="Sign out everywhere"
          onClose={() => setDialog(null)}
          onConfirm={async () => { await api.signOutEverywhere(); await signOut(); }}
        />
      )}
      {dialog === "delete" && (
        <DeleteDialog onClose={() => setDialog(null)} onDone={() => navigate("/", { replace: true })} />
      )}
    </div>
  );
}

function Field({ label, value, onChange, ...rest }) {
  return (
    <label className="field">
      <span className="label">{label}</span>
      <input className="input" value={value} onChange={(e) => onChange(e.target.value)} {...rest} />
    </label>
  );
}

function PasswordDialog({ onClose }) {
  const [pw, setPw] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);

  async function submit() {
    if (pw.length < 8) return setError("Use at least eight characters.");
    if (pw !== again) return setError("The two passwords do not match.");

    setBusy(true);
    setError(null);
    try {
      await api.changePassword(pw);
      setDone(true);
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Change password"
      onClose={onClose}
      footer={
        done ? (
          <button className="btn" onClick={onClose}>Done</button>
        ) : (
          <>
            <button className="btn" onClick={submit} disabled={busy}>
              {busy ? "Changing…" : "Change password"}
            </button>
            <button className="btn btn--secondary" onClick={onClose}>Cancel</button>
          </>
        )
      }
    >
      {done ? (
        <p className="prose">Your password has been changed. Other devices stay signed in.</p>
      ) : (
        <div className="stack">
          <Field label="New password" type="password" value={pw} onChange={setPw} autoFocus />
          <Field label="Type it again" type="password" value={again} onChange={setAgain} />
          {error && <ErrorNote>{error}</ErrorNote>}
        </div>
      )}
    </Modal>
  );
}

function ConfirmDialog({ title, body, confirmLabel, onClose, onConfirm }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <button
            className="btn btn--danger"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try { await onConfirm(); } catch (e) { setError(e.message); setBusy(false); }
            }}
          >
            {busy ? "Working…" : confirmLabel}
          </button>
          <button className="btn btn--secondary" onClick={onClose}>Cancel</button>
        </>
      }
    >
      <p className="prose">{body}</p>
      {error && <div style={{ marginTop: "var(--s-4)" }}><ErrorNote>{error}</ErrorNote></div>}
    </Modal>
  );
}

function DeleteDialog({ onClose, onDone }) {
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  return (
    <Modal
      title="Delete your account"
      onClose={onClose}
      footer={
        <>
          <button
            className="btn btn--danger"
            disabled={busy || typed !== "DELETE"}
            onClick={async () => {
              setBusy(true);
              try { await api.deleteAccount(); onDone(); }
              catch (e) { setError(e.message); setBusy(false); }
            }}
          >
            {busy ? "Deleting…" : "Delete permanently"}
          </button>
          <button className="btn btn--secondary" onClick={onClose}>Keep my account</button>
        </>
      }
    >
      <p className="prose">
        Your profile, points and badges are erased and cannot be recovered.
      </p>
      <p className="prose" style={{ marginTop: "var(--s-3)" }}>
        Your reports stay. They are public civic records, other residents' complaints are grouped
        with them, and officers may still be working on them. Your name and anything you wrote is
        removed from them.
      </p>

      <label className="field" style={{ marginTop: "var(--s-5)" }}>
        <span className="label">Type DELETE to confirm</span>
        <input
          className="input mono"
          value={typed}
          onChange={(e) => setTyped(e.target.value.toUpperCase())}
          autoFocus
        />
      </label>

      {error && <div style={{ marginTop: "var(--s-4)" }}><ErrorNote>{error}</ErrorNote></div>}
    </Modal>
  );
}
