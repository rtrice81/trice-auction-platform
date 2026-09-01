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
  const [bookingEvent, bookingEvents] = await Promise.all([Number.isInteger(bookingEventId) && bookingEventId > 0 ? env.trice_auction_db.prepare("SELECT id, name FROM booking_events WHERE id = ?").bind(bookingEventId).first<{id:number;name:string}>() : null, env.trice_auction_db.prepare("SELECT id, name FROM booking_events ORDER BY opens_at DESC").all<{id:number;name:string}>()]);
  // A public child date is operationally enabled by default. Its parent Booking
  // Event still controls when customers can begin signing up.
  return { event: { date: today(), eventName: null, visibility: bookingEvent ? "public" as const : "private" as const, isOpen: true, note: null, ...defaults }, bookingEvent, bookingEvents: bookingEvents.results };
}

export async function action({ request }: Route.ActionArgs) {
  await requireRole(request, env.trice_auction_db, runtime, "admin");
  const form = await request.formData();
  const bookingEventId = Number(form.get("bookingEventId"));
  const input = dropoffEventInputFromForm(form);
  if (input.visibility === "public" && (!Number.isInteger(bookingEventId) || bookingEventId < 1)) return data({ ok: false as const, errors: ["Choose a Booking Event for a public Drop-Off Date."] }, { status: 400 });
  if (input.visibility === "public") { const bookingEvent = await env.trice_auction_db.prepare("SELECT id FROM booking_events WHERE id = ?").bind(bookingEventId).first<{id:number}>(); if (!bookingEvent) return data({ ok: false as const, errors: ["Choose a valid Booking Event for this public date."] }, { status: 400 }); }
  const result = await createDropoffEvent(env.trice_auction_db, input);
  if (!result.ok) return data(result, { status: 400 });
  if (input.visibility === "public") await env.trice_auction_db.prepare("INSERT INTO booking_event_dropoff_dates (booking_event_id, dropoff_day_id) VALUES (?, ?)").bind(bookingEventId, result.eventId).run();
  return redirect(input.visibility === "public" ? `/admin/booking-events/${bookingEventId}` : `/admin/schedule/${result.eventId}`);
}

export default function NewDropoffEvent({ loaderData, actionData }: Route.ComponentProps) {
  return (
    <main className="mx-auto max-w-5xl p-8">
      <Link to={loaderData.bookingEvent ? `/admin/booking-events/${loaderData.bookingEvent.id}` : "/admin/schedule"}>← {loaderData.bookingEvent ? loaderData.bookingEvent.name : "Drop-Off Events"}</Link>
      <h1 className="mt-4 text-3xl font-bold">New Drop-Off Event</h1>
      <p className="mt-2 text-stone-600">Global capacity settings are pre-filled as a template. Public dates are added to a Booking Event; private/internal dates are available only for staff scheduling.</p>
      {actionData && !actionData.ok ? <p className="mt-4 rounded border border-red-200 bg-red-50 p-3" role="alert">{actionData.errors.join(" ")}</p> : null}
      <Form method="post" className="mt-6 rounded border bg-white p-6">{loaderData.bookingEvent ? <input type="hidden" name="bookingEventId" value={loaderData.bookingEvent.id}/> : <label className="mb-5 block text-sm font-semibold">Booking Event <span className="font-normal text-stone-500">(required only for Public visibility)</span><select name="bookingEventId" className="mt-1 block w-full rounded border border-stone-300 p-2"><option value="">No Booking Event — Private / Internal</option>{loaderData.bookingEvents.map(event => <option key={event.id} value={event.id}>{event.name}</option>)}</select></label>}<DropoffEventForm event={loaderData.event} submitLabel="Save Drop-Off Event" /></Form>
    </main>
  );
}

function today() {
  return new Date().toISOString().slice(0, 10);
}
