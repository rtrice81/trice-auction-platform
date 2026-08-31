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
  return <div className="space-y-3">{appointments.map((appointment) => <article key={appointment.id} className="rounded-lg border border-[#dfe1e4] bg-white p-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-bold text-[#25272b]">{appointment.time || "Time TBD"} · {appointment.customer}</p><p className="mt-1 text-sm text-[#5f6368]">{appointment.loadType} · {appointment.allocationSummary || "No area allocations recorded."}</p></div><div className="flex flex-wrap items-center gap-3"><AppointmentStatusBadge status={appointment.status}/><Link to={`/admin/appointments/${appointment.id}`} className="ta-button ta-button-secondary">View Appointment</Link></div></div></article>)}</div>;
}
