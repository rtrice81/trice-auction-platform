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
  return { event: { date: today(), eventName: null, isOpen: false, note: null, ...defaults } };
}

export async function action({ request }: Route.ActionArgs) {
  await requireRole(request, env.trice_auction_db, runtime, "admin");
  const result = await createDropoffEvent(env.trice_auction_db, dropoffEventInputFromForm(await request.formData()));
  if (!result.ok) return data(result, { status: 400 });
  return redirect(`/admin/schedule/${result.eventId}`);
}

export default function NewDropoffEvent({ loaderData, actionData }: Route.ComponentProps) {
  return (
    <main className="mx-auto max-w-5xl p-8">
      <Link to="/admin/schedule">← Drop-Off Events</Link>
      <h1 className="mt-4 text-3xl font-bold">New Drop-Off Event</h1>
      <p className="mt-2 text-stone-600">Global capacity settings are pre-filled as a template. Saving creates this event; only saved, open future/current events are offered to customers.</p>
      {actionData && !actionData.ok ? <p className="mt-4 rounded border border-red-200 bg-red-50 p-3" role="alert">{actionData.errors.join(" ")}</p> : null}
      <Form method="post" className="mt-6 rounded border bg-white p-6"><DropoffEventForm event={loaderData.event} submitLabel="Save Drop-Off Event" /></Form>
    </main>
  );
}

function today() {
  return new Date().toISOString().slice(0, 10);
}
