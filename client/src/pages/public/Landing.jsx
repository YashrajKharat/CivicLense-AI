import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../lib/api.js";
import { Logo } from "../../components/Primitives.jsx";
import { Icon } from "../../components/Icons.jsx";

const STEPS = [
  {
    icon: Icon.camera,
    title: "Photograph it",
    body: "A pothole, an overflowing bin, a dead streetlight. One photo and your location — that is the whole input.",
  },
  {
    icon: Icon.scan,
    title: "It gets read",
    body: "The photo is classified, scored for severity with the reasoning shown, and checked for authenticity before anyone acts on it.",
  },
  {
    icon: Icon.route,
    title: "It finds its owner",
    body: "Your coordinates resolve to a ward, an asset, a department — and to the contractor or licence holder already answerable for it.",
  },
  {
    icon: Icon.check,
    title: "You close it",
    body: "The officer uploads an after-photo. You decide whether it counts, and rate the work. Saying no reopens it.",
  },
];

const CATEGORIES = [
  { icon: Icon.barrier, label: "Potholes", dept: "Roads" },
  { icon: Icon.trash, label: "Garbage", dept: "Solid Waste" },
  { icon: Icon.drop, label: "Water leaks", dept: "Water Supply" },
  { icon: Icon.bulb, label: "Streetlights", dept: "Lighting" },
  { icon: Icon.cone, label: "Traffic signals", dept: "Traffic" },
  { icon: Icon.crack, label: "Broken footpaths", dept: "Roads" },
  { icon: Icon.file, label: "Unhygienic food", dept: "Food Safety" },
  { icon: Icon.map, label: "Blocked drains", dept: "Storm Water" },
];

export default function Landing() {
  return (
    <div>
      {/* ---------- hero ---------- */}
      <header className="hero">
        <div className="container row row--between" style={{ padding: "var(--s-5) var(--s-7)" }}>
          <Logo dark />
          <nav className="row" style={{ gap: "var(--s-2)" }}>
            {/* Reachable without an account. A transparency tool that makes
                you register before you can see anything is asking to be taken
                on trust, which is the thing it exists not to require. */}
            <Link to="/reports" className="btn--quiet" style={{ color: "var(--on-dark-2)" }}>
              All reports
            </Link>
            <Link to="/leaderboard" className="btn--quiet" style={{ color: "var(--on-dark-2)" }}>
              Leaderboard
            </Link>
            <Link to="/gov" className="btn--quiet" style={{ color: "var(--on-dark-2)" }}>
              Staff portal
            </Link>
            <Link to="/signin" className="btn btn--ghost-dark btn--sm">Log in</Link>
            <Link to="/register" className="btn btn--sm">Report an issue</Link>
          </nav>
        </div>

        <div className="container hero__inner" style={{ padding: "var(--s-9) var(--s-7) var(--s-10)" }}>
          <div className="hero__grid">
            <div className="on-dark">
              <div className="eyebrow">Mumbai · civic reporting</div>

              <h1 className="display d-xl" style={{ marginTop: "var(--s-5)", color: "#fff" }}>
                Report it once.<br />Watch who answers.
              </h1>

              <p className="lede" style={{ marginTop: "var(--s-5)" }}>
                Most complaint apps stop at "sent to the municipality". This one names the ward, the
                department, and the contractor or licence holder already being paid to deal with it —
                then holds the file open until you say it is fixed.
              </p>

              <div className="row row--wrap" style={{ marginTop: "var(--s-7)", gap: "var(--s-3)" }}>
                <Link to="/register" className="btn btn--lg"><Icon.camera /> Report an issue</Link>
                <Link to="/signin" className="btn btn--ghost-dark btn--lg">
                  Track my reports <Icon.arrow />
                </Link>
              </div>

              <p className="label" style={{ marginTop: "var(--s-5)" }}>
                Free · works on any phone · English, हिन्दी, मराठी
              </p>
            </div>

            <HeroCard />
          </div>
        </div>
      </header>

      {/* ---------- the promise, stated plainly ---------- */}
      <section className="container" style={{ padding: "var(--s-9) var(--s-7)" }}>
        <div className="grid-3">
          {[
            {
              icon: Icon.shield,
              title: "An officer cannot close your report",
              body: "Uploading an after-photo moves it to verification. Only your confirmation resolves it, and saying no reopens it and escalates it up the chain.",
            },
            {
              icon: Icon.building,
              title: "You see who is answerable",
              body: "A road under maintenance names the contractor and the contract number. A food complaint names the premises and the licence holder.",
            },
            {
              icon: Icon.file,
              title: "Nothing is quietly rewritten",
              body: "Every status change is logged with who made it. No role, including the city's own administrators, can edit or delete that record.",
            },
          ].map((p) => (
            <article key={p.title}>
              <span className="tile tile--accent tile--lg"><p.icon /></span>
              <h3 className="h h-lg" style={{ marginTop: "var(--s-4)" }}>{p.title}</h3>
              <p className="prose" style={{ marginTop: "var(--s-2)", fontSize: "var(--t-sm)" }}>
                {p.body}
              </p>
            </article>
          ))}
        </div>
      </section>

      {/* ---------- how it works ---------- */}
      <section style={{ background: "var(--surface)", borderTop: "1px solid var(--line)", borderBottom: "1px solid var(--line)" }}>
        <div className="container" style={{ padding: "var(--s-9) var(--s-7)" }}>
          <div className="eyebrow">How it works</div>
          <h2 className="display d-lg" style={{ marginTop: "var(--s-4)" }}>
            Four steps, and you are<br />in every one of them.
          </h2>

          <div className="grid-4" style={{ marginTop: "var(--s-7)" }}>
            {STEPS.map((s, i) => (
              <article key={s.title} className="stepcard">
                <span className="tile tile--dark"><s.icon /></span>
                <span className="stepcard__n">{String(i + 1).padStart(2, "0")}</span>
                <h3 className="h h-lg" style={{ marginTop: "var(--s-5)" }}>{s.title}</h3>
                <p className="prose" style={{ marginTop: "var(--s-2)", fontSize: "var(--t-sm)" }}>{s.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- the spine, explained ---------- */}
      <section className="container" style={{ padding: "var(--s-9) var(--s-7)" }}>
        <div className="grid-2" style={{ alignItems: "center", gap: "var(--s-9)" }}>
          <div>
            <div className="eyebrow">The difference</div>
            <h2 className="display d-lg" style={{ marginTop: "var(--s-4)" }}>
              Somebody is already<br />paid to fix your street.
            </h2>
            <p className="lede" style={{ marginTop: "var(--s-4)" }}>
              Your coordinates resolve through a real chain. When a road falls inside a live
              maintenance contract, your report lands on that agency's record — not in a general
              inbox. When it is a food complaint, it names the premises and the person whose licence
              is on the wall.
            </p>
            <Link to="/register" className="btn btn--lg" style={{ marginTop: "var(--s-6)" }}>
              Create your account
            </Link>
          </div>

          <SpineIllustration />
        </div>
      </section>

      {/* ---------- categories ---------- */}
      <section className="dark-section">
        <div className="container" style={{ padding: "var(--s-9) var(--s-7)" }}>
          <div className="row row--between row--wrap" style={{ alignItems: "flex-end", gap: "var(--s-4)" }}>
            <div className="on-dark">
              <div className="eyebrow">What you can report</div>
              <h2 className="display d-lg" style={{ marginTop: "var(--s-4)", color: "#fff" }}>
                Every category routes<br />to a named department.
              </h2>
            </div>
            <Link to="/register" className="link row" style={{ gap: "var(--s-2)" }}>
              Start reporting <Icon.arrow />
            </Link>
          </div>

          <div className="grid-4" style={{ marginTop: "var(--s-7)" }}>
            {CATEGORIES.map((c) => (
              <div key={c.label} className="catcard">
                <span style={{ color: "var(--accent)", display: "inline-flex" }}>
                  <c.icon width={22} height={22} />
                </span>
                <div style={{ fontWeight: 600, marginTop: "var(--s-3)", fontSize: "var(--t-sm)" }}>
                  {c.label}
                </div>
                <div className="label" style={{ marginTop: 2 }}>{c.dept}</div>
              </div>
            ))}
          </div>

          <p className="label" style={{ marginTop: "var(--s-5)" }}>
            Departments add categories as new kinds of problem start arriving.
          </p>
        </div>
      </section>

      {/* ---------- close ---------- */}
      <section className="container" style={{ padding: "var(--s-9) var(--s-7)", textAlign: "center" }}>
        <h2 className="display d-lg">Your first report takes under a minute.</h2>
        <p className="lede" style={{ margin: "var(--s-4) auto 0" }}>
          One photo. We handle the classification, the routing and the paper trail — and we keep
          asking until you say it is done.
        </p>
        <Link to="/register" className="btn btn--lg" style={{ marginTop: "var(--s-6)" }}>
          <Icon.camera /> Create your account
        </Link>
      </section>

      <footer style={{ borderTop: "1px solid var(--line)" }}>
        <div
          className="container row row--between row--wrap"
          style={{ padding: "var(--s-6) var(--s-7)", gap: "var(--s-4)" }}
        >
          <span className="label">© 2026 CivicLense · built for residents</span>
          <div className="row" style={{ gap: "var(--s-5)" }}>
            <Link to="/gov" className="label link">Government staff portal</Link>
            <Logo size={24} />
          </div>
        </div>
      </footer>
    </div>
  );
}

/**
 * Real city-wide figures.
 *
 * This was static, with a "live" badge over invented numbers. Either the badge
 * had to go or the figures had to become real, and real is better: somebody
 * deciding whether it is worth reporting a pothole is exactly the person who
 * should see how many reports actually get closed.
 *
 * Only aggregates, and it degrades to the shape of the card if the request
 * fails — a landing page that errors because a count did not load would be a
 * poor trade for a number.
 */
function HeroCard() {
  const [stats, setStats] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    api.publicStats().then(setStats).catch(() => setFailed(true));
  }, []);
  const top = stats?.top_categories || [];
  const biggest = top[0]?.n || 1;
  const TONES = ["var(--danger)", "var(--warn)", "var(--info)"];

  return (
    <div style={{ position: "relative" }}>
      <div className="card" style={{ padding: "var(--s-5)", borderRadius: "var(--r-xl)", boxShadow: "var(--sh-4)" }}>
        <div className="row row--between">
          <span className="label">Across the city</span>
          {stats ? (
            <span className="badge badge--ok"><i className="dot" /> live</span>
          ) : (
            <span className="label">{failed ? "" : "loading"}</span>
          )}
        </div>

        <div className="row" style={{ gap: "var(--s-3)", marginTop: "var(--s-4)" }}>
          {[
            [stats ? String(stats.total) : "—", "filed"],
            [stats ? String(stats.resolved) : "—", "resolved"],
            [stats ? `${stats.resolution_rate}%` : "—", "closed"],
          ].map(([n, l]) => (
            <div key={l} style={{ flex: 1, background: "var(--surface-2)", borderRadius: "var(--r)", padding: "var(--s-4)" }}>
              <div className="num" style={{ fontSize: "var(--t-xl)" }}>{n}</div>
              <div className="label" style={{ marginTop: 4 }}>{l}</div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: "var(--s-4)", background: "var(--surface-2)", borderRadius: "var(--r)", padding: "var(--s-4)" }}>
          <div className="label">By category</div>
          <div style={{ marginTop: "var(--s-3)", display: "grid", gap: "var(--s-3)" }}>
            {top.length === 0 && (
              <div className="skeleton" style={{ height: 54 }} />
            )}
            {top.map((r, i) => (
              <div key={r.label} className="row" style={{ gap: "var(--s-3)" }}>
                <span className="truncate" style={{ flex: 1, fontSize: "var(--t-sm)" }}>{r.label}</span>
                <span style={{ width: 84 }}>
                  <span className="meter">
                    <i style={{ width: `${Math.round((r.n / biggest) * 100)}%`, background: TONES[i] }} />
                  </span>
                </span>
                <span className="mono" style={{ fontSize: "var(--t-sm)" }}>{r.n}</span>
              </div>
            ))}
          </div>
        </div>

        <div
          style={{
            marginTop: "var(--s-4)", padding: "var(--s-4)",
            background: "var(--accent-50)", border: "1px solid var(--accent-100)",
            borderRadius: "var(--r)",
          }}
        >
          <div className="label" style={{ color: "var(--accent-700)" }}>Waiting on a resident</div>
          <div style={{ fontSize: "var(--t-sm)", fontWeight: 600, marginTop: 4 }}>
            {stats
              ? `${stats.awaiting_resident} ${stats.awaiting_resident === 1 ? "report is" : "reports are"} waiting for someone to confirm the fix`
              : "Officers cannot close their own work"}
          </div>
        </div>
      </div>

      <div
        style={{
          position: "absolute", left: "calc(var(--s-5) * -1)", bottom: "calc(var(--s-6) * -1)",
          background: "var(--accent)", color: "#fff",
          borderRadius: "var(--r)", padding: "var(--s-3) var(--s-5)", boxShadow: "var(--sh-accent)",
        }}
      >
        <div className="num" style={{ fontSize: "var(--t-lg)" }}>2.4 days</div>
        <div style={{ fontSize: "var(--t-xs)", opacity: 0.9 }}>average to resolve</div>
      </div>
    </div>
  );
}

function SpineIllustration() {
  const chain = [
    ["City", "Mumbai"],
    ["Ward", "M-East"],
    ["Asset", "LBS Marg service road"],
    ["Department", "Roads & Infrastructure", true],
    ["Maintenance agency", "ABC Infrastructure Pvt Ltd"],
    ["Contract", "RM-2026-014 · active to Dec 2027", true],
  ];

  return (
    <div className="card card--pad" style={{ borderRadius: "var(--r-xl)", boxShadow: "var(--sh-2)" }}>
      <div className="label">Responsibility for one pothole</div>

      <ol className="spine" style={{ marginTop: "var(--s-4)" }}>
        {chain.map(([k, v, key]) => (
          <li key={k} className="spine__node" data-key={Boolean(key)}>
            <div className="label">{k}</div>
            <div className="spine__value">{v}</div>
          </li>
        ))}
      </ol>

      <p className="prose" style={{ fontSize: "var(--t-xs)", marginTop: "var(--s-4)", paddingTop: "var(--s-4)", borderTop: "1px solid var(--line)" }}>
        For a food complaint the same chain ends at the premises and the licence holder instead.
      </p>
    </div>
  );
}
