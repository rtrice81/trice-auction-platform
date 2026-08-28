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

const runtime = env as unknown as { AUTH_SECRET?: string; BETTER_AUTH_URL?: string };

export async function loader({ request, params }: Route.LoaderArgs) {
  await requireRole(request, env.trice_auction_db, runtime, "admin");
  return { event: await getDropoffEventById(env.trice_auction_db, Number(params.id)) };
}

export async function action({ request, params }: Route.ActionArgs) {
  await requireRole(request, env.trice_auction_db, runtime, "admin");
  const eventId = Number(params.id);
  if (!Number.isInteger(eventId) || eventId < 1) throw new Response("Not Found", { status: 404 });
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "save");
  let result: ScheduleResult;
  if (intent === "save") result = await updateDropoffEvent(env.trice_auction_db, eventId, dropoffEventInputFromForm(form));
  else if (intent === "open" || intent === "close") result = await setDropoffEventOpen(env.trice_auction_db, eventId, intent === "open");
  else if (intent === "delete") result = await deleteDropoffEvent(env.trice_auction_db, eventId);
  else result = { ok: false, errors: ["Unknown event action."] };

  if (result.ok && intent === "delete") return redirect("/admin/schedule");
  return data(result, { status: result.ok ? 200 : 400 });
}

export default function DropoffEventDetail({ loaderData, actionData }: Route.ComponentProps) {
  const { event } = loaderData;
  return (
    <main className="mx-auto max-w-5xl p-8">
      <Link to="/admin/schedule">← Drop-Off Events</Link>
      <header className="mt-4 flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-3xl font-bold">{event.eventName || "Drop-Off Event"}</h1><p className="mt-1 text-stone-600">{event.date} · {event.isOpen ? "Open for bookings" : "Closed for bookings"}</p></div><Form method="post"><input type="hidden" name="intent" value={event.isOpen ? "close" : "open"} /><button className="rounded border px-3 py-2">{event.isOpen ? "Close event" : "Open event"}</button></Form></header>
      {actionData?.ok ? <p className="mt-4 rounded border border-emerald-200 bg-emerald-50 p-3" role="status">{actionData.message}</p> : null}
      {actionData && !actionData.ok ? <p className="mt-4 rounded border border-red-200 bg-red-50 p-3" role="alert">{actionData.errors.join(" ")}</p> : null}
      <Form method="post" className="mt-6 rounded border bg-white p-6"><input type="hidden" name="intent" value="save" /><DropoffEventForm event={event} submitLabel="Save event changes" includeDate={false} /></Form>
      <section className="mt-8"><h2 className="text-2xl font-bold">Appointments</h2>{event.appointments.length === 0 ? <p className="mt-3 text-stone-600">No appointments are scheduled for this event.</p> : <ul className="mt-3 divide-y rounded border">{event.appointments.map((appointment) => <li key={appointment.id} className="flex flex-wrap justify-between gap-3 p-3"><span>{appointment.time || "Time TBD"} · {appointment.customer}</span><span>{appointment.loadType} · {appointment.capacityPoints} points · {appointment.status}</span></li>)}</ul>}</section>
      <section className="mt-8 rounded border border-red-200 bg-red-50 p-5"><h2 className="font-bold">Delete event</h2><p className="mt-1 text-sm">Deletion is available only when this event has no appointments. Otherwise close it to preserve operational history.</p><Form method="post" className="mt-3"><input type="hidden" name="intent" value="delete" /><button className="text-sm font-semibold text-red-800 underline">Delete Drop-Off Event</button></Form></section>
    </main>
  );
}
