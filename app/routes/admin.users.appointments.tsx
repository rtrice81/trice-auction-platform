import { env } from "cloudflare:workers";
import { Link } from "react-router";
import type { Route } from "./+types/admin.users.appointments";
import { AdminUserSubnav } from "../components/admin-user-subnav";
import { AppointmentStatusBadge } from "../components/admin-appointment-summary";
import { requireRole } from "../services/auth.server";
import { getCustomerAppointmentsByTiming, type CustomerAppointment } from "../services/customer-standing.server";
import { getManagedUser } from "../services/user-management.server";

const runtime = env as unknown as { AUTH_SECRET?: string; BETTER_AUTH_URL?: string };

export async function loader({ request, params }: Route.LoaderArgs) {
  await requireRole(request, env.trice_auction_db, runtime, "admin");
  const user = await getManagedUser(env.trice_auction_db, Number(params.id));
  if (!user) throw new Response("Not Found", { status: 404 });
  return { user, appointments: await getCustomerAppointmentsByTiming(env.trice_auction_db, user.id) };
}

export default function AdminUserAppointments({ loaderData }: Route.ComponentProps) {
  const { user, appointments } = loaderData;
  const userName = `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.email;
  return <main className="min-h-screen bg-stone-50 text-stone-900"><div className="mx-auto max-w-3xl px-6 py-12 sm:py-16">
    <Link to="/admin/users" className="text-sm font-semibold text-amber-800">← Back to Users</Link>
    <header className="mt-5 border-b border-stone-200 pb-7"><p className="text-sm font-semibold tracking-[0.18em] text-amber-700 uppercase">Trice Auctions · Administration</p><h1 className="mt-2 text-4xl font-bold tracking-tight">{userName}</h1><p className="mt-2 text-stone-600">Manage this user’s drop-off appointments.</p></header>
    <AdminUserSubnav userId={user.id} activeSection="appointments"/>
    <section className="mt-7" aria-labelledby="upcoming-appointments"><h2 id="upcoming-appointments" className="text-2xl font-bold">Upcoming Appointments</h2><p className="mt-1 text-sm text-stone-600">Scheduled for today or later.</p><AppointmentList appointments={appointments.upcoming} emptyMessage="No upcoming appointments."/></section>
    <section className="mt-10" aria-labelledby="past-appointments"><h2 id="past-appointments" className="text-2xl font-bold">Past Appointments</h2><p className="mt-1 text-sm text-stone-600">Cancelled appointments remain visible here with their recorded status.</p><AppointmentList appointments={appointments.past} emptyMessage="No past appointments."/></section>
  </div></main>;
}

function AppointmentList({ appointments, emptyMessage }: { appointments: CustomerAppointment[]; emptyMessage: string }) {
  if (!appointments.length) return <div className="mt-4 rounded-2xl border border-stone-200 bg-white p-6 text-sm text-stone-600 shadow-sm">{emptyMessage}</div>;
  return <div className="mt-4 space-y-4">{appointments.map((appointment) => <article key={appointment.id} className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm"><div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><h3 className="text-lg font-bold">{appointment.appointmentDate}{appointment.appointmentTime ? ` · ${appointment.appointmentTime}` : ""}</h3><p className="mt-1 text-sm font-semibold text-stone-700">{appointment.loadType}</p></div><AppointmentStatusBadge status={appointment.status}/></div><dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2"><AppointmentField label="Area allocation" value={appointment.allocationSummary || "No area allocations recorded."}/><AppointmentField label="Created" value={appointment.createdAt}/>{appointment.description ? <AppointmentField label="Description / notes" value={appointment.description} className="sm:col-span-2"/> : null}</dl><div className="mt-5 flex flex-wrap gap-3"><Link to={`/admin/appointments/${appointment.id}`} className="rounded-lg border border-stone-300 px-4 py-2 text-sm font-semibold text-stone-800">View Appointment</Link><Link to={`/admin/appointments/${appointment.id}/edit`} className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-semibold text-white">Edit Appointment</Link></div></article>)}</div>;
}

function AppointmentField({ label, value, className }: { label: string; value: string; className?: string }) { return <div className={className}><dt className="text-xs font-bold tracking-wide text-stone-500 uppercase">{label}</dt><dd className="mt-1 whitespace-pre-wrap text-stone-800">{value}</dd></div>; }
