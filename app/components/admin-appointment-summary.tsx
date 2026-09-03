import { Link } from "react-router";
import { Form } from "react-router";
import { ConfirmationForm } from "./confirmation-form";

export type AdminAppointmentSummary = {
  id: number;
  customer: string;
  loadType: string;
  status: string;
  allocationSummary?: string;
  consignorId?: string | null;
  phone?: string | null;
};

export function AppointmentStatusBadge({ status }: { status: string }) {
  const color = status === "scheduled" ? "bg-amber-100 text-amber-900" : status === "completed" ? "bg-emerald-100 text-emerald-900" : status === "cancelled" ? "bg-red-100 text-red-900" : "bg-slate-200 text-slate-800";
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold capitalize ${color}`}>{status.replaceAll("_", " ")}</span>;
}

export function AppointmentSummaryList({ appointments, attendanceControls = false }: { appointments: AdminAppointmentSummary[]; attendanceControls?: boolean }) {
  if (!appointments.length) return <p className="text-sm text-[#5f6368]">No appointments are scheduled for this event.</p>;
  return <div className="space-y-4">{appointments.map((appointment) => <AdminAppointmentCard key={appointment.id} appointment={appointment} attendanceControls={attendanceControls}/>)}</div>;
}

export function AdminAppointmentCard({ appointment, attendanceControls = false }: { appointment: AdminAppointmentSummary; attendanceControls?: boolean }) {
  return <article className="rounded-xl border border-[#dfe1e4] bg-white p-5 shadow-sm sm:p-6"><div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><p className="text-lg font-bold tracking-tight text-[#25272b] sm:text-xl">{appointment.customer}</p>{appointment.consignorId ? <p className="mt-1 text-sm text-[#5f6368]">Consignor #{appointment.consignorId}</p> : null}{appointment.phone ? <p className="mt-1 text-sm text-[#5f6368]">{appointment.phone}</p> : null}<p className="mt-2 text-sm leading-6 text-[#5f6368] sm:text-base">{appointment.loadType} · {appointment.allocationSummary || "No area allocations recorded."}</p></div><div className="flex flex-col gap-3 sm:flex-row sm:items-center"><AppointmentStatusBadge status={appointment.status}/><Link to={`/admin/appointments/${appointment.id}`} className="ta-button ta-button-secondary w-full sm:w-auto">View Appointment</Link></div></div>{attendanceControls ? <AttendanceActions appointment={appointment}/> : null}</article>;
}

function AttendanceActions({ appointment }: { appointment: AdminAppointmentSummary }) { return appointment.status === "scheduled" ? <div className="mt-4 flex flex-wrap gap-2"><Form method="post"><input type="hidden" name="intent" value="attendance"/><input type="hidden" name="appointmentId" value={appointment.id}/><input type="hidden" name="attendanceAction" value="check-in"/><button className="ta-button ta-button-primary">Check In</button></Form><AttendanceConfirmation appointmentId={appointment.id} action="no-show" label="No Show" title="Mark this appointment as a no-show?"/><AttendanceConfirmation appointmentId={appointment.id} action="last-minute-cancel" label="Last-Minute Cancel" title="Record this appointment as a last-minute cancellation?"/></div> : appointment.status === "checked_in" ? <div className="mt-4"><Form method="post"><input type="hidden" name="intent" value="attendance"/><input type="hidden" name="appointmentId" value={appointment.id}/><input type="hidden" name="attendanceAction" value="complete"/><button className="ta-button ta-button-primary">Mark Completed</button></Form></div> : null; }
function AttendanceConfirmation({ appointmentId, action, label, title }: { appointmentId: number; action: string; label: string; title: string }) { return <ConfirmationForm method="post" confirmation={{ title, description: "This attendance status will be recorded in the appointment history.", confirmLabel: label, destructive: true }}><input type="hidden" name="intent" value="attendance"/><input type="hidden" name="appointmentId" value={appointmentId}/><input type="hidden" name="attendanceAction" value={action}/><button className="ta-button ta-button-destructive">{label}</button></ConfirmationForm>; }
