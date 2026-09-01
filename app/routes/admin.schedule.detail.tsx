import { env } from "cloudflare:workers";
import { data, Form, Link, redirect } from "react-router";
import type { Route } from "./+types/admin.schedule.detail";
import { DropoffEventForm } from "../components/dropoff-event-form";
import { requireRole } from "../services/auth.server";
import {
  deleteDropoffEvent,
  dropoffEventInputFromForm,
  getDropoffEventById,
  setDropoffEventOpen,
  updateDropoffEvent,
  type ScheduleResult,
} from "../services/schedule-management.server";
import { queueEventOperationalNotification } from "../services/notification.server";
import { ConfirmationForm } from "../components/confirmation-form";
import { AppointmentSummaryList } from "../components/admin-appointment-summary";
import { AddAppointmentModal } from "../components/add-appointment-modal";
import { getBookingOptions } from "../services/booking.server";
import { useState } from "react";

const runtime = env as unknown as { AUTH_SECRET?: string; BETTER_AUTH_URL?: string };

export async function loader({ request, params }: Route.LoaderArgs) {
  await requireRole(request, env.trice_auction_db, runtime, "admin");
  const [event, appointmentOptions] = await Promise.all([
    getDropoffEventById(env.trice_auction_db, Number(params.id)),
    getBookingOptions(env.trice_auction_db, { adminScheduling: true }),
  ]);
  return { event, appointmentOptions, created: new URL(request.url).searchParams.has("created") };
}

export async function action({ request, params }: Route.ActionArgs) {
  const actor = await requireRole(request, env.trice_auction_db, runtime, "admin");
  const eventId = Number(params.id);
  if (!Number.isInteger(eventId) || eventId < 1) throw new Response("Not Found", { status: 404 });
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "save");
  let result: ScheduleResult;
  if (intent === "save") result = await updateDropoffEvent(env.trice_auction_db, eventId, dropoffEventInputFromForm(form));
  else if (intent === "open" || intent === "close") { result = await setDropoffEventOpen(env.trice_auction_db, eventId, intent === "open"); if (result.ok && intent === "close") { const event = await getDropoffEventById(env.trice_auction_db, eventId); if (event && event.appointments.length) await queueEventOperationalNotification(env.trice_auction_db, { eventName: event.eventName || "Drop-Off Event", date: event.date, appointmentCount: event.appointments.length, actor: actor.name, adminUrl: `/admin/schedule/${eventId}` }); } }
  else if (intent === "delete") result = await deleteDropoffEvent(env.trice_auction_db, eventId);
  else result = { ok: false, errors: ["Unknown event action."] };

  if (result.ok && intent === "delete") return redirect("/admin/schedule");
  return data(result, { status: result.ok ? 200 : 400 });
}

export default function DropoffEventDetail({ loaderData, actionData }: Route.ComponentProps) {
  const { event } = loaderData;
  const [appointmentMessage, setAppointmentMessage] = useState<string | null>(null);
  return (
    <main className="mx-auto max-w-5xl p-8">
      <Link to="/admin/schedule">← Drop-Off Events</Link>
      <header className="mt-4 flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-3xl font-bold">{event.eventName || "Drop-Off Event"}</h1><p className="mt-1 text-stone-600">{event.date} · {event.visibility === "private" ? "Private / Internal" : "Public"} · {event.isOpen ? "Open for bookings" : "Closed for bookings"}</p></div><Form method="post"><input type="hidden" name="intent" value={event.isOpen ? "close" : "open"} /><button className="rounded border px-3 py-2">{event.isOpen ? "Close event" : "Open event"}</button></Form></header>
      {loaderData.created ? <p className="mt-4 rounded border border-emerald-200 bg-emerald-50 p-3" role="status">Appointment created and added to this Drop-Off Date.</p> : null}
      {actionData?.ok ? <p className="mt-4 rounded border border-emerald-200 bg-emerald-50 p-3" role="status">{actionData.message}</p> : null}
      {actionData && !actionData.ok ? <p className="mt-4 rounded border border-red-200 bg-red-50 p-3" role="alert">{actionData.errors.join(" ")}</p> : null}
      <Form method="post" className="mt-6 rounded border bg-white p-6"><input type="hidden" name="intent" value="save" /><DropoffEventForm event={event} submitLabel="Save event changes" includeDate={false} /></Form>
      <section id="appointments" className="mt-8"><div className="flex flex-wrap items-center justify-between gap-4"><h2 className="text-2xl font-bold">Appointments</h2><AddAppointmentModal scheduleId={event.id} appointmentDate={event.date} options={loaderData.appointmentOptions} onCreated={setAppointmentMessage}/></div>{appointmentMessage ? <p className="mt-4 rounded border border-emerald-200 bg-emerald-50 p-3" role="status">{appointmentMessage}</p> : null}{event.visibility === "private" ? <p className="mt-2 text-sm text-stone-600">Create one appointment per assigned customer. Private dates are never available for customer self-booking.</p> : null}<div className="mt-3"><AppointmentSummaryList appointments={event.appointments}/></div></section>
      <section className="mt-8 rounded border border-red-200 bg-red-50 p-5"><h2 className="font-bold">Delete event</h2><p className="mt-1 text-sm">Deletion is available only when this event has no appointments. Otherwise close it to preserve operational history.</p><ConfirmationForm method="post" className="mt-3" confirmation={{ title: "Permanently delete Drop-Off Event?", description: <>Are you sure you want to permanently delete this item? This action cannot be undone.<p className="mt-2 text-sm">{event.eventName || "Drop-Off Event"} · {event.date}</p></>, confirmLabel: "Permanently delete", destructive: true }}><input type="hidden" name="intent" value="delete" /><button className="text-sm font-semibold text-red-800 underline">Delete Drop-Off Event</button></ConfirmationForm></section>
    </main>
  );
}
