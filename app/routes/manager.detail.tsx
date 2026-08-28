import { env } from "cloudflare:workers";
import { data, Form, Link } from "react-router";
import type { Route } from "./+types/manager.detail";
import { requireAnyRole } from "../services/auth.server";
import { getAppointmentOverrideHistory } from "../services/appointment-override-audit.server";
import { createBooking, getBookingOptions } from "../services/booking.server";

const runtime = env as unknown as {
  AUTH_SECRET?: string;
  BETTER_AUTH_URL?: string;
};

export async function loader({ request, params }: Route.LoaderArgs) {
  await requireAnyRole(request, env.trice_auction_db, runtime, ["manager", "admin"]);

  const appointmentId = Number(params.id);
  const appointment = await env.trice_auction_db
    .prepare(
      `SELECT
        id,
        user_id AS userId,
        appointment_date AS date,
        appointment_time AS time,
        dropoff_type_id AS typeId,
        description,
        status
      FROM appointments
      WHERE id = ?`,
    )
    .bind(appointmentId)
    .first<{
      id: number;
      userId: number;
      date: string;
      time: string | null;
      typeId: number;
      description: string | null;
      status: string;
    }>();
  if (!appointment) throw new Response("Not Found", { status: 404 });

  const [allocationResult, options, overrideHistory] = await Promise.all([
    env.trice_auction_db
      .prepare(
        `SELECT item_area_id AS id, allocation_percent AS percentage
         FROM appointment_area_allocations
         WHERE appointment_id = ?`,
      )
      .bind(appointment.id)
      .all<{ id: number; percentage: number }>(),
    getBookingOptions(env.trice_auction_db),
    getAppointmentOverrideHistory(env.trice_auction_db, appointment.id),
  ]);

  return { appointment, allocations: allocationResult.results, options, overrideHistory };
}

export async function action({ request, params }: Route.ActionArgs) {
  await requireAnyRole(request, env.trice_auction_db, runtime, ["manager", "admin"]);

  const appointmentId = Number(params.id);
  const appointment = await env.trice_auction_db
    .prepare("SELECT user_id AS userId FROM appointments WHERE id = ?")
    .bind(appointmentId)
    .first<{ userId: number }>();
  if (!appointment) throw new Response("Not Found", { status: 404 });

  const form = await request.formData();
  if (form.get("cancel") === "1") {
    await env.trice_auction_db
      .prepare("UPDATE appointments SET status = 'cancelled' WHERE id = ?")
      .bind(appointmentId)
      .run();
    return data({ ok: true, message: "Cancelled" });
  }

  const allocations = Array.from(form.entries())
    .filter(([key]) => key.startsWith("allocation-"))
    .map(([key, value]) => ({
      itemAreaId: Number(key.slice("allocation-".length)),
      percentage: Number(value),
    }));

  return data(
    await createBooking(env.trice_auction_db, {
      appointmentId,
      userId: appointment.userId,
      appointmentDate: String(form.get("date")),
      appointmentTime: String(form.get("time") || ""),
      dropoffTypeId: Number(form.get("typeId")),
      description: String(form.get("description") || ""),
      allocations,
    }),
  );
}

export default function Detail({ loaderData }: Route.ComponentProps) {
  const { appointment, options, allocations, overrideHistory } = loaderData;

  return (
    <main className="mx-auto max-w-4xl p-8">
      <Link to="/manager">← Manager</Link>

      <h1 className="mt-4 text-3xl font-bold">Appointment #{appointment.id}</h1>

      <Form method="post" className="mt-5 space-y-3">
        <input name="date" type="date" defaultValue={appointment.date} />
        <input name="time" type="time" defaultValue={appointment.time || ""} />
        <select name="typeId" defaultValue={appointment.typeId}>
          {options.dropoffTypes.map((type) => (
            <option key={type.id} value={type.id}>
              {type.name}
            </option>
          ))}
        </select>
        {options.itemAreas.map((area) => (
          <label key={area.id} className="block">
            {area.name}
            <input
              name={`allocation-${area.id}`}
              defaultValue={
                allocations.find((allocation) => allocation.id === area.id)?.percentage || 0
              }
            />
          </label>
        ))}
        <textarea name="description" defaultValue={appointment.description || ""} />
        <button>Save</button>
      </Form>

      <Form method="post" className="mt-4">
        <input type="hidden" name="cancel" value="1" />
        <button>Cancel appointment</button>
      </Form>

      <section className="mt-10" aria-labelledby="override-history-heading">
        <h2 id="override-history-heading" className="text-2xl font-bold">
          Override history
        </h2>
        <p className="mt-1 text-sm">
          This is a read-only record of future capacity-rule overrides.
        </p>
        {overrideHistory.length === 0 ? (
          <p className="mt-4">No override history has been recorded for this appointment.</p>
        ) : (
          <ol className="mt-4 space-y-4">
            {overrideHistory.map((entry) => (
              <li key={entry.id} className="border p-4">
                <p>
                  <strong>{entry.occurredAt}</strong> · {entry.actorRole} #{entry.actorUserId}
                </p>
                <p className="mt-2">{entry.reason}</p>
                <p className="mt-2">
                  <strong>Violated rules:</strong>{" "}
                  {entry.violatedRules.length > 0
                    ? entry.violatedRules.join(", ")
                    : "None recorded"}
                </p>
                <details className="mt-2">
                  <summary>Audit context</summary>
                  <pre className="mt-2 overflow-x-auto text-xs">
                    {JSON.stringify(
                      {
                        previousValues: entry.previousValues,
                        requestedValues: entry.requestedValues,
                        capacityContext: entry.capacityContext,
                      },
                      null,
                      2,
                    )}
                  </pre>
                </details>
              </li>
            ))}
          </ol>
        )}
      </section>
    </main>
  );
}
