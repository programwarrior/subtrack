"use client";

import { X } from "lucide-react";
import { useEffect, useRef } from "react";

export function Modal({ open, onClose, title, eyebrow, children, wide = false }: { open: boolean; onClose: () => void; title: string; eyebrow?: string; children: React.ReactNode; wide?: boolean }) {
  const dialog = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey); document.body.classList.add("modal-open");
    requestAnimationFrame(() => dialog.current?.querySelector<HTMLElement>("input, button, select, textarea")?.focus());
    return () => { document.removeEventListener("keydown", onKey); document.body.classList.remove("modal-open"); previous?.focus(); };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className={`modal-panel ${wide ? "modal-wide" : ""}`} role="dialog" aria-modal="true" aria-labelledby="modal-title" ref={dialog}>
        <div className="modal-head">
          <div>{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h2 id="modal-title">{title}</h2></div>
          <button className="icon-button" onClick={onClose} aria-label="Close"><X size={20} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Toast({ message, action, onAction, onDone }: { message: string; action?: string; onAction?: () => void; onDone?: () => void }) {
  useEffect(() => { const id = window.setTimeout(() => onDone?.(), 4500); return () => clearTimeout(id); }, [onDone]);
  return <div className="toast" role="status"><span>{message}</span>{action && <button onClick={onAction}>{action}</button>}</div>;
}

export function LogoMark() { return <span className="logo-mark" aria-hidden="true">S</span>; }

export function EmptyIcon() {
  return <div className="empty-icon" aria-hidden="true"><span /><span /><span /></div>;
}
