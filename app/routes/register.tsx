import { env } from "cloudflare:workers";
import { useCallback, useRef, useState } from "react";
import { data, Form, redirect } from "react-router";
import type { Route } from "./+types/register";
import { getAuth, syncApplicationUser } from "../services/auth.server";
import { getPendingBookingToken } from "../services/pending-booking.server";
import { createPublicFormStart, verifyPublicFormSubmission } from "../services/public-form-protection.server";
import { PublicFormProtection, reportTurnstileFormSubmission } from "../components/public-form-protection";
const runtime = env as unknown as { AUTH_SECRET?: string; BETTER_AUTH_URL?: string; TURNSTILE_SITE_KEY?: string; TURNSTILE_SECRET_KEY?: string };
export async function loader({ request }: Route.LoaderArgs) {
  const protection = await createPublicFormStart(request, "registration", runtime);
  return data({ turnstileSiteKey: runtime.TURNSTILE_SITE_KEY ?? "", formStartToken: protection.token }, { headers: protection.headers });
}
export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  if (!String(form.get("name") ?? "").trim() || !String(form.get("email") ?? "").trim() || !String(form.get("password") ?? "")) return data({ error: "Registration could not be completed." }, { status: 400 });
  const protection = await verifyPublicFormSubmission({ request, formData: form, form: "registration", runtime, db: env.trice_auction_db, rateLimit: { maximumAttempts: 10, windowSeconds: 600 } });
  if (!protection.ok) return data({ error: protection.error }, { status: 400 });
  const response = await getAuth(env.trice_auction_db, runtime).handler(new Request(new URL("/api/auth/sign-up/email", request.url), { method: "POST", headers: { "content-type": "application/json", origin: new URL(request.url).origin }, body: JSON.stringify({ name: String(form.get("name") ?? ""), email: String(form.get("email") ?? "").trim().toLowerCase(), password: String(form.get("password") ?? "") }) }));
  if (!response.ok) return data({ error: "Registration could not be completed." }, { status: 400 });
  const payload = await response.json() as { user: { id: string; email: string; name?: string } };
  await syncApplicationUser(env.trice_auction_db, payload.user);
  return redirect(getPendingBookingToken(request) ? "/?resume=1" : "/", { headers: response.headers });
}
export default function Register({ loaderData, actionData }: Route.ComponentProps) {
  const [turnstileVerified, setTurnstileVerified] = useState(false);
  const responseInputRef = useRef<HTMLInputElement>(null);
  const handleTurnstileChange = useCallback((hasToken: boolean) => setTurnstileVerified(hasToken), []);

  return <main className="mx-auto max-w-md p-8"><h1 className="text-3xl font-bold">Create your account</h1>{actionData?.error && <p role="alert">{actionData.error}</p>}<Form method="post" className="mt-6 space-y-4" onSubmit={(event) => { if (!turnstileVerified || !reportTurnstileFormSubmission(event.currentTarget)) event.preventDefault(); }}><input required name="name" placeholder="Name" className="w-full border p-2"/><input required type="email" name="email" placeholder="Email" className="w-full border p-2"/><input required minLength={8} type="password" name="password" placeholder="Password" className="w-full border p-2"/><input ref={responseInputRef} type="hidden" name="cf-turnstile-response" defaultValue=""/><PublicFormProtection siteKey={loaderData.turnstileSiteKey} formStartToken={loaderData.formStartToken} onTokenChange={handleTurnstileChange} responseInputRef={responseInputRef}/><button disabled={!turnstileVerified} className="bg-stone-900 px-4 py-2 text-white disabled:cursor-not-allowed disabled:opacity-60">Register</button></Form></main>;
}
