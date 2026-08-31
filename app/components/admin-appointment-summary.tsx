import { Link } from "react-router";

export type AdminAppointmentSummary = {
  id: number;
  time: string | null;
  customer: string;
  loadType: string;
  status: string;
  allocationSummary?: string;
};

export function AppointmentStatusBadge({ status }: { status: string }) {
  const color = status === "scheduled" ? "bg-amber-100 text-amber-900" : status === "completed" ? "bg-emerald-100 text-emerald-900" : status === "cancelled" ? "bg-red-100 text-red-900" : "bg-slate-200 text-slate-800";
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold capitalize ${color}`}>{status.replaceAll("_", " ")}</span>;
}

export function AppointmentSummaryList({ appointments }: { appointments: AdminAppointmentSummary[] }) {
  if (!appointments.length) return <p className="text-sm text-[#5f6368]">No appointments are scheduled for this event.</p>;
  return <div className="space-y-4">{appointments.map((appointment) => <AdminAppointmentCard key={appointment.id} appointment={appointment}/>)}</div>;
}

export function AdminAppointmentCard({ appointment }: { appointment: AdminAppointmentSummary }) {
  return <article className="rounded-xl border border-[#dfe1e4] bg-white p-5 shadow-sm sm:p-6"><div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><p className="text-lg font-bold tracking-tight text-[#25272b] sm:text-xl">{appointment.time || "Time TBD"} · {appointment.customer}</p><p className="mt-2 text-sm leading-6 text-[#5f6368] sm:text-base">{appointment.loadType} · {appointment.allocationSummary || "No area allocations recorded."}</p></div><div className="flex flex-col gap-3 sm:flex-row sm:items-center"><AppointmentStatusBadge status={appointment.status}/><Link to={`/admin/appointments/${appointment.id}`} className="ta-button ta-button-secondary w-full sm:w-auto">View Appointment</Link></div></div></article>;
}
