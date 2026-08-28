import { env } from "cloudflare:workers";
import { data, Form, Link } from "react-router";
import type { Route } from "./+types/admin.schedule";
import { requireRole } from "../services/auth.server";
import {
  deleteDropoffEvent,
  getDropoffEvents,
  setDropoffEventOpen,
  type ScheduleResult,
} from "../services/schedule-management.server";

const runtime = env as unknown as { AUTH_SECRET?: string; BETTER_AUTH_URL?: string };

export function meta() {
  return [{ title: "Drop-Off Events | Trice Auctions" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireRole(request, env.trice_auction_db, runtime, "admin");
  return { events: await getDropoffEvents(env.trice_auction_db) };
}

export async function action({ request }: Route.ActionArgs) {
  await requireRole(request, env.trice_auction_db, runtime, "admin");
  const form = await request.formData();
  const eventId = Number(form.get("eventId"));
  const intent = String(form.get("intent") ?? "");
  let result: ScheduleResult;
  if (!Number.isInteger(eventId) || eventId < 1) result = { ok: false, errors: ["Choose a valid Drop-Off Event."] };
  else if (intent === "open" || intent === "close") result = await setDropoffEventOpen(env.trice_auction_db, eventId, intent === "open");
  else if (intent === "delete") result = await deleteDropoffEvent(env.trice_auction_db, eventId);
  else result = { ok: false, errors: ["Unknown event action."] };
  return data(result, { status: result.ok ? 200 : 400 });
}

export default function AdminSchedule({ loaderData, actionData }: Route.ComponentProps) {
  return (
    <main className="min-h-screen bg-stone-50 text-stone-900">
      <div className="mx-auto max-w-7xl px-6 py-12">
        <header className="flex flex-wrap items-end justify-between gap-5 border-b border-stone-200 pb-8"><div><p className="text-sm font-semibold tracking-[0.18em] text-amber-700 uppercase">Trice Auctions · Administration</p><h1 className="mt-2 text-4xl font-bold">Drop-Off Events</h1><p className="mt-2 text-stone-600">Only saved, open future/current events are visible to customers.</p></div><div className="flex flex-wrap gap-4"><Link to="/admin/users" className="font-semibold text-amber-800">Users</Link><Link to="/admin/capacity" className="font-semibold text-amber-800">Capacity settings</Link><Link to="/admin/schedule/new" className="rounded bg-stone-900 px-4 py-2 font-semibold text-white">New Drop-Off Event</Link></div></header>
        {actionData?.ok ? <p className="mt-5 rounded border border-emerald-200 bg-emerald-50 p-3" role="status">{actionData.message}</p> : null}
        {actionData && !actionData.ok ? <p className="mt-5 rounded border border-red-200 bg-red-50 p-3" role="alert">{actionData.errors.join(" ")}</p> : null}
        {loaderData.events.length === 0 ? <section className="mt-8 rounded border border-dashed bg-white p-8"><h2 className="text-xl font-bold">No Drop-Off Events yet</h2><p className="mt-2 text-stone-600">Create and save an event before any customer can select a date.</p><Link to="/admin/schedule/new" className="mt-4 inline-block font-semibold text-amber-800 underline">Create the first event</Link></section> : <section className="mt-8 grid gap-5 lg:grid-cols-2">{loaderData.events.map((event) => <article key={event.id} className="rounded-xl border bg-white p-5 shadow-sm"><div className="flex flex-wrap justify-between gap-3"><div><h2 className="text-xl font-bold">{event.eventName || "Drop-Off Event"}</h2><p className="text-stone-600">{event.date}</p></div><span className={event.isOpen ? "font-semibold text-emerald-700" : "font-semibold text-red-700"}>{event.isOpen ? "Open" : "Closed"}</span></div><p className="mt-4 text-sm">{event.scheduledAppointments} scheduled · Daily {event.usedPoints} / {event.dailyCapacityPoints} used · {event.remainingPoints} remaining</p><ul className="mt-3 space-y-1 text-sm">{event.areas.map((area) => <li key={area.itemAreaId}>{area.name}: {area.usedPoints} / {area.capacityPoints} used · {area.remainingPoints} remaining{area.overflowAllowancePoints > 0 ? ` · overflow ${area.overflowUsagePoints} / ${area.overflowAllowancePoints}` : ""}</li>)}</ul>{event.note ? <p className="mt-3 text-sm text-stone-600">Note: {event.note}</p> : null}<div className="mt-5 flex flex-wrap gap-4"><Link to={`/admin/schedule/${event.id}`} className="font-semibold text-amber-800 underline">View / Edit</Link><Form method="post"><input type="hidden" name="eventId" value={event.id} /><input type="hidden" name="intent" value={event.isOpen ? "close" : "open"} /><button className="font-semibold underline">{event.isOpen ? "Close" : "Open"}</button></Form>{event.appointments.length === 0 ? <Form method="post"><input type="hidden" name="eventId" value={event.id} /><input type="hidden" name="intent" value="delete" /><button className="font-semibold text-red-800 underline">Delete</button></Form> : null}</div></article>)}</section>}
      </div>
    </main>
  );
}
