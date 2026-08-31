import { env } from "cloudflare:workers";
import { data, Form } from "react-router";
import { useEffect, useRef, useState } from "react";

import type { Route } from "./+types/profile";
import { getAuth, requireUser } from "../services/auth.server";
import { getUserProfile, profileInputFromForm, updateUserProfile } from "../services/profile-management.server";

const runtime = env as unknown as { AUTH_SECRET?: string; BETTER_AUTH_URL?: string };

export function meta({}: Route.MetaArgs) {
  return [{ title: "My Profile | Trice Auctions" }, { name: "description", content: "Manage your Trice Auctions account profile." }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireUser(request, env.trice_auction_db, runtime);
  const profile = await getUserProfile(env.trice_auction_db, user.id);
  if (!profile) throw new Response("Not Found", { status: 404 });
  return { profile };
}

export async function action({ request }: Route.ActionArgs) {
  const user = await requireUser(request, env.trice_auction_db, runtime);
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");

  if (intent === "save-profile") {
    const values = profileInputFromForm(form);
    if (values.email !== user.email.toLowerCase()) {
      const verification = await getAuth(env.trice_auction_db, runtime).handler(new Request(
        new URL("/api/auth/verify-password", request.url),
        { method: "POST", headers: { "content-type": "application/json", origin: new URL(request.url).origin, cookie: request.headers.get("cookie") || "" }, body: JSON.stringify({ password: String(form.get("currentPassword") || "") }) },
      ));
      if (!verification.ok) {
        return data({ ok: false as const, errors: ["Enter your current password to change your login email."], values }, { status: 400 });
      }
    }
    const result = await updateUserProfile(env.trice_auction_db, values, user);
    return data({ ...result, values }, { status: result.ok ? 200 : 400 });
  }

  if (intent === "change-password") {
    const newPassword = String(form.get("newPassword") || "");
    const confirmNewPassword = String(form.get("confirmNewPassword") || "");
    if (newPassword !== confirmNewPassword) {
      return data({ ok: false as const, passwordError: "The new passwords do not match." }, { status: 400 });
    }
    const response = await getAuth(env.trice_auction_db, runtime).handler(new Request(
      new URL("/api/auth/change-password", request.url),
      { method: "POST", headers: { "content-type": "application/json", origin: new URL(request.url).origin, cookie: request.headers.get("cookie") || "" }, body: JSON.stringify({ currentPassword: String(form.get("currentPassword") || ""), newPassword, revokeOtherSessions: true }) },
    ));
    if (!response.ok) return data({ ok: false as const, passwordError: "Password could not be changed. Check your current password and choose at least 8 characters." }, { status: 400 });
    return data({ ok: true as const, passwordMessage: "Your password has been changed. Other sessions have been signed out." }, { headers: response.headers });
  }

  return data({ ok: false as const, errors: ["Unknown profile action."] }, { status: 400 });
}

export default function Profile({ loaderData, actionData }: Route.ComponentProps) {
  const values = actionData && "values" in actionData ? actionData.values : loaderData.profile;
  const primary = values.addresses.primary;
  const secondary = values.addresses.secondary;
  const passwordFormRef = useRef<HTMLFormElement>(null);
  const [passwordConfirmationError, setPasswordConfirmationError] = useState<string | null>(null);

  useEffect(() => {
    if (actionData && "passwordMessage" in actionData) passwordFormRef.current?.reset();
  }, [actionData]);

  return <main className="min-h-screen bg-stone-50 text-stone-900"><div className="mx-auto max-w-4xl px-6 py-12 sm:py-16">
    <header className="border-b border-stone-200 pb-8"><p className="text-sm font-semibold tracking-[0.18em] text-amber-700 uppercase">Trice Auctions</p><h1 className="mt-2 text-4xl font-bold tracking-tight text-stone-950">My Profile</h1><p className="mt-3 max-w-2xl text-stone-600">Manage your account details, addresses, and sign-in security.</p></header>
    {actionData?.ok && "message" in actionData ? <Notice variant="success">{actionData.message}</Notice> : null}
    {actionData && !actionData.ok && "errors" in actionData ? <Notice variant="error">{actionData.errors.join(" ")}</Notice> : null}
    <Form method="post" className="mt-8 space-y-8"><input type="hidden" name="intent" value="save-profile" />
      <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm"><h2 className="text-2xl font-semibold text-stone-950">Personal Information</h2><div className="mt-5 grid gap-5 sm:grid-cols-2"><Field label="First name" name="firstName" value={values.firstName} required/><Field label="Last name" name="lastName" value={values.lastName} required/><Field label="Email / login email" name="email" type="email" value={values.email} required className="sm:col-span-2"/><Field label="Phone number" name="phone" type="tel" value={values.phone} className="sm:col-span-2"/><Field label="Current password (required to change email)" name="currentPassword" type="password" autoComplete="current-password" className="sm:col-span-2"/></div></section>
      <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm"><h2 className="text-2xl font-semibold text-stone-950">Addresses</h2><p className="mt-2 text-sm text-stone-600">Add a primary address and, if needed, a secondary address. You can leave either address blank.</p><AddressFields heading="Primary address" prefix="primary" address={primary}/><AddressFields heading="Secondary address" prefix="secondary" address={secondary}/></section>
      <div className="flex flex-wrap gap-3"><button className="rounded-lg bg-stone-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-amber-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600 focus-visible:ring-offset-2">Save profile</button><a href="/profile" className="rounded-lg border border-stone-300 px-5 py-2.5 text-sm font-semibold text-stone-800">Cancel</a></div>
    </Form>
    <section className="mt-10 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm" aria-labelledby="security-heading"><h2 id="security-heading" className="text-2xl font-semibold text-stone-950">Security</h2><p className="mt-2 text-sm text-stone-600">Changing your password signs out your other sessions.</p>{actionData && "passwordMessage" in actionData ? <Notice variant="success">{actionData.passwordMessage}</Notice> : null}{passwordConfirmationError ? <Notice variant="error">{passwordConfirmationError}</Notice> : null}{actionData && "passwordError" in actionData ? <Notice variant="error">{actionData.passwordError}</Notice> : null}<Form ref={passwordFormRef} method="post" className="mt-5 grid gap-5 sm:grid-cols-2" onSubmit={(event) => { const form = new FormData(event.currentTarget); if (form.get("newPassword") !== form.get("confirmNewPassword")) { event.preventDefault(); setPasswordConfirmationError("The new passwords do not match."); } else setPasswordConfirmationError(null); }}><input type="hidden" name="intent" value="change-password"/><Field label="Current password" name="currentPassword" type="password" autoComplete="current-password" required className="sm:col-span-2"/><Field label="New password" name="newPassword" type="password" autoComplete="new-password" minLength={8} required/><Field label="Confirm new password" name="confirmNewPassword" type="password" autoComplete="new-password" minLength={8} required/><div className="sm:col-span-2"><button className="rounded-lg bg-stone-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-amber-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600 focus-visible:ring-offset-2">Change password</button></div></Form></section>
  </div></main>;
}

function AddressFields({ heading, prefix, address }: { heading: string; prefix: "primary" | "secondary"; address?: { addressLine1: string; addressLine2: string; city: string; state: string; postalCode: string } }) {
  return <fieldset className="mt-6 border-t border-stone-200 pt-6"><legend className="text-lg font-semibold text-stone-950">{heading}</legend><div className="mt-4 grid gap-5 sm:grid-cols-2"><Field label="Address line 1" name={`${prefix}AddressLine1`} value={address?.addressLine1} className="sm:col-span-2"/><Field label="Address line 2" name={`${prefix}AddressLine2`} value={address?.addressLine2} className="sm:col-span-2"/><Field label="City" name={`${prefix}City`} value={address?.city}/><Field label="State" name={`${prefix}State`} value={address?.state}/><Field label="ZIP / postal code" name={`${prefix}PostalCode`} value={address?.postalCode}/></div></fieldset>;
}

function Field({ label, name, value, type = "text", required, className, autoComplete, minLength }: { label: string; name: string; value?: string; type?: string; required?: boolean; className?: string; autoComplete?: string; minLength?: number }) {
  return <label className={`block text-sm font-semibold text-stone-800 ${className ?? ""}`}>{label}<input required={required} name={name} type={type} defaultValue={value} autoComplete={autoComplete} minLength={minLength} className="mt-2 block w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 font-normal outline-none focus:border-amber-600 focus:ring-2 focus:ring-amber-100"/></label>;
}

function Notice({ variant, children }: { variant: "success" | "error"; children: React.ReactNode }) {
  return <p className={`mt-6 rounded-xl border p-4 text-sm ${variant === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-950" : "border-red-200 bg-red-50 text-red-950"}`} role={variant === "success" ? "status" : "alert"}>{children}</p>;
}
