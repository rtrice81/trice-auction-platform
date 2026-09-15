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

type CustomerActionData = {
  ok: boolean;
  customer?: Customer;
  duplicate?: Customer;
  errors?: string[];
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
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const handledCustomerIdRef = useRef<number | null>(null);
  const searchFetcher = useFetcher<SearchData>();
  const appointmentFetcher = useFetcher<AppointmentActionData>();
  const customerFetcher = useFetcher<CustomerActionData>();
  const titleId = useId();
  const descriptionId = useId();
  const submitted = appointmentFetcher.data?.submitted;
  const needsOverride = Boolean(appointmentFetcher.data && !appointmentFetcher.data.ok && appointmentFetcher.data.overridableViolations?.length && appointmentFetcher.data.errors?.every((error) => appointmentFetcher.data?.overridableViolations?.includes(error)));

  const openModal = () => {
    setDirty(false);
    setHasSubmitted(false);
    setSelectedCustomer(null);
    setShowNewCustomer(false);
    handledCustomerIdRef.current = null;
    setOpen(true);
  };
  const closeModal = () => {
    setOpen(false);
    setDirty(false);
    setHasSubmitted(false);
    setShowNewCustomer(false);
    handledCustomerIdRef.current = null;
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
    const customer = customerFetcher.data?.customer;
    if (!open || customerFetcher.state !== "idle" || !customerFetcher.data?.ok || !customer || handledCustomerIdRef.current === customer.id) return;
    handledCustomerIdRef.current = customer.id;
    setSelectedCustomer(customer);
    setShowNewCustomer(false);
    setDirty(true);
  }, [customerFetcher.data, customerFetcher.state, open]);

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
  return <><button ref={triggerRef} type="button" className="rounded bg-stone-900 px-4 py-2 font-semibold text-white" onClick={openModal}>Add Appointment</button>{open ? <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-stone-950/50 p-4 sm:items-center" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) requestClose(); }}><section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId} className="my-4 w-full max-w-3xl rounded-2xl bg-white p-5 shadow-2xl sm:p-7"><div className="flex items-start justify-between gap-4"><div><h2 id={titleId} className="text-2xl font-bold text-stone-950">Add Appointment</h2><p id={descriptionId} className="mt-1 text-sm text-stone-600">Adding an appointment for {appointmentDate}. This drop-off date is locked to the current schedule.</p></div><button type="button" onClick={requestClose} aria-label="Close Add Appointment dialog" className="rounded p-2 text-2xl leading-none text-stone-600 hover:bg-stone-100">×</button></div><p className="mt-4 rounded border border-blue-200 bg-blue-50 p-3 text-sm text-blue-950">Admins may schedule appointments outside the public signup window. Capacity and customer booking limits still apply.</p><searchFetcher.Form method="get" action="/admin/appointments/new" className="mt-5 flex flex-col gap-2 sm:flex-row"><input type="hidden" name="scheduleId" value={scheduleId}/><input type="hidden" name="appointmentDate" value={appointmentDate}/><input name="q" aria-label="Search customers" placeholder="Search name, email, phone, or consignor number" className="min-h-11 flex-1 rounded border border-stone-300 px-3 py-2"/><button className="rounded border border-stone-300 px-4 py-2 font-semibold">Search customers</button></searchFetcher.Form><div className="mt-3 rounded border border-stone-200 p-3">{selectedCustomer ? <CustomerSummary customer={selectedCustomer} onChange={() => { setSelectedCustomer(null); setDirty(true); }}/> : customers.length ? <ul className="max-h-36 space-y-2 overflow-y-auto">{customers.map((customer) => <li key={customer.id}><button type="button" className="text-left font-semibold text-[#9d302f] underline" onClick={() => { setSelectedCustomer(customer); setDirty(true); }}>{customer.name} ({customer.email})</button></li>)}</ul> : <p className="text-sm text-stone-600">{searchFetcher.state === "loading" ? "Searching customers…" : "Search for a customer to continue."}</p>}<button type="button" className="mt-3 text-sm font-semibold text-[#9d302f] underline" onClick={() => setShowNewCustomer((visible) => !visible)}>{showNewCustomer ? "Hide New Customer Form" : "Add New Customer"}</button></div>{showNewCustomer ? <InlineCustomerForm fetcher={customerFetcher} onCancel={() => setShowNewCustomer(false)} onSelectDuplicate={(customer) => { setSelectedCustomer(customer); setShowNewCustomer(false); setDirty(true); }}/>: null}{appointmentFetcher.data && !appointmentFetcher.data.ok && appointmentFetcher.data.errors ? <div className="mt-4 rounded border border-red-200 bg-red-50 p-3" role="alert">{appointmentFetcher.data.errors.join(" ")}</div> : null}{selectedCustomer ? <appointmentFetcher.Form method="post" action="/admin/appointments/new" className="mt-5 grid gap-4" onChange={() => setDirty(true)} onSubmit={() => setHasSubmitted(true)}><input type="hidden" name="intent" value="save"/><input type="hidden" name="responseMode" value="modal"/><input type="hidden" name="customerId" value={selectedCustomer.id}/><AdminAppointmentFields dropoffTypes={options.dropoffTypes} itemAreas={options.itemAreas} submitted={submitted} scheduleId={scheduleId} selectedDate={appointmentDate}/><div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><button type="button" onClick={requestClose} className="rounded border border-stone-300 px-4 py-2 font-semibold">Cancel</button><button disabled={appointmentFetcher.state !== "idle"} className="rounded bg-stone-900 px-4 py-2 font-semibold text-white">{appointmentFetcher.state === "idle" ? "Create appointment" : "Creating…"}</button></div></appointmentFetcher.Form> : <div className="mt-5 flex justify-end"><button type="button" onClick={requestClose} className="rounded border border-stone-300 px-4 py-2 font-semibold">Cancel</button></div>}{needsOverride && submitted && selectedCustomer ? <appointmentFetcher.Form method="post" action="/admin/appointments/new" className="mt-5 rounded border-2 border-amber-500 bg-amber-50 p-4" onSubmit={() => setHasSubmitted(true)}><input type="hidden" name="intent" value="override"/><input type="hidden" name="responseMode" value="modal"/><input type="hidden" name="scheduleId" value={scheduleId}/><input type="hidden" name="customerId" value={submitted.userId}/><input type="hidden" name="appointmentDate" value={submitted.appointmentDate}/><input type="hidden" name="dropoffTypeId" value={submitted.dropoffTypeId}/><input type="hidden" name="description" value={submitted.description}/>{submitted.allocations.map((item) => <input key={item.itemAreaId} type="hidden" name={`allocation-${item.itemAreaId}`} value={item.percentage}/>)}<label>Override reason<textarea required name="overrideReason" className="mt-1 block w-full border p-2"/></label><button disabled={appointmentFetcher.state !== "idle"} className="mt-3 rounded bg-stone-900 px-4 py-2 font-semibold text-white">{appointmentFetcher.state === "idle" ? "Record override and create appointment" : "Creating…"}</button></appointmentFetcher.Form> : null}</section></div> : null}</>;
}

function CustomerSummary({ customer, onChange }: { customer: Customer; onChange: () => void }) { return <div className="flex flex-wrap items-start justify-between gap-3"><div><strong>{customer.name}</strong><p className="text-sm text-stone-600">{customer.email}{customer.phone ? ` · ${customer.phone}` : ""}{customer.consignorNumber ? ` · Consignor Number: ${customer.consignorNumber}` : ""}</p></div><button type="button" className="text-sm font-semibold text-[#9d302f] underline" onClick={onChange}>Change customer</button></div>; }

function InlineCustomerForm({ fetcher, onCancel, onSelectDuplicate }: { fetcher: ReturnType<typeof useFetcher<CustomerActionData>>; onCancel: () => void; onSelectDuplicate: (customer: Customer) => void }) {
  const result = fetcher.data;
  return <fetcher.Form method="post" action="/admin/appointments/new" className="mt-4 grid gap-4 rounded border border-amber-200 bg-amber-50 p-4 sm:grid-cols-2"><input type="hidden" name="intent" value="create-customer"/><div className="sm:col-span-2"><h3 className="font-bold">Add New Customer</h3><p className="mt-1 text-sm text-stone-600">Creates a customer account with a temporary password that must be changed at first sign-in.</p></div>{result && !result.ok && result.errors?.length ? <p className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-950 sm:col-span-2" role="alert">{result.errors.join(" ")}</p> : null}{result?.duplicate ? <div className="rounded border border-amber-300 bg-white p-3 text-sm sm:col-span-2"><p>An account already exists for this email: <strong>{result.duplicate.name}</strong> ({result.duplicate.email}).</p><button type="button" className="mt-2 font-semibold text-[#9d302f] underline" onClick={() => onSelectDuplicate(result.duplicate!)}>Select existing customer</button></div> : null}<label>First Name<input required name="firstName" className="mt-1 block w-full border p-2"/></label><label>Last Name<input required name="lastName" className="mt-1 block w-full border p-2"/></label><label className="sm:col-span-2">Email<input required type="email" name="email" className="mt-1 block w-full border p-2"/></label><label>Phone<input required name="phone" className="mt-1 block w-full border p-2"/></label><label>Temporary Password<input required minLength={8} type="password" name="temporaryPassword" autoComplete="new-password" className="mt-1 block w-full border p-2"/></label><label className="sm:col-span-2">Consignor Number<input name="consignorNumber" className="mt-1 block w-full border p-2"/></label><label className="text-sm sm:col-span-2"><input type="checkbox" name="active" value="true" defaultChecked/> Active account</label><div className="flex flex-col-reverse gap-3 sm:col-span-2 sm:flex-row sm:justify-end"><button type="button" onClick={onCancel} className="rounded border border-stone-300 px-4 py-2 font-semibold">Cancel New Customer</button><button disabled={fetcher.state !== "idle"} className="rounded bg-stone-900 px-4 py-2 font-semibold text-white">{fetcher.state === "idle" ? "Create customer" : "Creating customer…"}</button></div></fetcher.Form>;
}
