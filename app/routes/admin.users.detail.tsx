import { env } from "cloudflare:workers";
import { data, Form, Link } from "react-router";
import type { Route } from "./+types/admin.users.detail";
import { AdminUserSubnav } from "../components/admin-user-subnav";
import { ConfirmationForm } from "../components/confirmation-form";
import { requireRole } from "../services/auth.server";
import { addCustomerPrivateNote, getCustomerAppointmentsByTiming, getCustomerPrivateNotes, getCustomerStanding, removeCustomerDropoffBan, setCustomerDropoffBan } from "../services/customer-standing.server";
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

export async function action({ request, params }: Route.ActionArgs) {
  const actor = await requireRole(request, env.trice_auction_db, runtime, "admin");
  const form = await request.formData();
  const customerUserId = Number(params.id);
  const intent = String(form.get("intent") || "");
  const result = intent === "add-private-note"
    ? await addCustomerPrivateNote(env.trice_auction_db, { customerUserId, actor, noteText: String(form.get("noteText") || "") })
    : intent === "ban-customer"
      ? await setCustomerDropoffBan(env.trice_auction_db, { customerUserId, actor, reason: String(form.get("banReason") || "") })
      : intent === "unban-customer"
        ? await removeCustomerDropoffBan(env.trice_auction_db, customerUserId)
        : { ok: false as const, errors: ["Invalid action."] };
  return data(result, { status: result.ok ? 200 : 400 });
}

export default function AdminUserDetail({ loaderData, actionData }: Route.ComponentProps) {
  const { user, standing, privateNotes, appointments } = loaderData;
  return <main className="min-h-screen bg-stone-50 text-stone-900"><div className="mx-auto max-w-3xl px-6 py-12 sm:py-16">
    <Link to="/admin/users" className="text-sm font-semibold text-amber-800">← Back to Users</Link>
    <header className="mt-5 flex flex-wrap items-start justify-between gap-5 border-b border-stone-200 pb-7"><div><p className="text-sm font-semibold tracking-[0.18em] text-amber-700 uppercase">Trice Auctions · Administration</p><h1 className="mt-2 text-4xl font-bold tracking-tight">{user.name}</h1><p className="mt-2 text-stone-600">User details and consignment activity.</p></div><Link to={`/admin/users/${user.id}/edit`} className="rounded-lg bg-stone-900 px-4 py-2.5 text-sm font-semibold text-white">Edit User</Link></header>
    <AdminUserSubnav userId={user.id} activeSection="overview"/>
    {actionData?.ok ? <Notice variant="success">{actionData.message}</Notice> : null}{actionData && !actionData.ok ? <Notice variant="error">{actionData.errors.join(" ")}</Notice> : null}
    <section className="mt-6 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm"><h2 className="text-xl font-bold">User Information</h2><dl className="mt-5 grid gap-5 sm:grid-cols-2"><Detail label="Name" value={user.name}/><Detail label="Email / login email" value={user.email}/><Detail label="Phone" value={user.phone || "Not provided"}/><Detail label="Role" value={user.role}/><Detail label="Consignor Number" value={user.consignorNumber || "Not assigned"}/><Detail label="Account status" value={user.active ? "Active" : "Inactive"}/><Detail label="Created" value={user.createdAt}/></dl></section>
    <section className="mt-6 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="text-xl font-bold">Consignment Appointments</h2><p className="mt-1 text-sm text-stone-600">Appointments belonging to this user.</p></div><Link to={`/admin/users/${user.id}/appointments`} className="rounded-lg border border-stone-300 px-4 py-2 text-sm font-semibold text-stone-800">View Appointments</Link></div><dl className="mt-5 grid gap-4 sm:grid-cols-2"><Detail label="Upcoming Appointments" value={String(appointments.upcoming.length)}/><Detail label="Past Appointments" value={String(appointments.past.length)}/></dl></section>
    <DropOffStatusTools isCustomer={user.role === "customer"} standing={standing}/>
    <InternalNotesTools isCustomer={user.role === "customer"} privateNotes={privateNotes}/>
  </div></main>;
}

function Detail({ label, value }: { label: string; value: string }) { return <div><dt className="text-xs font-bold tracking-wide text-stone-500 uppercase">{label}</dt><dd className="mt-1 whitespace-pre-wrap text-stone-900">{value}</dd></div>; }
function Notice({ variant, children }: { variant: "success" | "error"; children: React.ReactNode }) { return <p className={variant === "success" ? "mt-6 rounded border border-emerald-200 bg-emerald-50 p-4 text-emerald-950" : "mt-6 rounded border border-red-200 bg-red-50 p-4 text-red-950"} role={variant === "success" ? "status" : "alert"}>{children}</p>; }

function DropOffStatusTools({ isCustomer, standing }: { isCustomer: boolean; standing: Awaited<ReturnType<typeof getCustomerStanding>> }) {
  return <section className="mt-6 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm"><h2 className="text-xl font-bold">Drop-Off Status</h2>{!isCustomer ? <p className="mt-2 text-sm text-stone-600">Drop-off restrictions are available for customer/consignor accounts only.</p> : <><p className={`mt-2 font-semibold ${standing?.dropoffBanned ? "text-red-700" : "text-emerald-700"}`}>{standing?.dropoffBanned ? "Banned" : "Eligible"}</p>{standing?.dropoffBanned ? <p className="mt-2 text-sm text-stone-700">Reason: {standing.banReason || "No reason recorded."}{standing.bannedAt ? ` · Recorded ${standing.bannedAt}` : ""}{standing.bannedByName ? ` by ${standing.bannedByName}` : ""}</p> : <p className="mt-2 text-sm text-stone-600">This customer may schedule drop-offs.</p>}{standing?.dropoffBanned ? <ConfirmationForm method="post" className="mt-4" confirmation={{ title: "Allow customer to schedule again?", description: "This removes the customer’s drop-off ban.", confirmLabel: "Save Status", destructive: true }}><input type="hidden" name="intent" value="unban-customer"/><button className="rounded-lg border border-red-300 px-4 py-2.5 text-sm font-semibold text-red-700">Save Status: Allow Drop-Offs</button></ConfirmationForm> : <ConfirmationForm method="post" className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]" confirmation={{ title: "Ban customer from drop-offs?", description: "They can still sign in and view their account, but cannot schedule new drop-offs.", confirmLabel: "Save Status", destructive: true }}><input type="hidden" name="intent" value="ban-customer"/><label className="text-sm font-semibold">Ban reason<input required name="banReason" className="mt-1 block w-full rounded-lg border border-stone-300 p-2 font-normal"/></label><button className="self-end rounded-lg bg-red-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-800">Save Status: Ban Drop-Offs</button></ConfirmationForm>}</>}</section>;
}

function InternalNotesTools({ isCustomer, privateNotes }: { isCustomer: boolean; privateNotes: ReadonlyArray<Awaited<ReturnType<typeof getCustomerPrivateNotes>>[number]> }) {
  return <section className="mt-6 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm"><h2 className="text-xl font-bold">Internal Notes</h2>{!isCustomer ? <p className="mt-2 text-sm text-stone-600">Internal customer notes are available for customer/consignor accounts only.</p> : <><p className="mt-1 text-sm text-stone-600">Not visible to the customer.</p><Form method="post" className="mt-4 flex flex-col gap-3"><input type="hidden" name="intent" value="add-private-note"/><textarea required name="noteText" className="min-h-24 rounded-lg border border-stone-300 p-3" placeholder="Add a private customer note"/><button className="self-start rounded-lg bg-stone-900 px-4 py-2.5 text-sm font-semibold text-white">Add Note</button></Form>{privateNotes.length ? <ol className="mt-5 divide-y divide-stone-200">{privateNotes.map((note) => <li key={note.id} className="py-3"><p className="whitespace-pre-wrap text-sm">{note.noteText}</p><p className="mt-1 text-xs text-stone-500">{note.authorName} · {note.createdAt}</p></li>)}</ol> : <p className="mt-5 text-sm text-stone-600">No private notes have been added.</p>}</>}</section>;
}
