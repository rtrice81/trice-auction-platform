import { env } from "cloudflare:workers";
import { data, Form, Link, redirect } from "react-router";
import type { Route } from "./+types/admin.customers.new";
import { getAuth, requireRole } from "../services/auth.server";
import { createCustomerApplicationUser, customerInputFromForm, getCustomerByEmail, validateNewCustomer } from "../services/customer-management.server";

const runtime = env as unknown as { AUTH_SECRET?: string; BETTER_AUTH_URL?: string };

export async function loader({ request }: Route.LoaderArgs) {
  await requireRole(request, env.trice_auction_db, runtime, "admin");
  return { returnTo: safeReturnTo(new URL(request.url).searchParams.get("returnTo")) };
}

export async function action({ request }: Route.ActionArgs) {
  await requireRole(request, env.trice_auction_db, runtime, "admin");
  const form = await request.formData();
  const input = customerInputFromForm(form);
  const returnTo = safeReturnTo(String(form.get("returnTo") || ""));
  const errors = validateNewCustomer(input);
  if (errors.length) return data({ ok: false as const, errors, values: input, returnTo }, { status: 400 });

  const existing = await getCustomerByEmail(env.trice_auction_db, input.email);
  if (existing) return data({ ok: false as const, duplicate: existing, values: input, returnTo }, { status: 409 });

  const response = await getAuth(env.trice_auction_db, runtime).handler(new Request(
    new URL("/api/auth/sign-up/email", request.url),
    { method: "POST", headers: { "content-type": "application/json", origin: new URL(request.url).origin }, body: JSON.stringify({ name: `${input.firstName} ${input.lastName}`, email: input.email, password: input.temporaryPassword }) },
  ));
  if (!response.ok) {
    const duplicate = await getCustomerByEmail(env.trice_auction_db, input.email);
    if (duplicate) return data({ ok: false as const, duplicate, values: input, returnTo }, { status: 409 });
    return data({ ok: false as const, errors: ["Customer account could not be created. Check the email and temporary password."], values: input, returnTo }, { status: 400 });
  }
  const payload = await response.json() as { user: { id: string } };
  const customerId = await createCustomerApplicationUser(env.trice_auction_db, input, payload.user.id);
  return redirect(returnTo ? `${returnTo}${returnTo.includes("?") ? "&" : "?"}customerId=${customerId}` : "/admin/users");
}

export default function NewCustomer({ loaderData, actionData }: Route.ComponentProps) {
  const values = actionData && "values" in actionData ? actionData.values : undefined;
  const returnTo = actionData && "returnTo" in actionData ? actionData.returnTo : loaderData.returnTo;
  return <main className="mx-auto max-w-2xl p-8"><Link to={returnTo || "/admin/users"}>← Back</Link><h1 className="mt-4 text-3xl font-bold">Create Customer Account</h1><p className="mt-2 text-stone-600">This always creates a customer account. The temporary password is sent only to Better Auth and must be changed after the customer signs in.</p>
    {actionData && "errors" in actionData ? <p className="mt-4 rounded border border-red-200 bg-red-50 p-3" role="alert">{actionData.errors.join(" ")}</p> : null}
    {actionData && "duplicate" in actionData ? <section className="mt-4 rounded border border-amber-300 bg-amber-50 p-4" role="status"><p><strong>An account already exists:</strong> {actionData.duplicate.name} ({actionData.duplicate.email})</p><Link className="mt-2 inline-block font-semibold underline" to={returnTo ? `${returnTo}${returnTo.includes("?") ? "&" : "?"}customerId=${actionData.duplicate.id}` : "/admin/users"}>Use this customer</Link></section> : null}
    <Form method="post" className="mt-6 grid gap-4 rounded border bg-white p-6 sm:grid-cols-2"><input type="hidden" name="returnTo" value={returnTo || ""}/><label>First name<input required name="firstName" defaultValue={values?.firstName} className="mt-1 block w-full border p-2"/></label><label>Last name<input required name="lastName" defaultValue={values?.lastName} className="mt-1 block w-full border p-2"/></label><label className="sm:col-span-2">Email / login username<input required type="email" name="email" defaultValue={values?.email} className="mt-1 block w-full border p-2"/></label><label>Phone number<input required name="phone" defaultValue={values?.phone} className="mt-1 block w-full border p-2"/></label><label>Temporary password<input required minLength={8} type="password" name="temporaryPassword" className="mt-1 block w-full border p-2" autoComplete="new-password"/></label><label className="sm:col-span-2"><input type="checkbox" name="active" value="true" defaultChecked={values?.active ?? true}/> Active account</label><button className="rounded bg-stone-900 px-4 py-2 font-semibold text-white sm:col-span-2">Create customer account</button></Form></main>;
}

function safeReturnTo(value: string | null) { return value && value.startsWith("/admin/appointments/new") ? value : ""; }
