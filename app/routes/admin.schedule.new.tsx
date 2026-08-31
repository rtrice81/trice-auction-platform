import { env } from "cloudflare:workers";
import { data, Form, Link, redirect } from "react-router";
import type { Route } from "./+types/admin.schedule.new";
import { DropoffEventForm } from "../components/dropoff-event-form";
import { requireRole } from "../services/auth.server";
import {
  createDropoffEvent,
  dropoffEventInputFromForm,
  getEventFormDefaults,
} from "../services/schedule-management.server";

const runtime = env as unknown as { AUTH_SECRET?: string; BETTER_AUTH_URL?: string };

export function meta() {
  return [{ title: "New Drop-Off Event | Trice Auctions" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireRole(request, env.trice_auction_db, runtime, "admin");
  const defaults = await getEventFormDefaults(env.trice_auction_db);
  const bookingEventId = Number(new URL(request.url).searchParams.get("bookingEventId"));
  const bookingEvent = Number.isInteger(bookingEventId) && bookingEventId > 0 ? await env.trice_auction_db.prepare("SELECT id, name FROM booking_events WHERE id = ?").bind(bookingEventId).first<{id:number;name:string}>() : null;
  return { event: { date: today(), eventName: null, isOpen: false, note: null, ...defaults }, bookingEvent };
}

export async function action({ request }: Route.ActionArgs) {
  await requireRole(request, env.trice_auction_db, runtime, "admin");
  const form = await request.formData();
  const bookingEventId = Number(form.get("bookingEventId"));
  const result = await createDropoffEvent(env.trice_auction_db, dropoffEventInputFromForm(form));
  if (!result.ok) return data(result, { status: 400 });
  if (Number.isInteger(bookingEventId) && bookingEventId > 0) await env.trice_auction_db.prepare("INSERT INTO booking_event_dropoff_dates (booking_event_id, dropoff_day_id) VALUES (?, ?)").bind(bookingEventId, result.eventId).run();
  return redirect(Number.isInteger(bookingEventId) && bookingEventId > 0 ? `/admin/booking-events/${bookingEventId}` : `/admin/schedule/${result.eventId}`);
}

export default function NewDropoffEvent({ loaderData, actionData }: Route.ComponentProps) {
  return (
    <main className="mx-auto max-w-5xl p-8">
      <Link to={loaderData.bookingEvent ? `/admin/booking-events/${loaderData.bookingEvent.id}` : "/admin/schedule"}>← {loaderData.bookingEvent ? loaderData.bookingEvent.name : "Drop-Off Events"}</Link>
      <h1 className="mt-4 text-3xl font-bold">New Drop-Off Event</h1>
      <p className="mt-2 text-stone-600">Global capacity settings are pre-filled as a template. {loaderData.bookingEvent ? `This date will be added to ${loaderData.bookingEvent.name}.` : "Saving without a Booking Event creates a private/internal date that is not shown to customers."}</p>
      {actionData && !actionData.ok ? <p className="mt-4 rounded border border-red-200 bg-red-50 p-3" role="alert">{actionData.errors.join(" ")}</p> : null}
      <Form method="post" className="mt-6 rounded border bg-white p-6">{loaderData.bookingEvent ? <input type="hidden" name="bookingEventId" value={loaderData.bookingEvent.id}/> : null}<DropoffEventForm event={loaderData.event} submitLabel="Save Drop-Off Event" /></Form>
    </main>
  );
}

function today() {
  return new Date().toISOString().slice(0, 10);
}
