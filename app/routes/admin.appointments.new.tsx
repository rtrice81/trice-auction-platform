import { env } from "cloudflare:workers";
import { data, Form, Link, redirect } from "react-router";
import type { Route } from "./+types/admin.appointments.new";
import { getBookingOptions, type BookingInput } from "../services/booking.server";
import { createAdminAppointment } from "../services/admin-appointment-creation.server";
import { getAuth, requireRole } from "../services/auth.server";
import { createCustomerApplicationUser, customerInputFromForm, getCustomerByEmail, getCustomerById, searchCustomers, validateNewCustomer } from "../services/customer-management.server";
import { getDropoffEventById } from "../services/schedule-management.server";
import { AdminAppointmentFields } from "../components/admin-appointment-fields";
import { queueAppointmentCreated } from "../services/notification.server";
import { AppointmentCreationError, MonthlyAppointmentConfirmationFields } from "../components/admin-appointment-feedback";

const runtime = env as unknown as { AUTH_SECRET?: string; BETTER_AUTH_URL?: string };

export async function loader({ request }: Route.LoaderArgs) {
  await requireRole(request, env.trice_auction_db, runtime, "admin");
  const url = new URL(request.url); const q = url.searchParams.get("q") ?? ""; const customerId = Number(url.searchParams.get("customerId")); const scheduleId = Number(url.searchParams.get("scheduleId")); const appointmentDate = url.searchParams.get("appointmentDate") ?? "";
  const [options, customers, selectedCustomer, schedule] = await Promise.all([getBookingOptions(env.trice_auction_db, { adminScheduling: true }), searchCustomers(env.trice_auction_db, q), Number.isInteger(customerId) && customerId > 0 ? getCustomerById(env.trice_auction_db, customerId) : null, Number.isInteger(scheduleId) && scheduleId > 0 ? getDropoffEventById(env.trice_auction_db, scheduleId) : null]);
  if (scheduleId && !schedule) throw new Response("Not Found", { status: 404 });
  const selectedDate = schedule ? { date: schedule.date, eventName: schedule.eventName, adminStatus: [] as string[] } : options.availableDates.find((date) => date.date === appointmentDate) ?? null;
  return { options, q, customers, selectedCustomer, selectedDate, scheduleId: schedule?.id ?? null };
}

export async function action({ request }: Route.ActionArgs) {
  const actor = await requireRole(request, env.trice_auction_db, runtime, "admin");
  const form = await request.formData();
  if (form.get("intent") === "create-customer") return createInlineCustomer(request, form);
  const input = bookingInputFromForm(form);
  const modalResponse = form.get("responseMode") === "modal";
  try {
    const intent = String(form.get("intent") ?? "save");
    if (!["save", "override", "confirm-monthly", "go-back"].includes(intent)) {
      return data({ ok: false as const, errors: ["Invalid appointment action."], submitted: input }, { status: 400 });
    }
    const scheduleId = Number(form.get("scheduleId"));
    const hasScheduleContext = Number.isInteger(scheduleId) && scheduleId > 0;
    const schedule = hasScheduleContext ? await getDropoffEventById(env.trice_auction_db, scheduleId) : null;
    if (hasScheduleContext && !schedule) return data({ ok: false as const, errors: ["This Drop-Off Date no longer exists."], submitted: input }, { status: 400 });
    if (schedule) input.appointmentDate = schedule.date;
    const result = await createAdminAppointment(env.trice_auction_db, input, {
      actorUserId: actor.id,
      overrideMonthlyLimit: form.get("overrideMonthlyLimit") === "true",
      goBack: intent === "go-back",
    });
    if (!result.ok) return data(result, { status: result.monthlyConfirmation || intent === "go-back" ? 200 : 400 });
    // Once creation commits, notification failure must not look like a failed
    // booking and encourage the admin to create a duplicate appointment.
    let message = result.message;
    try { await queueAppointmentCreated(env.trice_auction_db, result.appointmentId, env as never, actor.email); }
    catch { message += " Notifications could not be queued."; }
    return modalResponse ? data({ ok: true as const, appointmentId: result.appointmentId, message }) : redirect(schedule ? `/admin/schedule/${schedule.id}?created=${result.appointmentId}` : `/admin/appointments/${result.appointmentId}?created=1`);
  } catch {
    return data({ ok: false as const, errors: ["The appointment could not be created. Please try again."], submitted: input }, { status: 400 });
  }
}

async function createInlineCustomer(request: Request, form: FormData) {
  const input = customerInputFromForm(form);
  const errors = validateNewCustomer(input);
  if (errors.length) return data({ ok: false as const, errors, values: input }, { status: 400 });
  const existing = await getCustomerByEmail(env.trice_auction_db, input.email);
  if (existing) return data({ ok: false as const, duplicate: existing, values: input }, { status: 409 });
  const response = await getAuth(env.trice_auction_db, runtime).handler(new Request(
    new URL("/api/auth/sign-up/email", request.url),
    { method: "POST", headers: { "content-type": "application/json", origin: new URL(request.url).origin }, body: JSON.stringify({ name: `${input.firstName} ${input.lastName}`, email: input.email, password: input.temporaryPassword }) },
  ));
  if (!response.ok) {
    const duplicate = await getCustomerByEmail(env.trice_auction_db, input.email);
    if (duplicate) return data({ ok: false as const, duplicate, values: input }, { status: 409 });
    return data({ ok: false as const, errors: ["Customer account could not be created. Check the email and temporary password."], values: input }, { status: 400 });
  }
  const payload = await response.json() as { user: { id: string } };
  const customerId = await createCustomerApplicationUser(env.trice_auction_db, input, payload.user.id);
  const customer = await getCustomerById(env.trice_auction_db, customerId);
  if (!customer) throw new Response("Customer could not be loaded.", { status: 500 });
  return data({ ok: true as const, customer });
}

export default function NewAppointment({ loaderData, actionData }: Route.ComponentProps) {
  const submitted = actionData && "submitted" in actionData ? actionData.submitted : null;
  const needsMonthlyConfirmation = actionData && "monthlyConfirmation" in actionData && actionData.monthlyConfirmation;
  const monthlyAppointments = actionData && "monthlyAppointments" in actionData && Array.isArray(actionData.monthlyAppointments) ? actionData.monthlyAppointments : [];
  const customerId = submitted?.userId ?? loaderData.selectedCustomer?.id;
  const selectedDate = loaderData.selectedDate?.date ?? "";
  const scheduleId = loaderData.scheduleId;
  const appointmentPath = `/admin/appointments/new?appointmentDate=${selectedDate}${scheduleId ? `&scheduleId=${scheduleId}` : ""}`;
  const customerReturnTo = encodeURIComponent(appointmentPath);
  const backTo = scheduleId ? `/admin/schedule/${scheduleId}` : "/admin/appointments";
  return <main className="mx-auto max-w-4xl p-8"><Link to={backTo}>← {scheduleId ? "Drop-Off Date" : "Appointments"}</Link><h1 className="mt-4 text-3xl font-bold">New Appointment</h1><p className="mt-2 rounded border border-blue-200 bg-blue-50 p-3 text-sm text-blue-950">Admin-created appointments are confirmed even when capacity or waitlist limits are full or public signup is closed. Exceptions are recorded automatically. Repeat monthly appointments still require confirmation.</p>{scheduleId ? <p className="mt-3 rounded border border-violet-200 bg-violet-50 p-3 text-sm text-violet-950">Adding an appointment for <strong>{loaderData.selectedDate?.eventName || selectedDate}</strong> on {selectedDate}. The drop-off date is locked to this schedule.</p> : null}<Form method="get" className="mt-5 flex gap-2"><input type="hidden" name="appointmentDate" value={selectedDate}/>{scheduleId ? <input type="hidden" name="scheduleId" value={scheduleId}/> : null}<input name="q" defaultValue={loaderData.q} placeholder="Search name, email, or phone" className="w-full border p-2"/><button className="border px-3">Search</button><Link className="border px-3 py-2" to={`/admin/customers/new?returnTo=${customerReturnTo}`}>Create Customer</Link></Form><div className="mt-3 rounded border p-3">{loaderData.selectedCustomer ? <strong>Selected: {loaderData.selectedCustomer.name} · {loaderData.selectedCustomer.email}</strong> : loaderData.customers.length ? loaderData.customers.map((customer) => <Link key={customer.id} className="mr-3 inline-block underline" to={`${appointmentPath}&customerId=${customer.id}&q=${encodeURIComponent(loaderData.q)}`}>{customer.name} ({customer.email})</Link>) : <span>No customer found. Use Create Customer to add one.</span>}</div>{actionData && !actionData.ok && "errors" in actionData && actionData.errors.length ? <AppointmentCreationError errors={actionData.errors}/> : null}{customerId ? <AppointmentForm options={loaderData.options} customerId={customerId} submitted={submitted} selectedDate={selectedDate} scheduleId={scheduleId}/>: <p className="mt-6 text-stone-600">Select a customer before creating an appointment.</p>}{needsMonthlyConfirmation && submitted ? <Form method="post" className="mt-5 rounded border-2 border-amber-500 bg-amber-50 p-4"><MonthlyAppointmentConfirmationFields input={submitted} appointments={monthlyAppointments} scheduleId={scheduleId}/></Form> : null}</main>;
}

function AppointmentForm({ options, customerId, submitted, selectedDate, scheduleId }: { options: Awaited<ReturnType<typeof getBookingOptions>>; customerId: number; submitted: BookingInput | null; selectedDate?: string; scheduleId: number | null }) { return <Form method="post" className="mt-6 grid gap-4 rounded border bg-white p-5"><input type="hidden" name="intent" value="save"/><input type="hidden" name="customerId" value={customerId}/>{scheduleId ? null : <label>Drop-Off Date<select required name="appointmentDate" defaultValue={submitted?.appointmentDate ?? selectedDate} className="mt-1 block w-full border p-2"><option value="">Choose a Drop-Off Date</option>{options.availableDates.map((date) => <option key={date.date} value={date.date}>{date.date}{date.eventName ? ` — ${date.eventName}` : ""}{date.adminStatus?.length ? ` [${date.adminStatus.join(" · ")}]` : ""}</option>)}</select></label>}<AdminAppointmentFields dropoffTypes={options.dropoffTypes} itemAreas={options.itemAreas} submitted={submitted} scheduleId={scheduleId} selectedDate={selectedDate}/><button className="rounded bg-stone-900 px-4 py-2 font-semibold text-white">Create appointment</button></Form>; }
function bookingInputFromForm(form: FormData): BookingInput { return { userId: Number(form.get("customerId")), appointmentDate: String(form.get("appointmentDate") || ""), dropoffTypeId: Number(form.get("dropoffTypeId")), description: String(form.get("description") || ""), allocations: Array.from(form.entries()).filter(([key]) => key.startsWith("allocation-")).map(([key, value]) => ({ itemAreaId: Number(key.slice(11)), percentage: Number(value) })) }; }
