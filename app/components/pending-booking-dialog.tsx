import { Link } from "react-router";
import { useEffect, useId, useRef } from "react";

export function PendingBookingDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const dialogRef = useRef<HTMLElement>(null);
  const loginButtonRef = useRef<HTMLAnchorElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (!open) return;
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    loginButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); onClose(); return; }
      if (event.key !== "Tab") return;
      const dialog = dialogRef.current;
      const focusable = dialog ? Array.from(dialog.querySelectorAll<HTMLElement>('button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])')) : [];
      if (focusable.length === 0) return;
      const index = focusable.indexOf(document.activeElement as HTMLElement);
      if (event.shiftKey && index <= 0) { event.preventDefault(); focusable.at(-1)?.focus(); }
      else if (!event.shiftKey && index === focusable.length - 1) { event.preventDefault(); focusable[0]?.focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      if (previousFocusRef.current?.isConnected) previousFocusRef.current.focus();
    };
  }, [onClose, open]);

  if (!open) return null;
  return <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-stone-950/50 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId} className="w-full max-w-lg rounded-2xl border border-[#8a2827] bg-white p-6 shadow-2xl sm:p-8"><p className="text-sm font-bold uppercase tracking-[0.16em] text-[#9d302f]">Trice Auctions</p><h2 id={titleId} className="mt-2 text-3xl font-bold text-stone-950">You’re almost done</h2><p id={descriptionId} className="mt-4 text-base leading-7 text-stone-700">An account is required to complete your drop-off request. Your appointment details have been saved for two hours.</p><div className="mt-7 grid gap-3 sm:grid-cols-2"><Link ref={loginButtonRef} to="/login" className="ta-button ta-button-primary">Log In</Link><Link to="/register" className="ta-button ta-button-secondary">Create Account</Link></div><button type="button" onClick={onClose} className="mt-5 w-full text-sm font-semibold text-[#9d302f] underline underline-offset-4 hover:text-[#812625]">Continue Editing</button></section></div>;
}
