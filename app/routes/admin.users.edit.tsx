import { env } from "cloudflare:workers";
import { data, Form, Link, redirect } from "react-router";
import type { Route } from "./+types/admin.users.edit";
import { requireRole } from "../services/auth.server";
import { getManagedUser, updateManagedUser } from "../services/user-management.server";
import { ConfirmationForm } from "../components/confirmation-form";

const runtime = env as unknown as { AUTH_SECRET?: string; BETTER_AUTH_URL?: string };
const ROLE_OPTIONS = ["customer", "employee", "manager", "admin"] as const;

export async function loader({ request, params }: Route.LoaderArgs) {
  await requireRole(request, env.trice_auction_db, runtime, "admin");
  const user = await getManagedUser(env.trice_auction_db, Number(params.id));
  if (!user) throw new Response("Not Found", { status: 404 });
  return { user, saved: new URL(request.url).searchParams.get("saved") === "1" };
}

export async function action({ request, params }: Route.ActionArgs) {
  const actor = await requireRole(request, env.trice_auction_db, runtime, "admin");
  const form = await request.formData();
  const result = await updateManagedUser(env.trice_auction_db, {
    actorUserId: actor.id,
    targetUserId: Number(params.id),
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
  const { user } = loaderData;
  const values = actionData && "values" in actionData ? actionData.values : null;
  return <main className="min-h-screen bg-stone-50 text-stone-900"><div className="mx-auto max-w-3xl px-6 py-12 sm:py-16"><Link to="/admin/users" className="text-sm font-semibold text-amber-800">← Back to Users</Link><header className="mt-5 border-b border-stone-200 pb-7"><p className="text-sm font-semibold tracking-[0.18em] text-amber-700 uppercase">Trice Auctions · Administration</p><h1 className="mt-2 text-4xl font-bold tracking-tight">Edit User</h1><p className="mt-2 text-stone-600">Update account details, access, and the linked login email.</p></header>{loaderData.saved ? <Notice variant="success">User details saved.</Notice> : null}{actionData && !actionData.ok ? <Notice variant="error">{actionData.errors.join(" ")}</Notice> : null}<ConfirmationForm method="post" className="mt-6 grid gap-5 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm sm:grid-cols-2" confirmation={{ title: "Deactivate user account?", description: "Are you sure you want to deactivate this user? They will no longer be able to sign in.", confirmLabel: "Deactivate user", destructive: true }} confirmationForSubmission={(formData) => user.active && !formData.has("active") ? { title: "Deactivate user account?", description: "Are you sure you want to deactivate this user? They will no longer be able to sign in.", confirmLabel: "Deactivate user", destructive: true } : null}><label className="text-sm font-semibold">First name<input required name="firstName" defaultValue={String(values?.firstName ?? user.firstName ?? "")} className="mt-2 block w-full rounded border border-stone-300 p-2 font-normal"/></label><label className="text-sm font-semibold">Last name<input required name="lastName" defaultValue={String(values?.lastName ?? user.lastName ?? "")} className="mt-2 block w-full rounded border border-stone-300 p-2 font-normal"/></label><label className="text-sm font-semibold sm:col-span-2">Email / login email<input required type="email" name="email" defaultValue={String(values?.email ?? user.email)} className="mt-2 block w-full rounded border border-stone-300 p-2 font-normal"/></label><label className="text-sm font-semibold">Phone<input name="phone" defaultValue={String(values?.phone ?? user.phone ?? "")} className="mt-2 block w-full rounded border border-stone-300 p-2 font-normal"/></label><label className="text-sm font-semibold">Role<select name="role" defaultValue={String(values?.role ?? user.role)} className="mt-2 block w-full rounded border border-stone-300 bg-white p-2 font-normal">{ROLE_OPTIONS.map((role) => <option key={role} value={role}>{role}</option>)}</select></label><label className="text-sm font-semibold sm:col-span-2"><input type="checkbox" name="active" value="true" defaultChecked={String(values?.active ?? user.active) === "true"}/> Active account</label><div className="flex flex-wrap gap-3 sm:col-span-2"><button className="rounded-lg bg-stone-900 px-4 py-2.5 text-sm font-semibold text-white">Save changes</button><Link to="/admin/users" className="rounded-lg border border-stone-300 px-4 py-2.5 text-sm font-semibold">Cancel</Link></div></ConfirmationForm></div></main>;
}

function Notice({ variant, children }: { variant: "success" | "error"; children: React.ReactNode }) { return <p className={variant === "success" ? "mt-6 rounded border border-emerald-200 bg-emerald-50 p-4 text-emerald-950" : "mt-6 rounded border border-red-200 bg-red-50 p-4 text-red-950"} role={variant === "success" ? "status" : "alert"}>{children}</p>; }
