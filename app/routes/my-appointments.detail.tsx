import { env } from "cloudflare:workers";
import { data, Form, Link } from "react-router";
import type { Route } from "./+types/my-appointments.detail";
import { requireOwnership, requireUser } from "../services/auth.server";
import { createBooking, getBookingOptions } from "../services/booking.server";
import { Button, FormField, Notice, PageCard, PageIntro, PageShell } from "../components/design-system";

const runtime = env as unknown as { AUTH_SECRET?: string; BETTER_AUTH_URL?: string };

export async function loader({ request, params }: Route.LoaderArgs) {
  const user = await requireUser(request, env.trice_auction_db, runtime);
  const appointment = await env.trice_auction_db
    .prepare(
      `SELECT id, user_id AS userId, appointment_date AS appointmentDate,
              appointment_time AS appointmentTime, dropoff_type_id AS dropoffTypeId,
              description, status
       FROM appointments WHERE id = ?`,
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
    .prepare("SELECT user_id AS userId FROM appointments WHERE id = ?")
    .bind(Number(params.id))
    .first<any>();
  if (!appointment) throw new Response("Not Found", { status: 404 });
  requireOwnership(user, appointment.userId);

  const form = await request.formData();
  const allocations = Array.from(form.entries())
    .filter(([key]) => key.startsWith("allocation-"))
    .map(([key, value]) => ({ itemAreaId: Number(key.slice(11)), percentage: Number(value) }));
  return data(
    await createBooking(env.trice_auction_db, {
      appointmentId: Number(params.id),
      userId: user.id,
      appointmentDate: String(form.get("appointmentDate")),
      appointmentTime: String(form.get("appointmentTime") || ""),
      dropoffTypeId: Number(form.get("dropoffTypeId")),
      description: String(form.get("description") || ""),
      allocations,
    }),
  );
}

export default function Detail({ loaderData, actionData }: Route.ComponentProps) {
  const { appointment, allocations, options } = loaderData;
  return (
    <PageShell><div className="max-w-3xl"><Link to="/my-appointments" className="text-sm font-bold text-[#9d302f]">← My Appointments</Link><PageIntro eyebrow="Customer portal" title="Edit appointment">Update your scheduled drop-off details. Availability is confirmed when you save.</PageIntro>
      {actionData && !actionData.ok ? <Notice variant="error">{actionData.errors.join(" ")}</Notice> : null}
      <PageCard title="Appointment details"><Form method="post" className="grid gap-5 sm:grid-cols-2">
        <FormField label="Drop-off date"><select name="appointmentDate" defaultValue={appointment.appointmentDate}>
            {options.availableDates.map((date) => <option key={date.date} value={date.date}>{date.date}</option>)}
          </select></FormField>
        {!options.availableDates.some((date) => date.date === appointment.appointmentDate) ? <div className="sm:col-span-2"><Notice variant="warning">This appointment’s current date is no longer bookable. Choose an open configured date to save changes.</Notice></div> : null}
        <FormField label="Drop-off time"><input type="time" name="appointmentTime" defaultValue={appointment.appointmentTime ?? ""} /></FormField>
        <FormField label="Load type"><select name="dropoffTypeId" defaultValue={appointment.dropoffTypeId}>
          {options.dropoffTypes.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}
        </select></FormField>
        <div className="grid gap-4 sm:col-span-2 sm:grid-cols-3">{options.itemAreas.map((area) => <FormField key={area.id} label={`${area.name} percentage`}><input name={`allocation-${area.id}`} type="number" min="0" max="100" defaultValue={allocations.find((allocation: any) => allocation.itemAreaId === area.id)?.percentage ?? 0} /></FormField>)}</div>
        <FormField label="Notes" className="sm:col-span-2"><textarea name="description" rows={4} defaultValue={appointment.description ?? ""} /></FormField>
        <div className="sm:col-span-2"><Button disabled={options.availableDates.length === 0}>Save changes</Button></div>
      </Form></PageCard>
    </div></PageShell>
  );
}
