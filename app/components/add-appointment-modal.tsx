import { useEffect, useId, useRef, useState } from "react";
import { useFetcher } from "react-router";
import { AdminAppointmentFields } from "./admin-appointment-fields";
import type { BookingInput, ItemArea } from "../services/booking.server";
import type { Customer } from "../services/customer-management.server";

type BookingOptions = {
  dropoffTypes: Array<{ id: number; name: string }>;
  itemAreas: ItemArea[];
};

type SearchData = { customers: Customer[] };
type AppointmentActionData = {
  ok: boolean;
  message?: string;
  errors?: string[];
  overridableViolations?: string[];
  submitted?: BookingInput;
};

type AddAppointmentModalProps = {
  scheduleId: number;
  appointmentDate: string;
  options: BookingOptions;
  onCreated: (message: string) => void;
};

export function AddAppointmentModal({ scheduleId, appointmentDate, options, onCreated }: AddAppointmentModalProps) {
  const [open, setOpen] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const searchFetcher = useFetcher<SearchData>();
  const appointmentFetcher = useFetcher<AppointmentActionData>();
  const titleId = useId();
  const descriptionId = useId();
  const submitted = appointmentFetcher.data?.submitted;
  const needsOverride = Boolean(appointmentFetcher.data && !appointmentFetcher.data.ok && appointmentFetcher.data.overridableViolations?.length && appointmentFetcher.data.errors?.every((error) => appointmentFetcher.data?.overridableViolations?.includes(error)));

  const openModal = () => {
    setDirty(false);
    setHasSubmitted(false);
    setSelectedCustomer(null);
    setOpen(true);
  };
  const closeModal = () => {
    setOpen(false);
    setDirty(false);
    setHasSubmitted(false);
    window.setTimeout(() => triggerRef.current?.focus(), 0);
  };
  const requestClose = () => {
    if (dirty && !window.confirm("Discard the unsaved appointment?")) return;
    closeModal();
  };

  useEffect(() => {
    if (!open) return;
    searchFetcher.load(`/admin/appointments/new?scheduleId=${scheduleId}&appointmentDate=${appointmentDate}`);
  // The schedule context is immutable while the modal is open.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, scheduleId, appointmentDate]);

  useEffect(() => {
    if (!open || !hasSubmitted || appointmentFetcher.state !== "idle" || !appointmentFetcher.data?.ok) return;
    onCreated(appointmentFetcher.data.message ?? "Appointment created.");
    closeModal();
  // `closeModal` and `onCreated` are intentionally invoked for one completed submission.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appointmentFetcher.data, appointmentFetcher.state, hasSubmitted, open]);

  useEffect(() => {
    if (!open) return;
    const firstFocusable = dialogRef.current?.querySelector<HTMLElement>("button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href]");
    firstFocusable?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); requestClose(); return; }
      if (event.key !== "Tab") return;
      const dialog = dialogRef.current;
      const focusable = dialog ? Array.from(dialog.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')) : [];
      if (!focusable.length) return;
      const index = focusable.indexOf(document.activeElement as HTMLElement);
      if (event.shiftKey && index <= 0) { event.preventDefault(); focusable.at(-1)?.focus(); }
      else if (!event.shiftKey && index === focusable.length - 1) { event.preventDefault(); focusable[0]?.focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [dirty, open]);

  const customers = searchFetcher.data?.customers ?? [];
  return <><button ref={triggerRef} type="button" className="rounded bg-stone-900 px-4 py-2 font-semibold text-white" onClick={openModal}>Add Appointment</button>{open ? <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-stone-950/50 p-4 sm:items-center" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) requestClose(); }}><section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId} className="my-4 w-full max-w-3xl rounded-2xl bg-white p-5 shadow-2xl sm:p-7"><div className="flex items-start justify-between gap-4"><div><h2 id={titleId} className="text-2xl font-bold text-stone-950">Add Appointment</h2><p id={descriptionId} className="mt-1 text-sm text-stone-600">Adding an appointment for {appointmentDate}. This drop-off date is locked to the current schedule.</p></div><button type="button" onClick={requestClose} aria-label="Close Add Appointment dialog" className="rounded p-2 text-2xl leading-none text-stone-600 hover:bg-stone-100">×</button></div><p className="mt-4 rounded border border-blue-200 bg-blue-50 p-3 text-sm text-blue-950">Admins may schedule appointments outside the public signup window. Capacity and customer booking limits still apply.</p><searchFetcher.Form method="get" action="/admin/appointments/new" className="mt-5 flex flex-col gap-2 sm:flex-row"><input type="hidden" name="scheduleId" value={scheduleId}/><input type="hidden" name="appointmentDate" value={appointmentDate}/><input name="q" aria-label="Search customers" placeholder="Search name, email, or phone" className="min-h-11 flex-1 rounded border border-stone-300 px-3 py-2"/><button className="rounded border border-stone-300 px-4 py-2 font-semibold">Search customers</button></searchFetcher.Form><div className="mt-3 rounded border border-stone-200 p-3">{selectedCustomer ? <div className="flex flex-wrap items-center justify-between gap-3"><strong>{selectedCustomer.name} · {selectedCustomer.email}</strong><button type="button" className="text-sm font-semibold text-[#9d302f] underline" onClick={() => { setSelectedCustomer(null); setDirty(true); }}>Change customer</button></div> : customers.length ? <ul className="max-h-36 space-y-2 overflow-y-auto">{customers.map((customer) => <li key={customer.id}><button type="button" className="text-left font-semibold text-[#9d302f] underline" onClick={() => { setSelectedCustomer(customer); setDirty(true); }}>{customer.name} ({customer.email})</button></li>)}</ul> : <p className="text-sm text-stone-600">{searchFetcher.state === "loading" ? "Searching customers…" : "Search for a customer to continue."}</p>}</div>{appointmentFetcher.data && !appointmentFetcher.data.ok && appointmentFetcher.data.errors ? <div className="mt-4 rounded border border-red-200 bg-red-50 p-3" role="alert">{appointmentFetcher.data.errors.join(" ")}</div> : null}{selectedCustomer ? <appointmentFetcher.Form method="post" action="/admin/appointments/new" className="mt-5 grid gap-4" onChange={() => setDirty(true)} onSubmit={() => setHasSubmitted(true)}><input type="hidden" name="intent" value="save"/><input type="hidden" name="responseMode" value="modal"/><input type="hidden" name="customerId" value={selectedCustomer.id}/><AdminAppointmentFields dropoffTypes={options.dropoffTypes} itemAreas={options.itemAreas} submitted={submitted} scheduleId={scheduleId} selectedDate={appointmentDate}/><div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><button type="button" onClick={requestClose} className="rounded border border-stone-300 px-4 py-2 font-semibold">Cancel</button><button disabled={appointmentFetcher.state !== "idle"} className="rounded bg-stone-900 px-4 py-2 font-semibold text-white">{appointmentFetcher.state === "idle" ? "Create appointment" : "Creating…"}</button></div></appointmentFetcher.Form> : <div className="mt-5 flex justify-end"><button type="button" onClick={requestClose} className="rounded border border-stone-300 px-4 py-2 font-semibold">Cancel</button></div>}{needsOverride && submitted && selectedCustomer ? <appointmentFetcher.Form method="post" action="/admin/appointments/new" className="mt-5 rounded border-2 border-amber-500 bg-amber-50 p-4" onSubmit={() => setHasSubmitted(true)}><input type="hidden" name="intent" value="override"/><input type="hidden" name="responseMode" value="modal"/><input type="hidden" name="scheduleId" value={scheduleId}/><input type="hidden" name="customerId" value={submitted.userId}/><input type="hidden" name="appointmentDate" value={submitted.appointmentDate}/><input type="hidden" name="dropoffTypeId" value={submitted.dropoffTypeId}/><input type="hidden" name="description" value={submitted.description}/>{submitted.allocations.map((item) => <input key={item.itemAreaId} type="hidden" name={`allocation-${item.itemAreaId}`} value={item.percentage}/>)}<label>Override reason<textarea required name="overrideReason" className="mt-1 block w-full border p-2"/></label><button disabled={appointmentFetcher.state !== "idle"} className="mt-3 rounded bg-stone-900 px-4 py-2 font-semibold text-white">{appointmentFetcher.state === "idle" ? "Record override and create appointment" : "Creating…"}</button></appointmentFetcher.Form> : null}</section></div> : null}</>;
}
