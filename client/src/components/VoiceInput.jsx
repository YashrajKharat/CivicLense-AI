import { useEffect } from "react";
import { useVoice } from "../lib/useVoice.js";
import { Icon } from "./Icons.jsx";

/**
 * Tap to start, tap to stop — not press-and-hold. Holding a button while
 * speaking is awkward on a phone and impossible to do accessibly, and the
 * earlier hold version dropped short phrases entirely.
 *
 * What is being heard is shown live, because a microphone button with no
 * feedback is indistinguishable from a broken one.
 */
export default function VoiceInput({ lang = "en", onText, hint }) {
  const { supported, listening, transcript, interim, error, start, stop, reset } = useVoice(lang);

  useEffect(() => {
    if (!listening && transcript) {
      onText(transcript);
      reset();
    }
  }, [listening, transcript]);

  if (!supported) {
    return (
      <p className="label" style={{ marginTop: "var(--s-2)" }}>
        {hint || "Typed here in your language, translated for the officer."}
      </p>
    );
  }

  return (
    <div style={{ marginTop: "var(--s-3)" }}>
      <div className="row row--wrap" style={{ gap: "var(--s-3)" }}>
        <button
          type="button"
          className={listening ? "btn btn--sm" : "btn btn--secondary btn--sm"}
          onClick={listening ? stop : start}
          aria-pressed={listening}
        >
          {listening ? (
            <>
              <span
                className="dot"
                style={{ background: "currentColor", animation: "pulse 1.1s ease-in-out infinite" }}
              />
              Stop and use it
            </>
          ) : (
            <>
              <Icon.bell width={14} height={14} /> Speak instead
            </>
          )}
        </button>

        {listening && (
          <span className="label">
            {interim || transcript ? "heard so far…" : "listening — start speaking"}
          </span>
        )}
      </div>

      {listening && (interim || transcript) && (
        <div
          style={{
            marginTop: "var(--s-3)",
            padding: "var(--s-3) var(--s-4)",
            background: "var(--accent-50)",
            border: "1px solid var(--accent-100)",
            borderRadius: "var(--r)",
            fontSize: "var(--t-sm)",
            lineHeight: 1.55,
          }}
        >
          {transcript}
          {interim && <span className="muted"> {interim}</span>}
        </div>
      )}

      <p className="label" style={{ marginTop: "var(--s-2)" }}>
        {hint || "Converted on your device. Stored in your language, translated for the officer."}
      </p>

      {error && (
        <p style={{ color: "var(--danger)", fontSize: "var(--t-sm)", marginTop: "var(--s-2)" }}>
          {error}
        </p>
      )}
    </div>
  );
}
