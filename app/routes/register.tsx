import { env } from "cloudflare:workers";
import { data, Form, redirect } from "react-router";
import type { Route } from "./+types/register";
import { getAuth, syncApplicationUser } from "../services/auth.server";
const runtime = env as unknown as { AUTH_SECRET?: string; BETTER_AUTH_URL?: string };
export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const response = await getAuth(env.trice_auction_db, runtime).handler(new Request(new URL("/api/auth/sign-up/email", request.url), { method: "POST", headers: { "content-type": "application/json", origin: new URL(request.url).origin }, body: JSON.stringify({ name: String(form.get("name") ?? ""), email: String(form.get("email") ?? "").trim().toLowerCase(), password: String(form.get("password") ?? "") }) }));
  if (!response.ok) return data({ error: "Registration could not be completed." }, { status: 400 });
  const payload = await response.json() as { user: { id: string; email: string; name?: string } };
  await syncApplicationUser(env.trice_auction_db, payload.user);
  return redirect("/", { headers: response.headers });
}
export default function Register({ actionData }: Route.ComponentProps) { return <main className="mx-auto max-w-md p-8"><h1 className="text-3xl font-bold">Create your account</h1>{actionData?.error && <p role="alert">{actionData.error}</p>}<Form method="post" className="mt-6 space-y-4"><input required name="name" placeholder="Name" className="w-full border p-2"/><input required type="email" name="email" placeholder="Email" className="w-full border p-2"/><input required minLength={8} type="password" name="password" placeholder="Password" className="w-full border p-2"/><button className="bg-stone-900 px-4 py-2 text-white">Register</button></Form></main>; }
