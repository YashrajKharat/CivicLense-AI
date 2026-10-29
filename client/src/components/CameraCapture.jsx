import { useEffect, useRef, useState, useCallback } from "react";
import { Icon } from "./Icons.jsx";
import { Label } from "./Primitives.jsx";

/**
 * A real camera, not a file input.
 *
 * `<input capture="environment">` is only honoured on mobile — desktop browsers
 * ignore the attribute and open the file picker, which is why "take a photo"
 * appeared to do nothing on a laptop. This opens the video stream directly, so
 * the same control works on a phone and on a desk.
 *
 * getUserMedia needs a secure context. localhost counts; a LAN address over
 * plain http does not, which is the usual cause of a silent failure when testing
 * from a phone on the same wifi.
 */
export default function CameraCapture({ onCapture, onCancel }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [facing, setFacing] = useState("environment");
  const [hasMultiple, setHasMultiple] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(null);
  const [shot, setShot] = useState(null);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const start = useCallback(
    async (mode) => {
      stop();
      setReady(false);
      setError(null);

      if (!navigator.mediaDevices?.getUserMedia) {
        setError(
          window.isSecureContext
            ? "This browser does not support camera access. Upload a photo instead."
            : "The camera needs a secure connection (https or localhost). Upload a photo instead."
        );
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: mode, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        setReady(true);

        // Only offer the flip control when there is something to flip to.
        const devices = await navigator.mediaDevices.enumerateDevices();
        setHasMultiple(devices.filter((d) => d.kind === "videoinput").length > 1);
      } catch (err) {
        setError(
          err.name === "NotAllowedError"
            ? "Camera access was blocked. Allow it in your browser's address bar, or upload a photo instead."
            : err.name === "NotFoundError"
            ? "No camera was found on this device. Upload a photo instead."
            : err.name === "NotReadableError"
            ? "The camera is already in use by another app. Close it and try again."
            : "The camera could not be opened. Upload a photo instead."
        );
      }
    },
    [stop]
  );

  useEffect(() => {
    start(facing);
    return stop;
  }, [facing, start, stop]);

  // Escape should close, and the stream must stop with it — a camera light left
  // on after the user thinks they closed the view is its own kind of bug.
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function close() {
    stop();
    onCancel();
  }

  function take() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext("2d");
    // A selfie camera previews mirrored; un-mirror it so the saved photo matches
    // what the officer will actually see at the location.
    if (facing === "user") {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0);

    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const file = new File([blob], `report-${Date.now()}.jpg`, { type: "image/jpeg" });
        setShot({ file, url: URL.createObjectURL(blob) });
        stop();
      },
      "image/jpeg",
      0.9
    );
  }

  function retake() {
    URL.revokeObjectURL(shot.url);
    setShot(null);
    start(facing);
  }

  function use() {
    onCapture(shot.file);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Camera"
      style={{
        position: "fixed", inset: 0, zIndex: 200, background: "var(--black)",
        display: "flex", flexDirection: "column",
      }}
    >
      <header
        className="row row--between"
        style={{ padding: "14px 18px", color: "var(--on-dark)", flex: "none" }}
      >
        <Label style={{ color: "var(--on-dark-2)" }}>
          {shot ? "Use this photo?" : "Frame the problem"}
        </Label>
        <button
          className="btn--quiet"
          onClick={close}
          aria-label="Close camera"
          style={{ color: "var(--on-dark-2)", fontSize: 20, lineHeight: 1 }}
        >
          ✕
        </button>
      </header>

      <div
        style={{
          flex: 1, minHeight: 0, display: "grid", placeItems: "center",
          position: "relative", overflow: "hidden",
        }}
      >
        {error ? (
          <div style={{ maxWidth: 380, padding: "var(--sp-5)", textAlign: "center", color: "var(--on-dark)" }}>
            <span className="tile tile--dark tile--lg" style={{ margin: "0 auto" }}><Icon.alert /></span>
            <p style={{ marginTop: 16, color: "var(--on-dark-2)" }}>{error}</p>
            <button className="btn btn--ghost-dark" style={{ marginTop: 20 }} onClick={close}>
              Go back
            </button>
          </div>
        ) : shot ? (
          <img
            src={shot.url}
            alt="Captured"
            style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
          />
        ) : (
          <>
            <video
              ref={videoRef}
              playsInline
              muted
              autoPlay
              style={{
                width: "100%", height: "100%", objectFit: "contain",
                transform: facing === "user" ? "scaleX(-1)" : "none",
              }}
            />
            {!ready && (
              <span className="label" style={{ position: "absolute", color: "var(--on-dark-2)" }}>
                Starting camera…
              </span>
            )}
          </>
        )}
      </div>

      <footer
        style={{
          flex: "none", padding: "20px 18px calc(20px + env(safe-area-inset-bottom))",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 20,
        }}
      >
        {shot ? (
          <>
            <button className="btn btn--ghost-dark" onClick={retake}>Retake</button>
            <button className="btn" onClick={use}>Use this photo</button>
          </>
        ) : (
          !error && (
            <>
              <div style={{ width: 44 }} />

              <button
                onClick={take}
                disabled={!ready}
                aria-label="Take photo"
                style={{
                  width: 68, height: 68, borderRadius: "50%",
                  border: "4px solid rgba(255,255,255,.9)", background: "var(--accent)",
                  opacity: ready ? 1 : 0.4,
                }}
              />

              <div style={{ width: 44 }}>
                {hasMultiple && (
                  <button
                    className="btn--quiet"
                    onClick={() => setFacing((f) => (f === "environment" ? "user" : "environment"))}
                    aria-label="Switch camera"
                    style={{ color: "var(--on-dark-2)", padding: 10 }}
                  >
                    <Icon.route width={22} height={22} />
                  </button>
                )}
              </div>
            </>
          )
        )}
      </footer>
    </div>
  );
}

/**
 * The pair of controls that belong together everywhere a photo is needed:
 * a real camera, and a file picker for people who already have the shot.
 */
export function PhotoPicker({ onFile, disabled, cameraLabel = "Take photo", fileLabel = "Upload photo" }) {
  const [open, setOpen] = useState(false);
  const inputRef = useRef(null);

  return (
    <>
      <div className="row row--wrap" style={{ gap: 10, justifyContent: "center" }}>
        <button className="btn" onClick={() => setOpen(true)} disabled={disabled}>
          <Icon.camera /> {cameraLabel}
        </button>
        <button className="btn btn--ghost" onClick={() => inputRef.current?.click()} disabled={disabled}>
          <Icon.file /> {fileLabel}
        </button>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
          e.target.value = ""; // allow re-picking the same file
        }}
      />

      {open && (
        <CameraCapture
          onCapture={(file) => { setOpen(false); onFile(file); }}
          onCancel={() => setOpen(false)}
        />
      )}
    </>
  );
}
