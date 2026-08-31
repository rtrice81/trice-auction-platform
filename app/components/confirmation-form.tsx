import { Form } from "react-router";
import { useEffect, useId, useRef, useState } from "react";

export type ConfirmationCopy = {
  title: string;
  description: React.ReactNode;
  confirmLabel: string;
  destructive?: boolean;
};

type ConfirmationFormProps = {
  action?: string;
  children: React.ReactNode;
  className?: string;
  confirmation: ConfirmationCopy;
  confirmationForSubmission?: (formData: FormData) => ConfirmationCopy | null;
  method?: "post" | "get";
};

export function ConfirmationForm({ action, children, className, confirmation, confirmationForSubmission, method = "post" }: ConfirmationFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const goBackButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const bypassRef = useRef(false);
  const titleId = useId();
  const descriptionId = useId();
  const [open, setOpen] = useState(false);
  const [copy, setCopy] = useState<ConfirmationCopy>(confirmation);

  useEffect(() => {
    if (!open) return;
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    // A destructive confirmation should not submit from a single accidental Enter press.
    goBackButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); setOpen(false); return; }
      if (event.key !== "Tab") return;
      const dialog = dialogRef.current;
      const focusable = dialog ? Array.from(dialog.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')) : [];
      if (focusable.length === 0) return;
      const current = document.activeElement;
      const index = focusable.indexOf(current as HTMLElement);
      if (event.shiftKey && (index <= 0 || current === dialog)) { event.preventDefault(); focusable.at(-1)?.focus(); }
      else if (!event.shiftKey && index === focusable.length - 1) { event.preventDefault(); focusable[0]?.focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      if (previousFocusRef.current?.isConnected) previousFocusRef.current.focus();
    };
  }, [open]);

  return <><Form ref={formRef} method={method} action={action} className={className} onSubmit={(event) => {
    if (bypassRef.current) { bypassRef.current = false; return; }
    const nextCopy = confirmationForSubmission?.(new FormData(event.currentTarget)) ?? confirmation;
    if (!nextCopy) return;
    event.preventDefault(); setCopy(nextCopy); setOpen(true);
  }}>{children}</Form>{open ? <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-stone-950/40 p-4" role="presentation"><section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId} className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"><h2 id={titleId} className="text-xl font-bold text-stone-950">{copy.title}</h2><div id={descriptionId} className="mt-3 text-stone-700">{copy.description}</div><div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><button ref={goBackButtonRef} type="button" onClick={() => setOpen(false)} className="rounded-lg border border-stone-300 px-4 py-2.5 font-semibold text-stone-800">Go Back</button><button type="button" onClick={() => { bypassRef.current = true; setOpen(false); formRef.current?.requestSubmit(); }} className={copy.destructive ? "rounded-lg bg-red-700 px-4 py-2.5 font-semibold text-white hover:bg-red-800" : "rounded-lg bg-stone-900 px-4 py-2.5 font-semibold text-white"}>{copy.confirmLabel}</button></div></section></div> : null}</>;
}
