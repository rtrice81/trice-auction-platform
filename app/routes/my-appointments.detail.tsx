import { env } from "cloudflare:workers";
import { data, Form, Link } from "react-router";
import type { Route } from "./+types/my-appointments.detail";
import { requireOwnership, requireUser } from "../services/auth.server";
import { createBooking, getBookingOptions } from "../services/booking.server";
import { cancelScheduledAppointment, queueAppointmentRescheduled } from "../services/notification.server";
import { getInternalAppointmentSnapshot, internalAppointmentDetailsChanged } from "../services/internal-appointment-notifications.server";
import { Button, FormField, Notice, PageCard, PageIntro, PageShell } from "../components/design-system";
import { AreaAllocationFields } from "../components/area-allocation-fields";

const runtime = env as unknown as { AUTH_SECRET?: string; BETTER_AUTH_URL?: string };

export async function loader({ request, params }: Route.LoaderArgs) {
  const user = await requireUser(request, env.trice_auction_db, runtime);
  const appointment = await env.trice_auction_db
    .prepare(
      `SELECT a.id AS id, a.user_id AS userId, a.appointment_date AS appointmentDate,
              a.dropoff_type_id AS dropoffTypeId,
              a.description AS description, a.status AS status, day.event_name AS eventName, day.visibility AS visibility
       FROM appointments AS a
       LEFT JOIN dropoff_days AS day ON day.dropoff_date = a.appointment_date
       WHERE a.id = ?`,
    )
    .bind(Number(params.id))
    .first<any>();
  if (!appointment) throw new Response("Not Found", { status: 404 });
  requireOwnership(user, appointment.userId);

  const allocations = (
    await env.trice_auction_db
      .prepare(
        `SELECT item_area_id AS itemAreaId, allocation_percent AS percentage
         FROM appointment_area_allocations WHERE appointment_id = ?`,
      )
      .bind(appointment.id)
      .all<any>()
  ).results;
  const options = await getBookingOptions(env.trice_auction_db);
  return {
    appointment,
    allocations,
    options: {
      dropoffTypes: options.dropoffTypes.map(({ id, name }) => ({ id, name })),
      itemAreas: options.itemAreas.map(({ id, name }) => ({ id, name })),
      availableDates: options.availableDates,
    },
  };
}

export async function action({ request, params }: Route.ActionArgs) {
  const user = await requireUser(request, env.trice_auction_db, runtime);
  const appointment = await env.trice_auction_db
    .prepare(
      `SELECT a.user_id AS userId, a.status AS status, day.visibility AS visibility
       FROM appointments AS a
       LEFT JOIN dropoff_days AS day ON day.dropoff_date = a.appointment_date
       WHERE a.id = ?`,
    )
    .bind(Number(params.id))
    .first<any>();
  if (!appointment) throw new Response("Not Found", { status: 404 });
  requireOwnership(user, appointment.userId);

  if (appointment.visibility === "private") return data({ error: "Private appointments can only be changed by an administrator." }, { status: 403 });

  const form = await request.formData();
  if (form.get("intent") === "cancel") {
    const result = await cancelScheduledAppointment(env.trice_auction_db, Number(params.id), env as never, user.email);
    return data(result.cancelled ? { ok: true as const, message: "Your appointment has been cancelled." } : { error: "This appointment is already cancelled or no longer scheduled." }, { status: result.cancelled ? 200 : 400 });
  }
  const allocations = Array.from(form.entries())
    .filter(([key]) => key.startsWith("allocation-"))
    .map(([key, value]) => ({ itemAreaId: Number(key.slice(11)), percentage: Number(value) }));
  const appointmentId = Number(params.id);
  const previous = await getInternalAppointmentSnapshot(env.trice_auction_db, appointmentId);
  const result = await createBooking(env.trice_auction_db, {
      appointmentId: Number(params.id),
      userId: user.id,
      appointmentDate: String(form.get("appointmentDate")),
      dropoffTypeId: Number(form.get("dropoffTypeId")),
      description: String(form.get("description") || ""),
      allocations,
    });
  const current = result.ok ? await getInternalAppointmentSnapshot(env.trice_auction_db, appointmentId) : null;
  const rescheduled = previous?.date !== String(form.get("appointmentDate")) || previous?.loadType !== (await env.trice_auction_db.prepare("SELECT name FROM dropoff_types WHERE id=?").bind(Number(form.get("dropoffTypeId"))).first<{ name: string }>())?.name;
  if (result.ok && internalAppointmentDetailsChanged(previous, current)) await queueAppointmentRescheduled(env.trice_auction_db, appointmentId, { previous, actorName: user.email, notifyCustomer: rescheduled });
  return data(result);
}

export default function Detail({ loaderData, actionData }: Route.ComponentProps) {
  const { appointment, allocations, options } = loaderData;
  return (
    <PageShell><div className="max-w-3xl"><Link to="/my-appointments" className="text-sm font-bold text-[#9d302f]">← My Appointments</Link><PageIntro eyebrow="Customer portal" title="Edit appointment">Update your scheduled drop-off details. Availability is confirmed when you save.</PageIntro>
      {actionData && "error" in actionData ? <Notice variant="error">{actionData.error}</Notice> : null}{actionData && "errors" in actionData ? <Notice variant="error">{actionData.errors.join(" ")}</Notice> : null}{actionData && "message" in actionData ? <Notice variant="success">{actionData.message}</Notice> : null}
      <PageCard title={appointment.visibility === "private" ? (appointment.eventName || "Private appointment") : "Appointment details"}>{appointment.visibility === "private" ? <div className="grid gap-2 text-sm text-[#555960]"><p>{appointment.appointmentDate} · {appointment.status}</p><p>{options.dropoffTypes.find((type) => type.id === appointment.dropoffTypeId)?.name}</p><p className="whitespace-pre-wrap">{appointment.description || ""}</p></div> : <Form method="post" className="grid gap-5 sm:grid-cols-2">
        <FormField label="Drop-off date"><select name="appointmentDate" defaultValue={appointment.appointmentDate}>
            {options.availableDates.map((date) => <option key={date.date} value={date.date}>{date.date}</option>)}
          </select></FormField>
        {!options.availableDates.some((date) => date.date === appointment.appointmentDate) ? <div className="sm:col-span-2"><Notice variant="warning">This appointment’s current date is no longer bookable. Choose an open configured date to save changes.</Notice></div> : null}
        <FormField label="Load type"><select name="dropoffTypeId" defaultValue={appointment.dropoffTypeId}>
          {options.dropoffTypes.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}
        </select></FormField>
        <div className="sm:col-span-2"><AreaAllocationFields itemAreas={options.itemAreas} allocations={allocations} /></div>
        <FormField label="Notes" className="sm:col-span-2"><textarea name="description" rows={4} defaultValue={appointment.description ?? ""} /></FormField>
        <div className="sm:col-span-2"><Button disabled={options.availableDates.length === 0}>Save changes</Button></div>
      </Form>}</PageCard>
      {appointment.visibility !== "private" && appointment.status === "scheduled" ? <Form method="post" className="mt-5"><input type="hidden" name="intent" value="cancel"/><button className="rounded-lg border border-red-300 px-4 py-2 text-sm font-semibold text-red-800">Cancel appointment</button></Form> : null}
    </div></PageShell>
  );
}
