import { useState, useRef, useCallback, useEffect } from "react";

const LOCALE = { en: "en-IN", hi: "hi-IN", mr: "mr-IN" };

/**
 * Speech-to-text through the browser's own recogniser. No audio leaves the
 * device and no model ships with the app.
 *
 * Two things make this fiddlier than the API suggests:
 *
 * 1. Chrome stops listening after a few seconds of silence even with
 *    `continuous = true`. Someone pausing to think mid-sentence would lose the
 *    rest of it, so a `wanted` ref tracks intent and restarts the recogniser
 *    until the user actually asks it to stop.
 *
 * 2. Transcript state lives in refs and is mirrored out. An earlier version
 *    called setTranscript inside a setInterim updater, which React does not
 *    reliably run — that is why the button appeared to do nothing.
 *
 * Support is uneven (Chrome and Edge yes, Firefox no) and a secure context is
 * required, so `supported` must always leave the text field usable.
 */
export function useVoice(lang = "en") {
  const Recognition =
    typeof window !== "undefined" &&
    (window.SpeechRecognition || window.webkitSpeechRecognition);

  const secure = typeof window === "undefined" || window.isSecureContext !== false;
  const supported = Boolean(Recognition) && secure;

  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [interim, setInterim] = useState("");
  const [error, setError] = useState(null);

  const recognitionRef = useRef(null);
  const finalRef = useRef("");
  const wanted = useRef(false);

  const cleanup = useCallback(() => {
    const r = recognitionRef.current;
    if (!r) return;
    r.onresult = null;
    r.onerror = null;
    r.onend = null;
    try { r.abort(); } catch { /* already gone */ }
    recognitionRef.current = null;
  }, []);

  useEffect(() => () => { wanted.current = false; cleanup(); }, [cleanup]);

  const build = useCallback(() => {
    const recognition = new Recognition();
    recognition.lang = LOCALE[lang] || "en-IN";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      let settled = "";
      let pending = "";

      for (let i = 0; i < event.results.length; i += 1) {
        const chunk = event.results[i][0].transcript;
        if (event.results[i].isFinal) settled += chunk;
        else pending += chunk;
      }

      finalRef.current = settled;
      setTranscript(settled.trim());
      setInterim(pending.trim());
    };

    recognition.onerror = (event) => {
      // "no-speech" and "aborted" fire during ordinary use; only surface the
      // ones a person can actually do something about.
      if (event.error === "aborted") return;

      if (event.error === "no-speech") {
        if (wanted.current) return; // the restart below will pick it up
        setError("Nothing was heard. Try again and speak a little closer.");
        return;
      }

      setError(
        {
          "not-allowed": "Microphone access was blocked. Allow it from the icon in your address bar.",
          "service-not-allowed": "Microphone access is blocked by your browser settings.",
          "audio-capture": "No microphone was found on this device.",
          network: "Speech recognition needs an internet connection.",
        }[event.error] || "Voice input stopped unexpectedly. Type the detail instead."
      );

      wanted.current = false;
      setListening(false);
    };

    recognition.onend = () => {
      // Chrome ends the session on its own after a pause. If the user has not
      // pressed stop, start a fresh one and keep going.
      if (wanted.current) {
        try {
          recognitionRef.current = build();
          recognitionRef.current.start();
          return;
        } catch {
          /* fall through to stopping */
        }
      }
      setListening(false);
    };

    return recognition;
  }, [Recognition, lang]);

  const start = useCallback(() => {
    if (listening) return;

    if (!supported) {
      setError(
        !secure
          ? "Voice needs a secure connection (https, or localhost)."
          : "This browser has no speech recognition. Chrome or Edge do."
      );
      return;
    }

    setError(null);
    finalRef.current = "";
    setTranscript("");
    setInterim("");
    wanted.current = true;

    try {
      recognitionRef.current = build();
      recognitionRef.current.start();
      setListening(true);
    } catch {
      wanted.current = false;
      setError("Voice input could not start. Close any other tab using your microphone.");
    }
  }, [build, listening, secure, supported]);

  const stop = useCallback(() => {
    wanted.current = false;
    try { recognitionRef.current?.stop(); } catch { /* already stopped */ }
    setListening(false);

    // Whatever was still interim when the stream closed is the best text we
    // have, so keep it rather than discarding a half-finished sentence.
    setInterim((pending) => {
      if (pending) {
        finalRef.current = `${finalRef.current} ${pending}`.trim();
        setTranscript(finalRef.current);
      }
      return "";
    });
  }, []);

  const reset = useCallback(() => {
    finalRef.current = "";
    setTranscript("");
    setInterim("");
    setError(null);
  }, []);

  return { supported, listening, transcript, interim, error, start, stop, reset };
}
