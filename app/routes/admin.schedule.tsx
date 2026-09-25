import { env } from "cloudflare:workers";
import { data, Form, Link } from "react-router";
import type { Route } from "./+types/admin.schedule";
import { requireRole } from "../services/auth.server";
import { deleteDropoffEvent, getDropoffEvents, setDropoffEventOpen, type ScheduleResult } from "../services/schedule-management.server";
import { ConfirmationForm } from "../components/confirmation-form";
import { Button, Notice, PageCard, PageIntro, PageShell } from "../components/design-system";
import { queueEventOperationalNotification } from "../services/notification.server";
import { adminArchiveView, dropoffDateArchiveStatus, sortDropoffEventsForArchiveView } from "../lib/booking-event-archive.js";

const runtime = env as unknown as { AUTH_SECRET?: string; BETTER_AUTH_URL?: string };
type VisibilityFilter = "all" | "public" | "private";

export function meta() { return [{ title: "Drop-Off Events | Trice Auctions" }]; }

export async function loader({ request }: Route.LoaderArgs) {
  await requireRole(request, env.trice_auction_db, runtime, "admin");
  const url = new URL(request.url);
  const visibilityParam = url.searchParams.get("visibility");
  const visibility: VisibilityFilter = visibilityParam === "public" || visibilityParam === "private" ? visibilityParam : "all";
  const view = adminArchiveView(url.searchParams.get("view"));
  const now = new Date();
  const events = sortDropoffEventsForArchiveView(
    (await getDropoffEvents(env.trice_auction_db))
      .map((event) => ({ ...event, archiveStatus: dropoffDateArchiveStatus(event.date, now) }))
      .filter((event) => event.archiveStatus === view && (visibility === "all" || event.visibility === visibility)),
    view,
  );
  return { visibility, view, events };
}

export async function action({ request }: Route.ActionArgs) {
  const actor = await requireRole(request, env.trice_auction_db, runtime, "admin");
  const form = await request.formData();
  const eventId = Number(form.get("eventId"));
  const intent = String(form.get("intent") ?? "");
  let result: ScheduleResult;
  if (!Number.isInteger(eventId) || eventId < 1) result = { ok: false, errors: ["Choose a valid Drop-Off Event."] };
  else if (intent === "open" || intent === "close") {
    const event = (await getDropoffEvents(env.trice_auction_db)).find((item) => item.id === eventId);
    result = await setDropoffEventOpen(env.trice_auction_db, eventId, intent === "open");
    if (result.ok && intent === "close" && event && event.scheduledAppointments > 0) await queueEventOperationalNotification(env.trice_auction_db, { eventName: event.eventName || "Drop-Off Event", date: event.date, appointmentCount: event.scheduledAppointments, actor: actor.name, adminUrl: `/admin/schedule/${eventId}` });
  } else if (intent === "delete") result = await deleteDropoffEvent(env.trice_auction_db, eventId);
  else result = { ok: false, errors: ["Unknown event action."] };
  return data(result, { status: result.ok ? 200 : 400 });
}

function scheduleUrl(view: "upcoming" | "archived", visibility: VisibilityFilter) {
  const params = new URLSearchParams();
  if (view === "archived") params.set("view", "archived");
  if (visibility !== "all") params.set("visibility", visibility);
  const query = params.toString();
  return query ? `/admin/schedule?${query}` : "/admin/schedule";
}

export default function AdminSchedule({ loaderData, actionData }: Route.ComponentProps) {
  const archived = loaderData.view === "archived";
  return <PageShell><div className="max-w-7xl"><PageIntro eyebrow="Trice Auctions · Administration" title="Drop-Off Events">Manage public and private dates, capacity, and booking availability.</PageIntro><nav className="mb-7 flex gap-2 border-b border-[#dfe1e4]" aria-label="Drop-Off Event views"><Link to={scheduleUrl("upcoming", loaderData.visibility)} aria-current={!archived ? "page" : undefined} className={`rounded-t-lg px-4 py-2 font-bold ${!archived ? "bg-[#9d302f] text-white" : "text-[#9d302f] underline"}`}>Upcoming</Link><Link to={scheduleUrl("archived", loaderData.visibility)} aria-current={archived ? "page" : undefined} className={`rounded-t-lg px-4 py-2 font-bold ${archived ? "bg-[#9d302f] text-white" : "text-[#9d302f] underline"}`}>Archived</Link></nav><div className="mb-7 flex flex-wrap gap-3"><Link to="/admin/schedule/new" className="ta-button ta-button-primary">New Drop-Off Event</Link><Link to="/admin/appointments" className="ta-button ta-button-secondary">View All Appointments</Link></div><div className="mb-5 flex gap-3 text-sm font-semibold"><Link to={scheduleUrl(loaderData.view, "all")} preventScrollReset className={loaderData.visibility === "all" ? "text-[#9d302f] underline" : ""}>All</Link><Link to={scheduleUrl(loaderData.view, "public")} preventScrollReset className={loaderData.visibility === "public" ? "text-[#9d302f] underline" : ""}>Public</Link><Link to={scheduleUrl(loaderData.view, "private")} preventScrollReset className={loaderData.visibility === "private" ? "text-[#9d302f] underline" : ""}>Private</Link></div>{actionData?.ok ? <Notice variant="success">{actionData.message}</Notice> : null}{actionData && !actionData.ok ? <Notice variant="error">{actionData.errors.join(" ")}</Notice> : null}{loaderData.events.length === 0 ? <PageCard title={archived ? "No Archived Drop-Off Events" : "No Upcoming Drop-Off Events"}><p className="text-[#5f6368]">{archived ? "Past Drop-Off Dates remain available here for review and administration." : "Create a public or private Drop-Off Date to begin scheduling."}</p></PageCard> : <section className="grid gap-6 xl:grid-cols-2">{loaderData.events.map((event) => <PageCard key={event.id} title={event.eventName || "Drop-Off Event"}><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="font-semibold text-[#25272b]">{event.date}</p><p className="mt-1 text-sm text-[#5f6368]">{event.scheduledAppointments} confirmed · {event.waitlistedAppointments} waitlisted · Daily {event.usedPoints} / {event.dailyCapacityPoints} confirmed</p></div><div className="flex gap-2"><span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-bold">{event.visibility === "public" ? "Public" : "Private"}</span><span className={event.isOpen ? "rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-900" : "rounded-full bg-red-100 px-3 py-1 text-xs font-bold text-red-900"}>{event.isOpen ? "Open" : "Closed"}</span>{event.archiveStatus === "archived" ? <span className="rounded-full bg-stone-800 px-3 py-1 text-xs font-bold text-white">Archived</span> : null}</div></div><dl className="mt-5 grid gap-3 sm:grid-cols-3">{event.areas.map((area) => <div key={area.itemAreaId} className="rounded-lg border border-[#dfe1e4] bg-white p-3"><dt className="font-semibold text-[#25272b]">{area.name}</dt><dd className="mt-1 text-sm text-[#5f6368]">Normal: {area.confirmedUsagePoints} / {area.capacityPoints} confirmed · Waitlist: {area.waitlistUsagePoints} / {area.overflowAllowancePoints} used · {area.remainingWaitlistPoints} remaining</dd></div>)}</dl>{event.note ? <p className="mt-4 rounded-lg border border-[#dfe1e4] bg-white p-3 text-sm text-[#5f6368]">Note: {event.note}</p> : null}<div className="mt-5 flex flex-wrap gap-3"><Link to={`/admin/schedule/${event.id}`} className="ta-button ta-button-secondary">Manage Event</Link><Form method="post"><input type="hidden" name="eventId" value={event.id}/><input type="hidden" name="intent" value={event.isOpen ? "close" : "open"}/><Button variant="secondary">{event.isOpen ? "Close Event" : "Open Event"}</Button></Form>{event.appointments.length === 0 ? <ConfirmationForm method="post" confirmation={{ title: "Permanently delete Drop-Off Event?", description: <>Are you sure you want to permanently delete this item? This action cannot be undone.<p className="mt-2 text-sm">{event.eventName || "Drop-Off Event"} · {event.date}</p></>, confirmLabel: "Permanently delete", destructive: true }}><input type="hidden" name="eventId" value={event.id}/><input type="hidden" name="intent" value="delete"/><Button variant="destructive">Delete Event</Button></ConfirmationForm> : null}</div></PageCard>)}</section>}</div></PageShell>;
}
