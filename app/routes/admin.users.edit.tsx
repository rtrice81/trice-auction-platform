import { env } from "cloudflare:workers";
import { data, Form, Link, redirect } from "react-router";
import type { Route } from "./+types/admin.users.edit";
import { requireRole } from "../services/auth.server";
import { getManagedUser, setManagedUserActive, updateManagedUser } from "../services/user-management.server";
import { ROLES } from "../lib/roles";
import { ConfirmationForm } from "../components/confirmation-form";
import { ADMIN_USER_EDIT_INTENT, getAdminUserEditOperation } from "../lib/admin-user-edit-intents";
import { AdminUserSubnav } from "../components/admin-user-subnav";

const runtime = env as unknown as { AUTH_SECRET?: string; BETTER_AUTH_URL?: string };

export async function loader({ request, params }: Route.LoaderArgs) {
  await requireRole(request, env.trice_auction_db, runtime, "admin");
  const user = await getManagedUser(env.trice_auction_db, Number(params.id));
  if (!user) throw new Response("Not Found", { status: 404 });
  return { user, saved: new URL(request.url).searchParams.get("saved") === "1" };
}

export async function action({ request, params }: Route.ActionArgs) {
  const actor = await requireRole(request, env.trice_auction_db, runtime, "admin");
  const form = await request.formData();
  const intent = String(form.get("intent") || "");
  const targetUserId = Number(params.id);
  const operation = getAdminUserEditOperation(intent);
  if (!operation) return data({ ok: false, errors: ["Invalid action."] }, { status: 400 });
  if (operation === "deactivate" || operation === "activate") {
    const result = await setManagedUserActive(env.trice_auction_db, { targetUserId, active: operation === "activate" });
    return data(result, { status: result.ok ? 200 : 400 });
  }
  const result = await updateManagedUser(env.trice_auction_db, {
    actorUserId: actor.id,
    targetUserId,
    firstName: String(form.get("firstName") || ""),
    lastName: String(form.get("lastName") || ""),
    email: String(form.get("email") || ""),
    phone: String(form.get("phone") || ""),
    consignorNumber: String(form.get("consignorNumber") || ""),
    roles: form.getAll("roles").map(String),
  });
  if (!result.ok) return data({ ...result, values: Object.fromEntries(form) }, { status: 400 });
  return redirect(`/admin/users/${params.id}/edit?saved=1`);
}

export default function EditUser({ loaderData, actionData }: Route.ComponentProps) {
  const { user } = loaderData;
  const values: Record<string, string> | null = actionData && "values" in actionData ? actionData.values as Record<string, string> : null;
  const success = actionData && "message" in actionData ? actionData.message : null;
  const errors = actionData && "errors" in actionData ? actionData.errors ?? [] : [];
  return <main className="min-h-screen bg-stone-50 text-stone-900"><div className="mx-auto max-w-3xl px-6 py-12 sm:py-16"><Link to="/admin/users" className="text-sm font-semibold text-amber-800">← Back to Users</Link><header className="mt-5 border-b border-stone-200 pb-7"><p className="text-sm font-semibold tracking-[0.18em] text-amber-700 uppercase">Trice Auctions · Administration</p><h1 className="mt-2 text-4xl font-bold tracking-tight">Edit User</h1><p className="mt-2 text-stone-600">Update account details, access, and the linked login email.</p></header>{loaderData.saved ? <Notice variant="success">User details saved.</Notice> : null}{success ? <Notice variant="success">{success}</Notice> : null}{errors.length ? <Notice variant="error">{errors.join(" ")}</Notice> : null}
    <AdminUserSubnav userId={user.id} activeSection="overview"/>
    <Form method="post" className="mt-6 grid gap-5 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm sm:grid-cols-2"><input type="hidden" name="intent" value={ADMIN_USER_EDIT_INTENT.save}/><label className="text-sm font-semibold">First name<input required name="firstName" defaultValue={String(values?.firstName ?? user.firstName ?? "")} className="mt-2 block w-full rounded border border-stone-300 p-2 font-normal"/></label><label className="text-sm font-semibold">Last name<input required name="lastName" defaultValue={String(values?.lastName ?? user.lastName ?? "")} className="mt-2 block w-full rounded border border-stone-300 p-2 font-normal"/></label><label className="text-sm font-semibold sm:col-span-2">Email / login email<input required type="email" name="email" defaultValue={String(values?.email ?? user.email)} className="mt-2 block w-full rounded border border-stone-300 p-2 font-normal"/></label><label className="text-sm font-semibold">Phone<input name="phone" defaultValue={String(values?.phone ?? user.phone ?? "")} className="mt-2 block w-full rounded border border-stone-300 p-2 font-normal"/></label><fieldset className="sm:col-span-2"><legend className="text-sm font-semibold">Roles</legend><div className="mt-2 grid gap-2 sm:grid-cols-2">{ROLES.map((role) => <label key={role} className="flex items-center gap-2 rounded border border-stone-200 p-2 font-normal capitalize"><input type="checkbox" name="roles" value={role} defaultChecked={user.roles.includes(role)}/>{role}</label>)}</div></fieldset><label className="text-sm font-semibold sm:col-span-2">Consignor Number<input name="consignorNumber" defaultValue={String(values?.consignorNumber ?? user.consignorNumber ?? "")} className="mt-2 block w-full rounded border border-stone-300 p-2 font-normal"/><span className="mt-1 block font-normal text-stone-600">Optional internal number used to match this user with the main bidding platform.</span></label><p className="text-sm font-semibold sm:col-span-2">Account status <span className={user.active ? "font-normal text-emerald-700" : "font-normal text-stone-600"}>{user.active ? "Active" : "Inactive"}</span></p><div className="flex flex-wrap gap-3 sm:col-span-2"><button className="rounded-lg bg-stone-900 px-4 py-2.5 text-sm font-semibold text-white">Save changes</button><Link to="/admin/users" className="rounded-lg border border-stone-300 px-4 py-2.5 text-sm font-semibold">Cancel</Link></div></Form>
    <ConfirmationForm method="post" className="mt-4" confirmation={user.active ? { title: "Deactivate user account?", description: "Are you sure you want to deactivate this user? They will no longer be able to sign in.", confirmLabel: "Deactivate user", destructive: true } : { title: "Activate user account?", description: "Are you sure you want to reactivate this user?", confirmLabel: "Activate user" }}><input type="hidden" name="intent" value={user.active ? ADMIN_USER_EDIT_INTENT.deactivate : ADMIN_USER_EDIT_INTENT.activate}/><button className={user.active ? "rounded-lg border border-red-300 px-4 py-2.5 text-sm font-semibold text-red-700" : "rounded-lg border border-emerald-300 px-4 py-2.5 text-sm font-semibold text-emerald-800"}>{user.active ? "Deactivate user" : "Activate user"}</button></ConfirmationForm>
  </div></main>;
}
function Notice({ variant, children }: { variant: "success" | "error"; children: React.ReactNode }) { return <p className={variant === "success" ? "mt-6 rounded border border-emerald-200 bg-emerald-50 p-4 text-emerald-950" : "mt-6 rounded border border-red-200 bg-red-50 p-4 text-red-950"} role={variant === "success" ? "status" : "alert"}>{children}</p>; }
