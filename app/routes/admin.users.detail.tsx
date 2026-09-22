import { env } from "cloudflare:workers";
import { Link } from "react-router";
import type { Route } from "./+types/admin.users.detail";
import { AdminUserSubnav } from "../components/admin-user-subnav";
import { requireRole } from "../services/auth.server";
import { getCustomerAppointmentsByTiming, getCustomerPrivateNotes, getCustomerStanding } from "../services/customer-standing.server";
import { getManagedUser } from "../services/user-management.server";

const runtime = env as unknown as { AUTH_SECRET?: string; BETTER_AUTH_URL?: string };

export async function loader({ request, params }: Route.LoaderArgs) {
  await requireRole(request, env.trice_auction_db, runtime, "admin");
  const user = await getManagedUser(env.trice_auction_db, Number(params.id));
  if (!user) throw new Response("Not Found", { status: 404 });
  const appointments = await getCustomerAppointmentsByTiming(env.trice_auction_db, user.id);
  const customerData = user.role === "customer" ? await Promise.all([
    getCustomerStanding(env.trice_auction_db, user.id),
    getCustomerPrivateNotes(env.trice_auction_db, user.id),
  ]) : [null, []] as const;
  return { user, standing: customerData[0], privateNotes: customerData[1], appointments };
}

export default function AdminUserDetail({ loaderData }: Route.ComponentProps) {
  const { user, standing, privateNotes, appointments } = loaderData;
  return <main className="min-h-screen bg-stone-50 text-stone-900"><div className="mx-auto max-w-3xl px-6 py-12 sm:py-16">
    <Link to="/admin/users" className="text-sm font-semibold text-amber-800">← Back to Users</Link>
    <header className="mt-5 flex flex-wrap items-start justify-between gap-5 border-b border-stone-200 pb-7"><div><p className="text-sm font-semibold tracking-[0.18em] text-amber-700 uppercase">Trice Auctions · Administration</p><h1 className="mt-2 text-4xl font-bold tracking-tight">{user.name}</h1><p className="mt-2 text-stone-600">User details and consignment activity.</p></div><Link to={`/admin/users/${user.id}/edit`} className="rounded-lg bg-stone-900 px-4 py-2.5 text-sm font-semibold text-white">Edit User</Link></header>
    <AdminUserSubnav userId={user.id} activeSection="overview"/>
    <section className="mt-6 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm"><h2 className="text-xl font-bold">User Information</h2><dl className="mt-5 grid gap-5 sm:grid-cols-2"><Detail label="Name" value={user.name}/><Detail label="Email / login email" value={user.email}/><Detail label="Phone" value={user.phone || "Not provided"}/><Detail label="Role" value={user.role}/><Detail label="Consignor Number" value={user.consignorNumber || "Not assigned"}/><Detail label="Account status" value={user.active ? "Active" : "Inactive"}/><Detail label="Created" value={user.createdAt}/></dl></section>
    <section className="mt-6 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="text-xl font-bold">Consignment Appointments</h2><p className="mt-1 text-sm text-stone-600">Appointments belonging to this user.</p></div><Link to={`/admin/users/${user.id}/appointments`} className="rounded-lg border border-stone-300 px-4 py-2 text-sm font-semibold text-stone-800">View Appointments</Link></div><dl className="mt-5 grid gap-4 sm:grid-cols-2"><Detail label="Upcoming Appointments" value={String(appointments.upcoming.length)}/><Detail label="Past Appointments" value={String(appointments.past.length)}/></dl></section>
    {user.role === "customer" ? <><section className="mt-6 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm"><h2 className="text-xl font-bold">Drop-Off Status</h2><p className={`mt-2 font-semibold ${standing?.dropoffBanned ? "text-red-700" : "text-emerald-700"}`}>{standing?.dropoffBanned ? "Banned" : "Eligible"}</p>{standing?.dropoffBanned ? <p className="mt-2 text-sm text-stone-700">Reason: {standing.banReason || "No reason recorded."}{standing.bannedAt ? ` · Recorded ${standing.bannedAt}` : ""}{standing.bannedByName ? ` by ${standing.bannedByName}` : ""}</p> : <p className="mt-2 text-sm text-stone-600">This customer may schedule drop-offs.</p>}</section><section className="mt-6 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm"><h2 className="text-xl font-bold">Internal Notes</h2><p className="mt-1 text-sm text-stone-600">Not visible to the customer.</p>{privateNotes.length ? <ol className="mt-5 divide-y divide-stone-200">{privateNotes.map((note) => <li key={note.id} className="py-3"><p className="whitespace-pre-wrap text-sm">{note.noteText}</p><p className="mt-1 text-xs text-stone-500">{note.authorName} · {note.createdAt}</p></li>)}</ol> : <p className="mt-5 text-sm text-stone-600">No private notes have been added.</p>}</section></> : null}
  </div></main>;
}

function Detail({ label, value }: { label: string; value: string }) { return <div><dt className="text-xs font-bold tracking-wide text-stone-500 uppercase">{label}</dt><dd className="mt-1 whitespace-pre-wrap text-stone-900">{value}</dd></div>; }
