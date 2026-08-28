import { env } from "cloudflare:workers";
import { data, Form, Link } from "react-router";
import type { Route } from "./+types/my-appointments.detail";
import { requireOwnership, requireUser } from "../services/auth.server";
import { createBooking, getBookingOptions } from "../services/booking.server";

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
  return { appointment, allocations, options: await getBookingOptions(env.trice_auction_db) };
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
    <main className="mx-auto max-w-2xl p-8">
      <Link to="/my-appointments">← My Appointments</Link>
      <h1 className="mt-4 text-3xl font-bold">Edit appointment</h1>
      {actionData && !actionData.ok ? <p className="mt-3" role="alert">{actionData.errors.join(" ")}</p> : null}
      <Form method="post" className="mt-5 space-y-3">
        <label className="block">Drop-off date
          <select name="appointmentDate" defaultValue={appointment.appointmentDate} className="ml-2 border p-2">
            {options.availableDates.map((date) => <option key={date.date} value={date.date}>{date.date}</option>)}
          </select>
        </label>
        {!options.availableDates.some((date) => date.date === appointment.appointmentDate) ? <p className="text-sm" role="status">This appointment’s current date is no longer bookable. Choose an open configured date to save changes.</p> : null}
        <input type="time" name="appointmentTime" defaultValue={appointment.appointmentTime ?? ""} />
        <select name="dropoffTypeId" defaultValue={appointment.dropoffTypeId}>
          {options.dropoffTypes.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}
        </select>
        {options.itemAreas.map((area) => <label key={area.id}>{area.name}<input name={`allocation-${area.id}`} type="number" defaultValue={allocations.find((allocation: any) => allocation.itemAreaId === area.id)?.percentage ?? 0} />%</label>)}
        <textarea name="description" defaultValue={appointment.description ?? ""} />
        <button disabled={options.availableDates.length === 0}>Save changes</button>
      </Form>
    </main>
  );
}
