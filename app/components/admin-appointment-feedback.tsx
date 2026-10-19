import type { BookingInput, MonthlyAppointment } from "../services/booking.server";
import { formatAppointmentStatusLabel } from "../lib/appointment-status";
import { useEffect, useRef } from "react";

export function AppointmentCreationError({ errors }: { errors: string[] }) {
  const alertRef = useRef<HTMLDivElement>(null);
  useEffect(() => { alertRef.current?.focus(); }, [errors]);
  return <div ref={alertRef} tabIndex={-1} className="mt-4 rounded border border-red-200 bg-red-50 p-3" role="alert">{errors.join(" ")}</div>;
}

/** Shared server-driven confirmation for the standalone form and schedule modal. */
export function MonthlyAppointmentConfirmationFields({ input, appointments, scheduleId, modal = false, busy = false }: {
  input: BookingInput;
  appointments: MonthlyAppointment[];
  scheduleId?: number | null;
  modal?: boolean;
  busy?: boolean;
}) {
  const goBackRef = useRef<HTMLButtonElement>(null);
  // Focus also scrolls the confirmation into view in a long schedule modal.
  useEffect(() => { goBackRef.current?.focus(); }, []);
  return <>
    <p className="font-semibold" role="alert">This customer has already had a drop-off appointment this month. Would you still like to schedule another appointment?</p>
    <ul className="mt-2 text-sm">{appointments.map(appointment => <li key={appointment.id}>Appointment #{appointment.id} · {appointment.appointmentDate} · {formatAppointmentStatusLabel(appointment.status)}</li>)}</ul>
    <input type="hidden" name="overrideMonthlyLimit" value="true"/>
    {scheduleId ? <input type="hidden" name="scheduleId" value={scheduleId}/> : null}
    {modal ? <input type="hidden" name="responseMode" value="modal"/> : null}
    <input type="hidden" name="customerId" value={input.userId}/>
    <input type="hidden" name="appointmentDate" value={input.appointmentDate}/>
    <input type="hidden" name="dropoffTypeId" value={input.dropoffTypeId}/>
    <input type="hidden" name="description" value={input.description}/>
    {input.allocations.map(item => <input key={item.itemAreaId} type="hidden" name={`allocation-${item.itemAreaId}`} value={item.percentage}/>)}
    <div className="mt-4 flex flex-wrap gap-3">
      <button ref={goBackRef} name="intent" value="go-back" disabled={busy} className="rounded border border-stone-300 px-4 py-2 font-semibold">No, Go Back</button>
      <button name="intent" value="confirm-monthly" disabled={busy} className="rounded bg-stone-900 px-4 py-2 font-semibold text-white">Yes, Schedule Anyway</button>
    </div>
  </>;
}
