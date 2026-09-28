import { env } from "cloudflare:workers";
import { data, Form, Link, redirect, useFetcher } from "react-router";
import { useEffect, useId, useRef, useState } from "react";
import type { Route } from "./+types/admin.users.edit";
import { getAuth, requireRole } from "../services/auth.server";
import { getManagedUser, setManagedUserActive, updateManagedUser } from "../services/user-management.server";
import { ROLES } from "../lib/roles";
import { ConfirmationForm } from "../components/confirmation-form";
import { ADMIN_USER_EDIT_INTENT, getAdminUserEditOperation } from "../lib/admin-user-edit-intents";
import { AdminUserSubnav } from "../components/admin-user-subnav";
import { resetManagedUserPassword } from "../services/user-password-reset.server";
import { REGISTRATION_PASSWORD_MIN_LENGTH } from "../lib/registration-password-validation.js";

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
  if (operation === "reset-password") {
    const auth = getAuth(env.trice_auction_db, runtime);
    const session = await auth.api.getSession({ headers: request.headers });
    const result = await resetManagedUserPassword(env.trice_auction_db, auth, {
      actorUserId: actor.id,
      targetUserId,
      newPassword: String(form.get("newPassword") || ""),
      confirmNewPassword: String(form.get("confirmNewPassword") || ""),
      requirePasswordChange: form.get("requirePasswordChange") === "on",
      currentActorSessionToken: session?.session.token,
    });
    return data(result, { status: result.ok ? 200 : 400 });
  }
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
    <PasswordResetSection userName={user.name}/>
  </div></main>;
}
function Notice({ variant, children }: { variant: "success" | "error"; children: React.ReactNode }) { return <p className={variant === "success" ? "mt-6 rounded border border-emerald-200 bg-emerald-50 p-4 text-emerald-950" : "mt-6 rounded border border-red-200 bg-red-50 p-4 text-red-950"} role={variant === "success" ? "status" : "alert"}>{children}</p>; }

function PasswordResetSection({ userName }: { userName: string }) {
  const fetcher = useFetcher<{ ok: boolean; message?: string; errors?: string[] }>();
  const dialogRef = useRef<HTMLElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const [open, setOpen] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [clientError, setClientError] = useState<string | null>(null);
  const submitted = fetcher.state !== "idle";
  const serverError = fetcher.data && !fetcher.data.ok ? fetcher.data.errors?.join(" ") : null;

  useEffect(() => {
    if (fetcher.data?.ok) setOpen(false);
  }, [fetcher.data]);
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape" && !submitted) setOpen(false); };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, submitted]);

  return <section className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-6"><h2 className="text-xl font-bold">Password Reset</h2><p className="mt-2 text-sm text-stone-700">Set a new password for this user and revoke their existing sessions.</p>{fetcher.data?.ok ? <p className="mt-4 rounded border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-950" role="status">{fetcher.data.message}</p> : null}<button type="button" className="mt-4 rounded-lg bg-stone-900 px-4 py-2.5 text-sm font-semibold text-white" onClick={() => { setClientError(null); setOpen(true); }}>Reset Password</button>
    {open ? <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-stone-950/40 p-4" role="presentation"><section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId} className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"><h2 id={titleId} className="text-xl font-bold text-stone-950">Reset password for {userName}?</h2><p id={descriptionId} className="mt-3 text-sm text-stone-700">This changes the user’s password and signs them out of their other active sessions.</p>{clientError || serverError ? <p className="mt-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-950" role="alert">{clientError || serverError}</p> : null}<fetcher.Form method="post" className="mt-5 grid gap-4" onSubmit={(event) => { const form = new FormData(event.currentTarget); const password = String(form.get("newPassword") || ""); const confirmation = String(form.get("confirmNewPassword") || ""); if (password.length < REGISTRATION_PASSWORD_MIN_LENGTH) { event.preventDefault(); setClientError(`Passwords must each be at least ${REGISTRATION_PASSWORD_MIN_LENGTH} characters.`); return; } if (password !== confirmation) { event.preventDefault(); setClientError("The new passwords do not match."); return; } setClientError(null); }}><input type="hidden" name="intent" value={ADMIN_USER_EDIT_INTENT.resetPassword}/><label className="text-sm font-semibold">New Password<input required minLength={REGISTRATION_PASSWORD_MIN_LENGTH} type={showPassword ? "text" : "password"} name="newPassword" autoComplete="new-password" className="mt-2 block w-full rounded border border-stone-300 p-2 font-normal"/></label><label className="text-sm font-semibold">Confirm New Password<input required minLength={REGISTRATION_PASSWORD_MIN_LENGTH} type={showPassword ? "text" : "password"} name="confirmNewPassword" autoComplete="new-password" className="mt-2 block w-full rounded border border-stone-300 p-2 font-normal"/></label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={showPassword} onChange={(event) => setShowPassword(event.target.checked)}/>Show passwords</label><label className="flex items-center gap-2 text-sm"><input type="checkbox" name="requirePasswordChange"/>Require user to change password at next login</label><div className="mt-2 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><button type="button" disabled={submitted} onClick={() => setOpen(false)} className="rounded-lg border border-stone-300 px-4 py-2.5 font-semibold text-stone-800">Cancel</button><button disabled={submitted} className="rounded-lg bg-red-700 px-4 py-2.5 font-semibold text-white hover:bg-red-800 disabled:opacity-60">{submitted ? "Resetting…" : "Confirm Password Reset"}</button></div></fetcher.Form></section></div> : null}
  </section>;
}
