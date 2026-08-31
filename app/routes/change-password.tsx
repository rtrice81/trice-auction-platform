import { env } from "cloudflare:workers";
import { data, Form, redirect } from "react-router";
import { useState } from "react";
import type { Route } from "./+types/change-password";
import { getAuth, getCurrentUser } from "../services/auth.server";

const runtime = env as unknown as { AUTH_SECRET?: string; BETTER_AUTH_URL?: string };

export async function loader({ request }: Route.LoaderArgs) {
  const user = await getCurrentUser(request, env.trice_auction_db, runtime);
  if (!user) throw redirect("/login");
  return { required: user.mustChangePassword };
}

export async function action({ request }: Route.ActionArgs) {
  const user = await getCurrentUser(request, env.trice_auction_db, runtime);
  if (!user) throw redirect("/login");
  const form = await request.formData();
  const newPassword = String(form.get("newPassword") || "");
  const confirmNewPassword = String(form.get("confirmNewPassword") || "");
  if (newPassword !== confirmNewPassword) return data({ error: "The new passwords do not match." }, { status: 400 });
  const response = await getAuth(env.trice_auction_db, runtime).handler(new Request(
    new URL("/api/auth/change-password", request.url),
    { method: "POST", headers: { "content-type": "application/json", origin: new URL(request.url).origin, cookie: request.headers.get("cookie") || "" }, body: JSON.stringify({ currentPassword: String(form.get("currentPassword") || ""), newPassword, revokeOtherSessions: true }) },
  ));
  if (!response.ok) return data({ error: "Password could not be changed. Check your temporary password and choose at least 8 characters." }, { status: 400 });
  await env.trice_auction_db.prepare("UPDATE users SET must_change_password = 0 WHERE id = ?").bind(user.id).run();
  return redirect("/", { headers: response.headers });
}

export default function ChangePassword({ loaderData, actionData }: Route.ComponentProps) {
  const [confirmationError, setConfirmationError] = useState<string | null>(null);
  return <main className="mx-auto max-w-xl p-8"><h1 className="text-3xl font-bold">Change your password</h1><p className="mt-2 text-stone-600">{loaderData.required ? "Your administrator created this account. Change the temporary password to continue." : "Choose a new password."}</p>{confirmationError ? <p className="mt-4" role="alert">{confirmationError}</p> : null}{actionData?.error ? <p className="mt-4" role="alert">{actionData.error}</p> : null}<Form method="post" className="mt-6 grid gap-4 sm:grid-cols-2" onSubmit={(event) => { const form = new FormData(event.currentTarget); if (form.get("newPassword") !== form.get("confirmNewPassword")) { event.preventDefault(); setConfirmationError("The new passwords do not match."); } else setConfirmationError(null); }}><input required type="password" name="currentPassword" placeholder="Current temporary password" className="w-full border p-2 sm:col-span-2" autoComplete="current-password"/><input required minLength={8} type="password" name="newPassword" placeholder="New password" className="w-full border p-2" autoComplete="new-password"/><input required minLength={8} type="password" name="confirmNewPassword" placeholder="Confirm new password" className="w-full border p-2" autoComplete="new-password"/><div className="sm:col-span-2"><button className="bg-stone-900 px-4 py-2 text-white">Save new password</button></div></Form></main>;
}
