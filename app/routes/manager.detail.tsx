import { env } from "cloudflare:workers";
import { data, Form, Link, redirect } from "react-router";
import type { Route } from "./+types/manager.detail";
import {
  createAppointmentOverrideAuditStatement,
  getAppointmentOverrideHistory,
} from "../services/appointment-override-audit.server";
import { requireAnyRole } from "../services/auth.server";
import { ConfirmationForm } from "../components/confirmation-form";
import {
  createBooking,
  getBookingOptions,
  getBookingUpdateStatements,
  type BookingInput,
  validateBooking,
} from "../services/booking.server";
import { cancelScheduledAppointment, queueAppointmentRescheduled } from "../services/notification.server";

const runtime = env as unknown as {
  AUTH_SECRET?: string;
  BETTER_AUTH_URL?: string;
};

type AppointmentForAction = {
  id: number;
  userId: number;
  date: string;
  typeId: number;
  description: string | null;
  status: string;
  customer: string;
};

type AppointmentDetailRequestArgs = {
  request: Request;
  params: Readonly<Record<string, string | undefined>>;
};

export async function loader({ request, params }: AppointmentDetailRequestArgs) {
  await requireAnyRole(request, env.trice_auction_db, runtime, ["manager", "admin"]);

  const appointmentId = Number(params.id);
  const appointment = await getAppointment(env.trice_auction_db, appointmentId);
  if (!appointment) throw new Response("Not Found", { status: 404 });

  const [allocationResult, options, overrideHistory] = await Promise.all([
    getAllocations(env.trice_auction_db, appointment.id),
    getBookingOptions(env.trice_auction_db),
    getAppointmentOverrideHistory(env.trice_auction_db, appointment.id),
  ]);

  return { appointment, allocations: allocationResult, options, overrideHistory };
}

export async function action({ request, params }: AppointmentDetailRequestArgs) {
  const actor = await requireAnyRole(request, env.trice_auction_db, runtime, ["manager", "admin"]);
  if (actor.role !== "manager" && actor.role !== "admin") {
    throw new Response("Forbidden", { status: 403 });
  }

  const appointmentId = Number(params.id);
  const appointment = await getAppointment(env.trice_auction_db, appointmentId);
  if (!appointment) throw new Response("Not Found", { status: 404 });

  const form = await request.formData();
  const adminDetailPath = form.get("returnTo") === `/admin/appointments/${appointmentId}`
    ? `/admin/appointments/${appointmentId}`
    : null;
  if (form.get("cancel") === "1") {
    const result = await cancelScheduledAppointment(env.trice_auction_db, appointmentId, env as never);
    if (!result.cancelled) return data({ ok: false, message: "This appointment is already cancelled or no longer scheduled." }, { status: 400 });
    return data({ ok: true, message: "Cancelled" });
  }

  const input = bookingInputFromForm(form, appointment);
  const changed = input.appointmentDate !== appointment.date || input.dropoffTypeId !== appointment.typeId;
  if (form.get("intent") !== "override") {
    const result = await createBooking(env.trice_auction_db, input);
    if (result.ok && changed) await queueAppointmentRescheduled(env.trice_auction_db, appointmentId);
    if (result.ok && adminDetailPath) return redirect(`${adminDetailPath}?updated=1`);
    return data(result.ok ? result : { ...result, submitted: input });
  }

  const reason = String(form.get("overrideReason") || "").trim();
  if (!reason) {
    return data(
      overrideFailure(["An override reason is required."], input),
      { status: 400 },
    );
  }

  // The current request is revalidated; no role, violation, or values are accepted from the client.
  const validation = await validateBooking(env.trice_auction_db, input);
  if (validation.ok) {
    const result = await createBooking(env.trice_auction_db, input);
    if (result.ok && changed) await queueAppointmentRescheduled(env.trice_auction_db, appointmentId);
    if (result.ok && adminDetailPath) return redirect(`${adminDetailPath}?updated=1`);
    return data(result.ok ? result : { ...result, submitted: input });
  }
  if (!hasOnlyOverridableViolations(validation.errors, validation.overridableViolations)) {
    return data({ ...validation, submitted: input }, { status: 400 });
  }
  if (!validation.dropoffType) {
    return data({ ...validation, submitted: input }, { status: 400 });
  }

  const previousAllocations = await getAllocations(env.trice_auction_db, appointmentId);
  const auditStatement = createAppointmentOverrideAuditStatement(env.trice_auction_db, {
    appointmentId,
    actorUserId: actor.id,
    actorRole: actor.role,
    reason,
    violatedRules: validation.overridableViolations,
    previousValues: {
      appointment,
      allocations: previousAllocations,
    },
    requestedValues: {
      appointmentDate: input.appointmentDate,
      dropoffTypeId: input.dropoffTypeId,
      description: input.description || null,
      allocations: input.allocations,
    },
    capacityContext: validation.capacityContext,
  });

  // D1 batches execute atomically, so an overridden edit cannot commit without its audit row.
  await env.trice_auction_db.batch([
    auditStatement,
    ...getBookingUpdateStatements(env.trice_auction_db, input, validation.dropoffType),
  ]);
  if (changed) await queueAppointmentRescheduled(env.trice_auction_db, appointmentId);

  if (adminDetailPath) return redirect(`${adminDetailPath}?updated=1`);

  return data({
    ok: true,
    message: "Appointment updated with a recorded capacity override.",
  });
}

type AppointmentManagementDetailProps = Pick<
  Route.ComponentProps,
  "loaderData" | "actionData"
> & {
  backTo?: string;
  backLabel?: string;
  returnTo?: string;
};

export function AppointmentManagementDetail({
  loaderData,
  actionData,
  backTo = "/manager",
  backLabel = "← Manager",
  returnTo,
}: AppointmentManagementDetailProps) {
  const { appointment, options, allocations, overrideHistory } = loaderData;
  const validationFailure = actionData && "errors" in actionData ? actionData : null;
  const canOverride =
    validationFailure &&
    "submitted" in validationFailure &&
    hasOnlyOverridableViolations(
      validationFailure.errors,
      validationFailure.overridableViolations,
    );

  return (
    <main className="ta-page"><div className="max-w-4xl">
      <Link to={backTo} className="ta-button ta-button-secondary">{backLabel}</Link>

      <header className="mt-6 border-b border-[#d7d9dc] pb-6"><p className="ta-eyebrow">Appointment management</p><h1 className="text-3xl font-bold tracking-tight text-[#25272b]">Edit Appointment #{appointment.id}</h1></header>

      {actionData && actionData.ok ? <p role="status">{actionData.message}</p> : null}
      {validationFailure ? (
        <section className="mt-4 border border-red-500 p-4" role="alert">
          <p className="font-bold">This appointment could not be saved.</p>
          <ul className="mt-2 list-disc pl-5">
            {validationFailure.errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <Form method="post" className="mt-6 space-y-4 rounded-xl border border-[#dfe1e4] bg-[#f8f9fa] p-5 shadow-sm sm:p-6">
        <input type="hidden" name="intent" value="save" />
        {returnTo ? <input type="hidden" name="returnTo" value={returnTo} /> : null}
        <label className="ta-field">Date<input name="date" type="date" defaultValue={appointment.date} /></label>
        <label className="ta-field">Load type<select name="typeId" defaultValue={appointment.typeId}>
          {options.dropoffTypes.map((type) => (
            <option key={type.id} value={type.id}>
              {type.name}
            </option>
          ))}
        </select></label>
        {options.itemAreas.map((area) => (
          <label key={area.id} className="ta-field">
            {area.name}
            <input
              name={`allocation-${area.id}`}
              defaultValue={
                allocations.find((allocation) => allocation.id === area.id)?.percentage || 0
              }
            />
          </label>
        ))}
        <label className="ta-field">Description<textarea name="description" defaultValue={appointment.description || ""} /></label>
        <button className="ta-button ta-button-primary">Save Changes</button>
      </Form>

      {canOverride ? (
        <section className="mt-5 border-2 border-amber-500 bg-amber-50 p-4" aria-labelledby="override-heading">
          <h2 id="override-heading" className="text-xl font-bold">
            Capacity override required
          </h2>
          <p className="mt-2">
            This change exceeds normal booking rules. Submitting an override records the
            acting manager or admin, reason, affected rules, before/after values, and current
            capacity context.
          </p>
          <Form method="post" className="mt-3 space-y-3">
            <input type="hidden" name="intent" value="override" />
            {returnTo ? <input type="hidden" name="returnTo" value={returnTo} /> : null}
            <input type="hidden" name="date" value={validationFailure.submitted.appointmentDate} />
            <input type="hidden" name="typeId" value={validationFailure.submitted.dropoffTypeId} />
            <input type="hidden" name="description" value={validationFailure.submitted.description} />
            {validationFailure.submitted.allocations.map((allocation) => (
              <input
                key={allocation.itemAreaId}
                type="hidden"
                name={`allocation-${allocation.itemAreaId}`}
                value={allocation.percentage}
              />
            ))}
            <label className="block">
              Override reason
              <textarea name="overrideReason" required />
            </label>
            <button>Record override and save appointment</button>
          </Form>
        </section>
      ) : null}

      <ConfirmationForm method="post" className="mt-4" confirmation={{ title: "Cancel drop-off appointment?", description: <><p>Are you sure you want to cancel this drop-off appointment?</p><p className="mt-2 text-sm">{appointment.customer} · {appointment.date}</p></>, confirmLabel: "Cancel appointment", destructive: true }}>
        <input type="hidden" name="cancel" value="1" />
        <button className="ta-button ta-button-destructive">Cancel appointment</button>
      </ConfirmationForm>

      <section className="mt-10" aria-labelledby="override-history-heading">
        <h2 id="override-history-heading" className="text-2xl font-bold">
          Override history
        </h2>
        <p className="mt-1 text-sm">Read-only record of capacity-rule overrides.</p>
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
    </div></main>
  );
}

export default function Detail(props: Route.ComponentProps) {
  return <AppointmentManagementDetail {...props} />;
}

function bookingInputFromForm(form: FormData, appointment: AppointmentForAction): BookingInput & {
  appointmentId: number;
} {
  return {
    appointmentId: appointment.id,
    userId: appointment.userId,
    appointmentDate: String(form.get("date")),
    dropoffTypeId: Number(form.get("typeId")),
    description: String(form.get("description") || ""),
    allocations: Array.from(form.entries())
      .filter(([key]) => key.startsWith("allocation-"))
      .map(([key, value]) => ({
        itemAreaId: Number(key.slice("allocation-".length)),
        percentage: Number(value),
      })),
  };
}

function hasOnlyOverridableViolations(errors: string[], overridableViolations: string[]) {
  return (
    overridableViolations.length > 0 &&
    errors.length > 0 &&
    errors.every((error) => overridableViolations.includes(error))
  );
}

function overrideFailure(errors: string[], submitted: BookingInput) {
  return {
    ok: false as const,
    errors,
    overridableViolations: [],
    capacityContext: null,
    submitted,
  };
}

async function getAppointment(db: D1Database, appointmentId: number) {
  return db
    .prepare(
      `SELECT
        appointments.id AS id,
        user_id AS userId,
        appointment_date AS date,
        dropoff_type_id AS typeId,
        description,
        status,
        COALESCE(NULLIF(TRIM(users.first_name || ' ' || users.last_name), ''), users.email) AS customer
      FROM appointments
      JOIN users ON users.id = appointments.user_id
      WHERE appointments.id = ?`,
    )
    .bind(appointmentId)
    .first<AppointmentForAction>();
}

async function getAllocations(db: D1Database, appointmentId: number) {
  const result = await db
    .prepare(
      `SELECT item_area_id AS id, allocation_percent AS percentage
       FROM appointment_area_allocations
       WHERE appointment_id = ?`,
    )
    .bind(appointmentId)
    .all<{ id: number; percentage: number }>();
  return result.results;
}
