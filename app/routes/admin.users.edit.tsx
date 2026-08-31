import { env } from "cloudflare:workers";
import { data, Form, Link, redirect } from "react-router";
import type { Route } from "./+types/admin.users.edit";
import { requireRole } from "../services/auth.server";
import { getManagedUser, updateManagedUser } from "../services/user-management.server";
import { ConfirmationForm } from "../components/confirmation-form";
import { addCustomerPrivateNote, getCustomerAppointmentHistory, getCustomerPrivateNotes, getCustomerStanding, removeCustomerDropoffBan, setCustomerDropoffBan } from "../services/customer-standing.server";

const runtime = env as unknown as { AUTH_SECRET?: string; BETTER_AUTH_URL?: string };
const ROLE_OPTIONS = ["customer", "employee", "manager", "admin"] as const;

export async function loader({ request, params }: Route.LoaderArgs) {
  await requireRole(request, env.trice_auction_db, runtime, "admin");
  const user = await getManagedUser(env.trice_auction_db, Number(params.id));
  if (!user) throw new Response("Not Found", { status: 404 });
  const customerData = user.role === "customer" ? await Promise.all([
    getCustomerStanding(env.trice_auction_db, user.id),
    getCustomerPrivateNotes(env.trice_auction_db, user.id),
    getCustomerAppointmentHistory(env.trice_auction_db, user.id),
  ]) : [null, [], []] as const;
  return { user, saved: new URL(request.url).searchParams.get("saved") === "1", standing: customerData[0], privateNotes: customerData[1], appointmentHistory: customerData[2] };
}

export async function action({ request, params }: Route.ActionArgs) {
  const actor = await requireRole(request, env.trice_auction_db, runtime, "admin");
  const form = await request.formData();
  const intent = String(form.get("intent") || "update-user");
  const targetUserId = Number(params.id);
  if (intent === "add-private-note") {
    const result = await addCustomerPrivateNote(env.trice_auction_db, { customerUserId: targetUserId, actor, noteText: String(form.get("noteText") || "") });
    return data(result, { status: result.ok ? 200 : 400 });
  }
  if (intent === "ban-customer") {
    const result = await setCustomerDropoffBan(env.trice_auction_db, { customerUserId: targetUserId, actor, reason: String(form.get("banReason") || "") });
    return data(result, { status: result.ok ? 200 : 400 });
  }
  if (intent === "unban-customer") {
    const result = await removeCustomerDropoffBan(env.trice_auction_db, targetUserId);
    return data(result, { status: result.ok ? 200 : 400 });
  }
  if (intent !== "update-user") return data({ ok: false, errors: ["Invalid action."] }, { status: 400 });
  const result = await updateManagedUser(env.trice_auction_db, {
    actorUserId: actor.id,
    targetUserId,
    firstName: String(form.get("firstName") || ""),
    lastName: String(form.get("lastName") || ""),
    email: String(form.get("email") || ""),
    phone: String(form.get("phone") || ""),
    role: String(form.get("role") || ""),
    active: form.has("active"),
  });
  if (!result.ok) return data({ ...result, values: Object.fromEntries(form) }, { status: 400 });
  return redirect(`/admin/users/${params.id}/edit?saved=1`);
}

export default function EditUser({ loaderData, actionData }: Route.ComponentProps) {
  const { user, standing, privateNotes, appointmentHistory } = loaderData;
  const values: Record<string, string> | null = actionData && "values" in actionData ? actionData.values as Record<string, string> : null;
  const success = actionData && "message" in actionData ? actionData.message : null;
  const errors = actionData && "errors" in actionData ? actionData.errors ?? [] : [];
  return <main className="min-h-screen bg-stone-50 text-stone-900"><div className="mx-auto max-w-3xl px-6 py-12 sm:py-16"><Link to="/admin/users" className="text-sm font-semibold text-amber-800">← Back to Users</Link><header className="mt-5 border-b border-stone-200 pb-7"><p className="text-sm font-semibold tracking-[0.18em] text-amber-700 uppercase">Trice Auctions · Administration</p><h1 className="mt-2 text-4xl font-bold tracking-tight">Edit User</h1><p className="mt-2 text-stone-600">Update account details, access, and the linked login email.</p></header>{loaderData.saved ? <Notice variant="success">User details saved.</Notice> : null}{success ? <Notice variant="success">{success}</Notice> : null}{errors.length ? <Notice variant="error">{errors.join(" ")}</Notice> : null}
    <ConfirmationForm method="post" className="mt-6 grid gap-5 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm sm:grid-cols-2" confirmation={{ title: "Deactivate user account?", description: "Are you sure you want to deactivate this user? They will no longer be able to sign in.", confirmLabel: "Deactivate user", destructive: true }} confirmationForSubmission={(formData) => user.active && !formData.has("active") ? { title: "Deactivate user account?", description: "Are you sure you want to deactivate this user? They will no longer be able to sign in.", confirmLabel: "Deactivate user", destructive: true } : null}><input type="hidden" name="intent" value="update-user"/><label className="text-sm font-semibold">First name<input required name="firstName" defaultValue={String(values?.firstName ?? user.firstName ?? "")} className="mt-2 block w-full rounded border border-stone-300 p-2 font-normal"/></label><label className="text-sm font-semibold">Last name<input required name="lastName" defaultValue={String(values?.lastName ?? user.lastName ?? "")} className="mt-2 block w-full rounded border border-stone-300 p-2 font-normal"/></label><label className="text-sm font-semibold sm:col-span-2">Email / login email<input required type="email" name="email" defaultValue={String(values?.email ?? user.email)} className="mt-2 block w-full rounded border border-stone-300 p-2 font-normal"/></label><label className="text-sm font-semibold">Phone<input name="phone" defaultValue={String(values?.phone ?? user.phone ?? "")} className="mt-2 block w-full rounded border border-stone-300 p-2 font-normal"/></label><label className="text-sm font-semibold">Role<select name="role" defaultValue={String(values?.role ?? user.role)} className="mt-2 block w-full rounded border border-stone-300 bg-white p-2 font-normal">{ROLE_OPTIONS.map((role) => <option key={role} value={role}>{role}</option>)}</select></label><label className="text-sm font-semibold sm:col-span-2"><input type="checkbox" name="active" value="true" defaultChecked={String(values?.active ?? user.active) === "true"}/> Active account</label><div className="flex flex-wrap gap-3 sm:col-span-2"><button className="rounded-lg bg-stone-900 px-4 py-2.5 text-sm font-semibold text-white">Save changes</button><Link to="/admin/users" className="rounded-lg border border-stone-300 px-4 py-2.5 text-sm font-semibold">Cancel</Link></div></ConfirmationForm>
    {user.role === "customer" ? <CustomerManagement standing={standing} privateNotes={privateNotes} appointmentHistory={appointmentHistory}/> : null}
  </div></main>;
}

function CustomerManagement({ standing, privateNotes, appointmentHistory }: { standing: Awaited<ReturnType<typeof getCustomerStanding>>; privateNotes: ReadonlyArray<Awaited<ReturnType<typeof getCustomerPrivateNotes>>[number]>; appointmentHistory: ReadonlyArray<Awaited<ReturnType<typeof getCustomerAppointmentHistory>>[number]> }) { return <><section className="mt-6 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm"><h2 className="text-xl font-bold">Drop-Off Status</h2><p className="mt-2 font-semibold"><span className={standing?.dropoffBanned ? "text-red-700" : "text-emerald-700"}>{standing?.dropoffBanned ? "Banned" : "Eligible"}</span></p>{standing?.dropoffBanned ? <p className="mt-2 text-sm text-stone-700">Reason: {standing.banReason || "No reason recorded."}{standing.bannedAt ? ` · Recorded ${standing.bannedAt}` : ""}{standing.bannedByName ? ` by ${standing.bannedByName}` : ""}</p> : <p className="mt-2 text-sm text-stone-600">This customer may schedule drop-offs.</p>}{standing?.dropoffBanned ? <ConfirmationForm method="post" className="mt-4" confirmation={{ title: "Allow customer to schedule again?", description: "This removes the customer’s drop-off ban.", confirmLabel: "Unban customer", destructive: true }}><input type="hidden" name="intent" value="unban-customer"/><button className="rounded-lg border border-red-300 px-4 py-2.5 text-sm font-semibold text-red-700">Remove drop-off ban</button></ConfirmationForm> : <ConfirmationForm method="post" className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]" confirmation={{ title: "Ban customer from drop-offs?", description: "They can still sign in and view their account, but cannot schedule new drop-offs.", confirmLabel: "Ban customer", destructive: true }}><input type="hidden" name="intent" value="ban-customer"/><label className="text-sm font-semibold">Ban reason<input required name="banReason" className="mt-1 block w-full rounded-lg border border-stone-300 p-2 font-normal"/></label><button className="self-end rounded-lg bg-red-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-800">Ban customer</button></ConfirmationForm>}</section><section className="mt-6 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm"><h2 className="text-xl font-bold">Internal Notes — Not visible to customer</h2><Form method="post" className="mt-4 flex flex-col gap-3"><input type="hidden" name="intent" value="add-private-note"/><textarea required name="noteText" className="min-h-24 rounded-lg border border-stone-300 p-3" placeholder="Add a private customer note"/><button className="self-start rounded-lg bg-stone-900 px-4 py-2.5 text-sm font-semibold text-white">Add private note</button></Form>{privateNotes.length ? <ol className="mt-5 divide-y divide-stone-200">{privateNotes.map((note) => <li key={note.id} className="py-3"><p className="whitespace-pre-wrap text-sm">{note.noteText}</p><p className="mt-1 text-xs text-stone-500">{note.authorName} · {note.createdAt}</p></li>)}</ol> : <p className="mt-5 text-sm text-stone-600">No private notes have been added.</p>}</section><section className="mt-6 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm"><h2 className="text-xl font-bold">Appointment history</h2>{appointmentHistory.length ? <ul className="mt-3 divide-y divide-stone-200">{appointmentHistory.map((item) => <li key={item.id} className="py-3 text-sm"><span className="font-semibold">{item.appointmentDate}</span> · {item.appointmentTime || "Time TBD"} · {item.loadType} · <span className="capitalize">{item.status.replace("_", " ")}</span></li>)}</ul> : <p className="mt-3 text-sm text-stone-600">No appointment history.</p>}</section></>; }
function Notice({ variant, children }: { variant: "success" | "error"; children: React.ReactNode }) { return <p className={variant === "success" ? "mt-6 rounded border border-emerald-200 bg-emerald-50 p-4 text-emerald-950" : "mt-6 rounded border border-red-200 bg-red-50 p-4 text-red-950"} role={variant === "success" ? "status" : "alert"}>{children}</p>; }
