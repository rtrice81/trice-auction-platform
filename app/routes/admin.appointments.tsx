import { env } from "cloudflare:workers";
import { Form, Link } from "react-router";
import type { Route } from "./+types/admin.appointments";
import { requireRole } from "../services/auth.server";

const runtime = env as unknown as { AUTH_SECRET?: string; BETTER_AUTH_URL?: string };

export async function loader({ request }: Route.LoaderArgs) {
  await requireRole(request, env.trice_auction_db, runtime, "admin");
  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  const pattern = `%${q}%`;
  const { results } = await env.trice_auction_db.prepare(
    `SELECT a.id, a.appointment_date AS date, a.appointment_time AS time, a.status,
      d.name AS loadType, COALESCE(NULLIF(TRIM(u.first_name || ' ' || u.last_name), ''), u.email) AS customer, u.email
     FROM appointments a JOIN users u ON u.id = a.user_id JOIN dropoff_types d ON d.id = a.dropoff_type_id
     WHERE ? = '' OR LOWER(u.email) LIKE LOWER(?) OR LOWER(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')) LIKE LOWER(?)
     ORDER BY a.appointment_date DESC, a.appointment_time DESC, a.id DESC`,
  ).bind(q, pattern, pattern).all<{ id: number; date: string; time: string | null; status: string; loadType: string; customer: string; email: string }>();
  return { q, appointments: results };
}

export default function AdminAppointments({ loaderData }: Route.ComponentProps) {
  return <main className="mx-auto max-w-6xl p-8"><header className="flex flex-wrap justify-between gap-4"><div><h1 className="text-3xl font-bold">Appointments</h1><p className="mt-2 text-stone-600">Create and manage customer drop-off appointments.</p></div><Link to="/admin/appointments/new" className="rounded bg-stone-900 px-4 py-2 font-semibold text-white">New Appointment</Link></header><Form method="get" className="mt-6 flex gap-3"><input name="q" defaultValue={loaderData.q} placeholder="Customer name or email" className="w-full max-w-md border p-2"/><button className="rounded border px-4">Search</button></Form><div className="mt-6 overflow-x-auto rounded border bg-white"><table className="min-w-full text-left"><thead><tr className="border-b bg-stone-100"><th className="p-3">Customer</th><th className="p-3">Date/time</th><th className="p-3">Load</th><th className="p-3">Status</th><th className="p-3"/></tr></thead><tbody>{loaderData.appointments.map((appointment) => <tr key={appointment.id} className="border-b"><td className="p-3"><strong>{appointment.customer}</strong><br/><span className="text-sm text-stone-600">{appointment.email}</span></td><td className="p-3">{appointment.date} · {appointment.time || "Time TBD"}</td><td className="p-3">{appointment.loadType}</td><td className="p-3 capitalize">{appointment.status}</td><td className="p-3"><Link className="font-semibold text-amber-800 underline" to={`/admin/appointments/${appointment.id}`}>View / edit</Link></td></tr>)}</tbody></table>{loaderData.appointments.length === 0 ? <p className="p-5 text-stone-600">No appointments found.</p> : null}</div></main>;
}
