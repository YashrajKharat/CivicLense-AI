import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";   // ADD THIS

export default function Modal({ title, subtitle, onClose, children, footer, width }) {
  const ref = useRef(null);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  return createPortal(                       // WRAP THE RETURN
    <div
      className="modal-backdrop"
      onPointerDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        ref={ref}
        style={width ? { maxWidth: width } : undefined}
        data-size={width ? "wide" : undefined}
      >
        <header className="modal__head">
          <div style={{ minWidth: 0 }}>
            <h2 className="h h-lg">{title}</h2>
            {subtitle && <p className="label" style={{ marginTop: 3 }}>{subtitle}</p>}
          </div>
          <button className="btn--quiet" onClick={onClose} aria-label="Close" style={{ flex: "none" }}>
            ✕
          </button>
        </header>

        <div className="modal__body">{children}</div>

        {footer && <footer className="modal__foot">{footer}</footer>}
      </div>
    </div>,
    document.body                             // TARGET
  );
}