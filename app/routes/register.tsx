import { env } from "cloudflare:workers";
import { useCallback, useRef, useState } from "react";
import { data, Form, redirect, useSubmit } from "react-router";
import type { Route } from "./+types/register";
import { getAuth, syncApplicationUser } from "../services/auth.server";
import { getPendingBookingToken } from "../services/pending-booking.server";
import { createPublicFormStart, verifyPublicFormSubmission } from "../services/public-form-protection.server";
import { PublicFormProtection } from "../components/public-form-protection";
import { validateRegistrationPasswords } from "../lib/registration-password-validation";
const runtime = env as unknown as { AUTH_SECRET?: string; BETTER_AUTH_URL?: string; TURNSTILE_SITE_KEY?: string; TURNSTILE_SECRET_KEY?: string };
export async function loader({ request }: Route.LoaderArgs) {
  const protection = await createPublicFormStart(request, "registration", runtime);
  return data({ turnstileSiteKey: runtime.TURNSTILE_SITE_KEY ?? "", formStartToken: protection.token }, { headers: protection.headers });
}
export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const password = String(form.get("password") ?? "");
  const passwordError = validateRegistrationPasswords(password, String(form.get("confirmPassword") ?? ""));
  if (!String(form.get("name") ?? "").trim() || !String(form.get("email") ?? "").trim() || passwordError) return data({ error: passwordError ?? "Registration could not be completed." }, { status: 400 });
  const protection = await verifyPublicFormSubmission({ request, formData: form, form: "registration", runtime, db: env.trice_auction_db, rateLimit: { maximumAttempts: 10, windowSeconds: 600 } });
  if (!protection.ok) return data({ error: protection.error }, { status: 400 });
  const response = await getAuth(env.trice_auction_db, runtime).handler(new Request(new URL("/api/auth/sign-up/email", request.url), { method: "POST", headers: { "content-type": "application/json", origin: new URL(request.url).origin }, body: JSON.stringify({ name: String(form.get("name") ?? ""), email: String(form.get("email") ?? "").trim().toLowerCase(), password }) }));
  if (!response.ok) return data({ error: "Registration could not be completed." }, { status: 400 });
  const payload = await response.json() as { user: { id: string; email: string; name?: string } };
  await syncApplicationUser(env.trice_auction_db, payload.user);
  return redirect(getPendingBookingToken(request) ? "/?resume=1" : "/", { headers: response.headers });
}
export default function Register({ loaderData, actionData }: Route.ComponentProps) {
  const [turnstileVerified, setTurnstileVerified] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordAttempted, setPasswordAttempted] = useState(false);
  const turnstileTokenRef = useRef("");
  const submit = useSubmit();
  const handleTurnstileChange = useCallback((hasToken: boolean) => setTurnstileVerified(hasToken), []);
  const passwordError = validateRegistrationPasswords(password, confirmPassword);
  const passwordsValid = !passwordError;

  return <main className="mx-auto max-w-md p-8"><h1 className="text-3xl font-bold">Create your account</h1>{actionData?.error && <p role="alert">{actionData.error}</p>}<Form method="post" className="mt-6 space-y-4" onSubmit={(event) => { event.preventDefault(); setPasswordAttempted(true); const formData = new FormData(event.currentTarget); if (!passwordsValid) return; formData.set("cf-turnstile-response", turnstileTokenRef.current); const submittedToken = formData.get("cf-turnstile-response"); if (!turnstileVerified || typeof submittedToken !== "string" || !submittedToken) return; console.info("turnstile-submit-check", { hasToken: Boolean(submittedToken), tokenLength: typeof submittedToken === "string" ? submittedToken.length : 0, formDataHasToken: formData.has("cf-turnstile-response") }); submit(formData, { method: "post" }); }}><input required name="name" placeholder="Name" className="w-full border p-2"/><input required type="email" name="email" placeholder="Email" className="w-full border p-2"/><label className="block">Password<input required minLength={8} type="password" name="password" value={password} onChange={(event) => setPassword(event.currentTarget.value)} className="mt-1 w-full border p-2"/></label><label className="block">Confirm Password<input required minLength={8} type="password" name="confirmPassword" value={confirmPassword} onChange={(event) => setConfirmPassword(event.currentTarget.value)} className="mt-1 w-full border p-2"/></label>{(passwordAttempted || password || confirmPassword) && passwordError ? <p role="alert" className="text-sm text-red-700">{passwordError}</p> : null}<PublicFormProtection siteKey={loaderData.turnstileSiteKey} formStartToken={loaderData.formStartToken} onTokenChange={handleTurnstileChange} turnstileTokenRef={turnstileTokenRef}/><button disabled={!turnstileVerified || !passwordsValid} className="bg-stone-900 px-4 py-2 text-white disabled:cursor-not-allowed disabled:opacity-60">Register</button></Form></main>;
}
