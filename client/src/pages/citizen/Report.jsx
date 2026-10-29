import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../lib/api.js";
import { Label, KV, Meter, ErrorNote, Badge, SeverityBadge, Tile, Steps, Ref, Section } from "../../components/Primitives.jsx";
import ResponsibilitySpine, { buildChain } from "../../components/ResponsibilitySpine.jsx";
import { Icon, CATEGORY_ICON } from "../../components/Icons.jsx";
import { PhotoPicker } from "../../components/CameraCapture.jsx";
import IssueMap from "../../components/IssueMap.jsx";
import FollowupQuestions from "../../components/FollowupQuestions.jsx";
import AddressSearch from "../../components/AddressSearch.jsx";
import DuplicateNotice from "../../components/DuplicateNotice.jsx";
import CategoryCorrection from "../../components/CategoryCorrection.jsx";
import VoiceInput from "../../components/VoiceInput.jsx";
import { useT, LANGUAGES } from "../../lib/i18n.jsx";

const STEPS = ["Photo", "Analysis", "Location", "Responsibility", "Review"];

export default function Report() {
  const { t, lang: uiLang } = useT();
  const [step, setStep] = useState(0);
  const [preview, setPreview] = useState(null);
  const [coords, setCoords] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [responsibility, setResponsibility] = useState(null);
  const [note, setNote] = useState("");
  const [landmark, setLandmark] = useState("");
  const [address, setAddress] = useState(null);
  const [answers, setAnswers] = useState({});
  const [categoryOverride, setCategoryOverride] = useState(null);
  const [anonymous, setAnonymous] = useState(false);
  const [lang, setLang] = useState(uiLang);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  async function onPick(file) {
    if (!file) return;

    setPreview(URL.createObjectURL(file));
    setError(null);
    setStep(1);
    setBusy(true);

    const position = await new Promise((resolve) =>
      navigator.geolocation
        ? navigator.geolocation.getCurrentPosition(
            (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
            () => resolve(null),
            { timeout: 8000 }
          )
        : resolve(null)
    );
    setCoords(position);

    try {
      setAnalysis(await api.analyseImage(file, position));
    } catch (err) {
      setError(err.message || "The analysis did not complete. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  // The coordinate is what gets stored; the address is a courtesy so the
  // resident can confirm the pin is where they think it is. A lookup failure
  // must never block the report.
  useEffect(() => {
    if (step !== 2 || !coords) return;
    let live = true;

    setAddress(null);
    const timer = setTimeout(() => {
      api.address(coords.lat, coords.lng)
        .then((a) => live && setAddress(a))
        .catch(() => live && setAddress({ unavailable: true }));
    }, 600); // debounced, so dragging the pin does not hammer the geocoder

    return () => { live = false; clearTimeout(timer); };
  }, [step, coords?.lat, coords?.lng]);

  /**
   * Back to the camera, discarding the analysis.
   *
   * Everything downstream — category, severity, responsibility, the follow-up
   * answers — was derived from that photograph. Keeping any of it would attach
   * the old answer to a new image, which is worse than starting over.
   */
  function retake() {
    // Step 0 is the camera; step 1 is this screen. Sending it to 1 re-rendered
    // the analysis view with no image, which is why Retake produced a broken
    // thumbnail and an empty page instead of the picker.
    setStep(0);

    // Revoked after the step changes, so nothing is still pointing at the blob
    // when it goes. Revoking first left the img holding a dead URL for a frame,
    // which is the broken-image icon in the screenshot.
    const stale = preview;
    setPreview(null);
    setAnalysis(null);
    setCoords(null);

    if (stale) {
      // Deferred: React has not re-rendered yet at this point, and the browser
      // keeps the blob alive until told, so retaking repeatedly would otherwise
      // hold every previous photo in memory.
      setTimeout(() => URL.revokeObjectURL(stale), 0);
    }
  }

  async function goToResponsibility() {
    setBusy(true);
    setError(null);
    try {
      const lat = coords?.lat ?? 19.0728;
      const lng = coords?.lng ?? 72.8826;
      setResponsibility(
        await api.resolveResponsibility(
          lat,
          lng,
          categoryOverride ?? analysis?.category_id
        )
      );
      setStep(3);
    } catch (err) {
      setError(err.message || "We could not resolve who owns this location.");
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    setBusy(true);
    try {
      const created = await api.createComplaint({
        analysisId: analysis.analysis_id,
        categoryOverrideId: categoryOverride,
        anonymous,
        description: [landmark, note].filter(Boolean).join(" — "),
        language: lang,
        lat: coords?.lat ?? 19.0728,
        lng: coords?.lng ?? 72.8826,
      });

      // The answers adjust severity, so they are filed against the complaint
      // rather than folded into free text nobody scores.
      // { question_id, language, selected_option } per the answer shape the
      // questions emit, so the language a resident answered in is kept with it.
      const list = Object.values(answers).map((a) => ({
        question_id: a.question_id,
        value: a.selected_option,
        language: a.language,
      }));
      if (list.length) {
        await api.answerFollowups(created.ref, list).catch(() => {});
      }

      navigate("/app/reports");
    } catch (err) {
      setError(err.message || "The report could not be filed.");
      setBusy(false);
    }
  }

  const Ico = CATEGORY_ICON[analysis?.category] || Icon.file;

  return (
    <div className="fade-in" style={{ maxWidth: 780 }}>
      <h1 className="display d-md">Report an issue</h1>

      <div style={{ marginTop: "var(--s-5)" }}>
        <Steps steps={STEPS} current={step} />
      </div>

      {error && <div style={{ marginTop: "var(--sp-4)" }}><ErrorNote onRetry={() => { setError(null); setStep(0); }}>{error}</ErrorNote></div>}

      {step === 0 && (
        <section className="card card--pad" style={{ marginTop: "var(--sp-5)", textAlign: "center", padding: "var(--sp-7)" }}>
          <span className="tile tile--accent tile--lg" style={{ margin: "0 auto" }}><Icon.camera /></span>
          <h2 className="h h-lg" style={{ marginTop: 16 }}>{t("report.what")}</h2>
          <p className="prose" style={{ margin: "10px auto 0" }}>{t("report.hint")}</p>
          <div style={{ marginTop: 24 }}>
            <PhotoPicker onFile={onPick} />
          </div>
          <p className="label" style={{ marginTop: 16 }}>Your GPS pin is attached automatically</p>
        </section>
      )}

      {step === 1 && (
        <div style={{ marginTop: "var(--sp-5)" }}>
          {/* Guarded: if preview is ever null on this step the browser shows a
              broken-image icon, which is what Retake used to produce. */}
          {preview && (
          <div style={{ position: "relative" }}>
            <img
            src={preview}
            alt="Your report"
            style={{ width: "100%", maxHeight: 380, objectFit: "cover", borderRadius: "var(--r-lg)", border: "1px solid var(--line)" }}
          />

            {/* Retaking was only ever suggested in the copy — there was no way to
                do it, so a blurry or badly-framed photo meant abandoning the whole
                report. The control sits on the photo because that is what you are
                looking at when you decide it is wrong. */}
            {!busy && (
              <button
                className="btn btn--secondary btn--sm"
                style={{ position: "absolute", right: 12, top: 12 }}
                onClick={retake}
              >
                Retake
              </button>
            )}
          </div>
          )}

          {busy && (
            <section className="sheet" style={{ marginTop: "var(--s-5)" }}>
              <div className="row"><span className="spin" style={{ display: "inline-flex", color: "var(--accent)" }}><Icon.scan /></span>
                <strong>{t("report.analysing")}</strong>
              </div>
              <div style={{ marginTop: 14 }}><Meter value={55} /></div>
              <p className="prose" style={{ fontSize: 14, marginTop: 10 }}>{t("report.analysingNote")}</p>
            </section>
          )}

          {analysis && (
            <div className="fade-in stack-4" style={{ marginTop: "var(--sp-4)" }}>
              {!analysis.is_civic_issue && (
                <div
                  className="card card--pad"
                  style={{ background: "var(--warn-bg)", borderColor: "var(--warn-line)" }}
                >
                  <strong>This does not look like a civic problem</strong>
                  <p className="prose" style={{ fontSize: "var(--t-sm)", marginTop: "var(--s-2)" }}>
                    {analysis.not_civic_reason || analysis.description}
                  </p>
                  <p className="prose" style={{ fontSize: "var(--t-sm)", marginTop: "var(--s-3)" }}>
                    If it genuinely is one, carry on — it goes to a ward officer to read rather than
                    into a work queue. Otherwise retake the photo showing the problem itself.
                  </p>
                </div>
              )}

              <section className="sheet">
                <div className="row row--between row--wrap" style={{ gap: 12 }}>
                  <div className="row">
                    <Tile icon={Ico} tone="accent" size="lg" />
                    <div>
                      <h2 className="display d-sm">{analysis.category}</h2>
                      <div className="label" style={{ marginTop: 3 }}>{analysis.department}</div>
                    </div>
                  </div>
                  <SeverityBadge severity={analysis.severity} />
                </div>

                {/* An officer reads this before travelling to the site, so the
                    full observation is worth the space. */}
                <p className="prose" style={{ marginTop: "var(--s-4)" }}>
                  {analysis.description || analysis.summary}
                </p>

                {analysis.observations?.length > 0 && (
                  <ul
                    className="prose"
                    style={{ fontSize: "var(--t-sm)", marginTop: "var(--s-3)", paddingLeft: 18 }}
                  >
                    {analysis.observations.map((o, i) => <li key={i}>{o}</li>)}
                  </ul>
                )}

                {analysis.recommended_action && (
                  <div
                    style={{
                      marginTop: "var(--s-4)", padding: "var(--s-3) var(--s-4)",
                      background: "var(--surface-2)", borderRadius: "var(--r)",
                    }}
                  >
                    <Label>Suggested for the officer</Label>
                    <p style={{ margin: "4px 0 0", fontSize: "var(--t-sm)" }}>
                      {analysis.recommended_action}
                    </p>
                  </div>
                )}

                <div style={{ marginTop: 18 }}>
                  <KV k="Classification confidence" v={`${analysis.confidence}%`} />
                  <KV k="Severity score" v={`${analysis.severity_score} / 100`} />
                </div>

                {/* Severity is scored after the location is confirmed, from the
                    ward, what is nearby, and the answers below — none of which
                    exist yet at this step. The heading used to render over an
                    empty list, which looked like something had failed. */}
                {analysis.severity_factors?.length > 0 ? (
                  <div style={{ marginTop: "var(--s-5)" }}>
                    <Label>{t("report.severityWorking")}</Label>
                    <div style={{ marginTop: "var(--s-3)", display: "grid", gap: 9 }}>
                      {analysis.severity_factors.map((f) => (
                        <div key={f.factor} className="row row--between" style={{ fontSize: "var(--t-sm)" }}>
                          <span className="muted">{f.factor}</span>
                          <span className="mono">+{f.points}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="label" style={{ marginTop: "var(--s-4)" }}>
                    Priority is worked out once you confirm the location — from the ward,
                    what is nearby, and the questions on the next step.
                  </p>
                )}

                {/* Correcting the category was imported but never rendered, so
                    a resident told "choose the category yourself below" had
                    nothing below to choose from. It sits inside the analysis
                    card because that is the answer being corrected. */}
                <CategoryCorrection
                  analysis={analysis}
                  categories={analysis.categories}
                  value={categoryOverride}
                  onChange={setCategoryOverride}
                  lang={lang}
                />
              </section>

              {/* Only shown when something was actually checked.
                  "Unable to determine — 50% confidence" over a half-filled bar
                  is a number pretending to be information: no check ran, so
                  there is nothing for the bar to measure. Drawing it anyway
                  invites a resident to read meaning into a placeholder. */}
              {analysis.authenticity && analysis.authenticity !== "undetermined" && (
                <section className="sheet">
                  <div className="row row--between">
                    <Label>{t("report.authenticity")}</Label>
                    <Badge tone={analysis.authenticity === "likely_genuine" ? "ok" : "warn"}>
                      {analysis.authenticity_label}
                    </Badge>
                  </div>
                  <div style={{ marginTop: "var(--s-4)" }}>
                    <Meter
                      value={analysis.authenticity_confidence}
                      tone={analysis.authenticity === "likely_genuine" ? "ok" : "warn"}
                    />
                  </div>
                  <div className="label" style={{ marginTop: 8 }}>
                    {analysis.authenticity_confidence}% confidence
                  </div>
                  <p className="prose" style={{ fontSize: "var(--t-sm)", marginTop: "var(--s-3)" }}>
                    {t("report.authNote")}
                  </p>
                </section>
              )}

              {analysis.is_civic_issue === false ? (
                <div style={{ textAlign: "center", marginTop: 16 }}>
                  <button
                    className="btn btn--block"
                    style={{ background: "#DC2626", borderColor: "#DC2626", color: "#FFFFFF", fontWeight: "bold" }}
                    onClick={() => { setFile(null); setPreview(null); setAnalysis(null); }}
                  >
                    Upload a Real Civic Issue Photo
                  </button>
                  <p className="label" style={{ marginTop: 8, color: "#DC2626", fontWeight: "600" }}>
                    Submission Blocked: Only public infrastructure, road damage, and sanitation issues can be registered.
                  </p>
                </div>
              ) : (
                <button className="btn btn--block" onClick={() => setStep(2)} disabled={busy}>
                  Confirm the location <Icon.arrow />
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {step === 2 && (
        <section style={{ marginTop: "var(--sp-5)" }}>
          <h2 className="display d-sm">Where exactly did you see this?</h2>
          <p className="prose" style={{ marginTop: 8 }}>
            Drag the pin to the exact spot. GPS indoors can be off by a street, and a pothole
            reported on the wrong road is a wasted trip for the officer.
          </p>

          {/* Search first, pin second. Typing is the reliable way in; the map
              is for confirming and nudging. */}
          <div style={{ marginTop: "var(--s-4)" }}>
            <AddressSearch
              near={coords}
              onPick={([lat, lng]) => setCoords({ lat, lng })}
            />
          </div>

          <div style={{ marginTop: "var(--s-4)" }}>
            <IssueMap
              center={[coords?.lat ?? 19.0728, coords?.lng ?? 72.8826]}
              picked={[coords?.lat ?? 19.0728, coords?.lng ?? 72.8826]}
              pickable
              onPick={([lat, lng]) => setCoords({ lat, lng })}
              complaints={[]}
              showClusters={false}
              size="lg"
            />
          </div>

          <div className="sheet" style={{ marginTop: "var(--s-5)" }}>
            <Label>This location</Label>

            {!address ? (
              <div className="skeleton" style={{ height: 18, marginTop: 8, maxWidth: 320 }} />
            ) : address.unavailable ? (
              <div style={{ marginTop: 6, fontSize: "var(--t-sm)" }} className="muted">
                Address lookup unavailable — the coordinates below are what gets recorded.
              </div>
            ) : (
              <>
                <div style={{ fontWeight: 600, marginTop: 6 }}>{address.short}</div>
                {address.full && (
                  <div className="prose" style={{ fontSize: "var(--t-xs)", marginTop: 4 }}>
                    {address.full}
                  </div>
                )}
                <div className="row row--wrap" style={{ gap: "var(--s-3)", marginTop: "var(--s-3)" }}>
                  {address.area && <span className="label">Area: {address.area}</span>}
                  {address.city && <span className="label">City: {address.city}</span>}
                  {address.pincode && <span className="label">PIN: {address.pincode}</span>}
                </div>
              </>
            )}

            <div className="row row--between row--wrap" style={{ gap: 10, marginTop: "var(--s-4)", paddingTop: "var(--s-3)", borderTop: "1px solid var(--line)" }}>
              <Label>Pin position</Label>
              <span className="mono" style={{ fontSize: "var(--t-sm)" }}>
                {coords?.lat?.toFixed(5)}, {coords?.lng?.toFixed(5)}
              </span>
            </div>
            <label className="field" style={{ marginTop: 14 }}>
              <span className="label">Landmark (optional)</span>
              <input
                className="input"
                value={landmark}
                onChange={(e) => setLandmark(e.target.value)}
                placeholder="Opposite the bus stop, near the school gate…"
              />
            </label>
          </div>

          <DuplicateNotice
            lat={coords?.lat}
            lng={coords?.lng}
            categoryId={categoryOverride ?? analysis?.category_id}
            lang={lang}
          />

          <button className="btn btn--block" style={{ marginTop: "var(--s-4)" }} onClick={goToResponsibility} disabled={busy}>
            {busy ? "Checking…" : "Find who is responsible"} <Icon.arrow />
          </button>
        </section>
      )}

      {step === 3 && responsibility && (
        <section style={{ marginTop: "var(--sp-5)" }}>
          <h2 className="display d-sm">{t("report.ownership")}</h2>
          <p className="prose" style={{ marginTop: 8 }}>
            Your coordinates resolve to a ward and an asset. Where a live contract covers that asset,
            your report is attached to it and counts against that agency's record.
          </p>

          <div className="sheet" style={{ marginTop: "var(--s-5)" }}>
            <ResponsibilitySpine chain={buildChain(responsibility)} />
          </div>

          <button className="btn btn--block" style={{ marginTop: "var(--sp-4)" }} onClick={() => setStep(4)}>
            {t("report.review")} <Icon.arrow />
          </button>
        </section>
      )}

      {step === 4 && (
        <section style={{ marginTop: "var(--sp-5)" }}>
          <div className="sheet">
            <div className="row" style={{ alignItems: "flex-start", gap: 16 }}>
              <img
                src={preview}
                alt=""
                style={{ width: 110, height: 110, objectFit: "cover", borderRadius: "var(--r)", border: "1px solid var(--line)" }}
              />
              <div>
                <SeverityBadge severity={analysis.severity} />
                <h2 className="h h-lg" style={{ marginTop: 8 }}>{analysis.category}</h2>
                <div className="label" style={{ marginTop: 4 }}>
                  {responsibility?.ward_code} · {responsibility?.department_name}
                </div>
              </div>
            </div>

            <div style={{ marginTop: 22 }}>
              <div className="row row--between">
                <Label>{t("report.detail")}</Label>
                <div className="row" style={{ gap: 6 }}>
                  {LANGUAGES.map((l) => (
                    <button
                      key={l.code}
                      className={lang === l.code ? "btn btn--sm" : "btn btn--ghost btn--sm"}
                      onClick={() => setLang(l.code)}
                      style={{ padding: "5px 11px", fontSize: 12 }}
                    >
                      {l.label}
                    </button>
                  ))}
                </div>
              </div>

              <textarea
                className="input"
                style={{ marginTop: 10 }}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={4}
                placeholder={
                  { en: "Anything the photo does not show?", hi: "फोटो में जो नहीं दिख रहा, वो लिखें", mr: "फोटोत न दिसणारे काही आहे का?" }[lang]
                }
              />
              <VoiceInput lang={lang} onText={(text) => setNote((n) => `${n} ${text}`.trim())} />
            </div>

            <FollowupQuestions
              categoryId={categoryOverride ?? analysis?.category_id}
              lang={lang}
              value={answers}
              onChange={setAnswers}
            />

            <div style={{ display: "none" }}>
            </div>

            <div style={{ marginTop: 22 }}>
              <KV k="Routed to" v={responsibility?.department_name} />
              <KV k="Resolution target" v={analysis.sla_label} />

              {/* Some reports are uncomfortable to put your name to — an
                  unlicensed stall belonging to a neighbour, a contractor cutting
                  corners on your own street. A resident who would file those
                  anonymously and not otherwise is a report the city never gets.

                  It withholds the name, not the link. Tracking, points and
                  follow-up all still work, and somebody filing malicious reports
                  can still be found — an untraceable report would be a free hand
                  to anyone with a grudge. */}
              <label
                className="pick"
                data-selected={anonymous}
                style={{ marginTop: "var(--s-4)" }}
              >
                <input
                  type="checkbox"
                  checked={anonymous}
                  onChange={(e) => setAnonymous(e.target.checked)}
                />
                <div>
                  <strong style={{ fontSize: "var(--t-sm)" }}>File this without my name</strong>
                  <p className="prose" style={{ fontSize: "var(--t-sm)", marginTop: 4 }}>
                    Officers and other residents see the report but not who filed it. You can
                    still track it, confirm the fix and earn points as normal.
                  </p>
                </div>
              </label>
              {analysis.cluster_ref && <KV k="Joins group" v={`${analysis.cluster_ref} · ${analysis.cluster_size} reports`} />}
            </div>
          </div>

          <button className="btn btn--block" style={{ marginTop: "var(--sp-4)" }} disabled={busy} onClick={submit}>
            {busy ? t("report.filing") : t("report.submit")}
          </button>
          <p className="label" style={{ textAlign: "center", marginTop: 12 }}>{t("report.closeNote")}</p>
        </section>
      )}
    </div>
  );
}
