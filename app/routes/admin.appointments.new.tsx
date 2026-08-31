import { env } from "cloudflare:workers";
import { data, Form, Link, redirect } from "react-router";
import type { Route } from "./+types/admin.appointments.new";
import { createAppointmentOverrideAuditStatement } from "../services/appointment-override-audit.server";
import { createBooking, createBookingWithOverride, getBookingOptions, type BookingInput, validateBooking } from "../services/booking.server";
import { requireRole } from "../services/auth.server";
import { getCustomerById, searchCustomers } from "../services/customer-management.server";

const runtime = env as unknown as { AUTH_SECRET?: string; BETTER_AUTH_URL?: string };

export async function loader({ request }: Route.LoaderArgs) {
  await requireRole(request, env.trice_auction_db, runtime, "admin");
  const url = new URL(request.url); const q = url.searchParams.get("q") ?? ""; const customerId = Number(url.searchParams.get("customerId"));
  const [options, customers, selectedCustomer] = await Promise.all([getBookingOptions(env.trice_auction_db), searchCustomers(env.trice_auction_db, q), Number.isInteger(customerId) && customerId > 0 ? getCustomerById(env.trice_auction_db, customerId) : null]);
  return { options, q, customers, selectedCustomer };
}

export async function action({ request }: Route.ActionArgs) {
  const actor = await requireRole(request, env.trice_auction_db, runtime, "admin");
  const form = await request.formData(); const input = bookingInputFromForm(form);
  const customer = await getCustomerById(env.trice_auction_db, input.userId);
  if (!customer) return data({ ok: false as const, errors: ["Choose an existing customer."], submitted: input }, { status: 400 });
  if (form.get("intent") !== "override") { const result = await createBooking(env.trice_auction_db, input); return result.ok ? redirect(`/admin/appointments?created=${result.appointmentId}`) : data({ ...result, submitted: input }, { status: 400 }); }
  const reason = String(form.get("overrideReason") || "").trim(); if (!reason) return data({ ok: false as const, errors: ["An override reason is required."], overridableViolations: [], submitted: input }, { status: 400 });
  const validation = await validateBooking(env.trice_auction_db, input);
  if (validation.ok || !validation.dropoffType || !onlyOverridable(validation.errors, validation.overridableViolations)) return data({ ...(validation.ok ? { ok: false, errors: ["This appointment no longer requires an override."], overridableViolations: [] } : validation), submitted: input }, { status: 400 });
  const appointmentId = await createBookingWithOverride(env.trice_auction_db, input, validation.dropoffType);
  await createAppointmentOverrideAuditStatement(env.trice_auction_db, { appointmentId, actorUserId: actor.id, actorRole: "admin", reason, violatedRules: validation.overridableViolations, previousValues: null, requestedValues: input, capacityContext: validation.capacityContext }).run();
  return redirect(`/admin/appointments/${appointmentId}`);
}

export default function NewAppointment({ loaderData, actionData }: Route.ComponentProps) {
  const submitted = actionData && "submitted" in actionData ? actionData.submitted : null;
  const needsOverride = actionData && !actionData.ok && "overridableViolations" in actionData && onlyOverridable(actionData.errors, actionData.overridableViolations);
  const customerId = submitted?.userId ?? loaderData.selectedCustomer?.id;
  return <main className="mx-auto max-w-4xl p-8"><Link to="/admin/appointments">← Appointments</Link><h1 className="mt-4 text-3xl font-bold">New Appointment</h1><Form method="get" className="mt-5 flex gap-2"><input name="q" defaultValue={loaderData.q} placeholder="Search name, email, or phone" className="w-full border p-2"/><button className="border px-3">Search</button><Link className="border px-3 py-2" to="/admin/customers/new?returnTo=/admin/appointments/new">Create Customer</Link></Form><div className="mt-3 rounded border p-3">{loaderData.selectedCustomer ? <strong>Selected: {loaderData.selectedCustomer.name} · {loaderData.selectedCustomer.email}</strong> : loaderData.customers.length ? loaderData.customers.map((customer) => <Link key={customer.id} className="mr-3 inline-block underline" to={`/admin/appointments/new?customerId=${customer.id}&q=${encodeURIComponent(loaderData.q)}`}>{customer.name} ({customer.email})</Link>) : <span>No customer found. Use Create Customer to add one.</span>}</div>{actionData && !actionData.ok ? <div className="mt-4 rounded border border-red-200 bg-red-50 p-3" role="alert">{actionData.errors.join(" ")}</div> : null}{customerId ? <AppointmentForm options={loaderData.options} customerId={customerId} submitted={submitted}/>: <p className="mt-6 text-stone-600">Select a customer before creating an appointment.</p>}{needsOverride && submitted ? <OverrideForm input={submitted}/>: null}</main>;
}

function AppointmentForm({ options, customerId, submitted }: { options: Awaited<ReturnType<typeof getBookingOptions>>; customerId: number; submitted: BookingInput | null }) { return <Form method="post" className="mt-6 grid gap-4 rounded border bg-white p-5"><input type="hidden" name="intent" value="save"/><input type="hidden" name="customerId" value={customerId}/><label>Drop-Off Event/date<select required name="appointmentDate" defaultValue={submitted?.appointmentDate} className="mt-1 block w-full border p-2"><option value="">Choose open event</option>{options.availableDates.map((date) => <option key={date.date} value={date.date}>{date.date}{date.eventName ? ` — ${date.eventName}` : ""}</option>)}</select></label><label>Time<input required type="time" name="appointmentTime" defaultValue={submitted?.appointmentTime || ""} className="mt-1 block border p-2"/></label><label>Load type<select required name="dropoffTypeId" defaultValue={submitted?.dropoffTypeId} className="mt-1 block border p-2"><option value="">Choose load</option>{options.dropoffTypes.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}</select></label><div className="grid gap-3 sm:grid-cols-3">{options.itemAreas.map((area, index) => <label key={area.id}>{area.name} percentage<input required min="0" max="100" type="number" name={`allocation-${area.id}`} defaultValue={submitted?.allocations.find((item) => item.itemAreaId === area.id)?.percentage ?? (index === 0 ? 100 : 0)} className="mt-1 block w-full border p-2"/></label>)}</div><label>Description<textarea name="description" defaultValue={submitted?.description || ""} className="mt-1 block w-full border p-2"/></label><button className="rounded bg-stone-900 px-4 py-2 font-semibold text-white">Create appointment</button></Form>; }
function OverrideForm({ input }: { input: BookingInput }) { return <Form method="post" className="mt-5 rounded border-2 border-amber-500 bg-amber-50 p-4"><input type="hidden" name="intent" value="override"/><input type="hidden" name="customerId" value={input.userId}/><input type="hidden" name="appointmentDate" value={input.appointmentDate}/><input type="hidden" name="appointmentTime" value={input.appointmentTime || ""}/><input type="hidden" name="dropoffTypeId" value={input.dropoffTypeId}/><input type="hidden" name="description" value={input.description}/>{input.allocations.map((item) => <input key={item.itemAreaId} type="hidden" name={`allocation-${item.itemAreaId}`} value={item.percentage}/>)}<label>Override reason<textarea required name="overrideReason" className="mt-1 block w-full border p-2"/></label><button className="mt-3 rounded bg-stone-900 px-4 py-2 font-semibold text-white">Record override and create appointment</button></Form>; }
function bookingInputFromForm(form: FormData): BookingInput { return { userId: Number(form.get("customerId")), appointmentDate: String(form.get("appointmentDate") || ""), appointmentTime: String(form.get("appointmentTime") || ""), dropoffTypeId: Number(form.get("dropoffTypeId")), description: String(form.get("description") || ""), allocations: Array.from(form.entries()).filter(([key]) => key.startsWith("allocation-")).map(([key, value]) => ({ itemAreaId: Number(key.slice(11)), percentage: Number(value) })) }; }
function onlyOverridable(errors: string[], overridable: string[]) { return errors.length > 0 && overridable.length > 0 && errors.every((error) => overridable.includes(error)); }
