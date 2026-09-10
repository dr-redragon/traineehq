import { useEffect, type ReactNode } from "react";

/**
 * The register's modal: `.modal-back` over `.modal-card`.
 *
 * Written out rather than taken from shadcn because the original had no
 * component library, and — more practically — a Radix dialog renders through a
 * portal at the end of <body>, outside `.classic-register`, where none of this
 * register's styles reach it. It would come out unstyled.
 */
export function Modal({
  title,
  onClose,
  footer,
  children,
}: {
  title: string;
  onClose: () => void;
  footer?: ReactNode;
  children: ReactNode;
}) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [onClose]);

  return (
    <div
      className="modal-back show classic-register"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="modal-card" role="dialog" aria-label={title}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button type="button" className="iconbtn" aria-label="Close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && (
          <div style={{
            padding: "14px 26px",
            borderTop: "1px solid var(--line)",
            display: "flex",
            gap: 10,
            justifyContent: "flex-end",
          }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
