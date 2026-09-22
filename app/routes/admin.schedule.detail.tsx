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
  type EventArea,
  type ScheduleResult,
} from "../services/schedule-management.server";
import { queueEventOperationalNotification } from "../services/notification.server";
import { ConfirmationForm } from "../components/confirmation-form";
import { AppointmentSummaryList } from "../components/admin-appointment-summary";
import { AddAppointmentModal } from "../components/add-appointment-modal";
import { getBookingFormOptions } from "../services/booking.server";
import { useState } from "react";
import { isAttendanceAction, recordAppointmentAttendance } from "../services/appointment-attendance.server";
import { APPOINTMENT_STATUS_FILTERS, formatAppointmentStatusLabel } from "../lib/appointment-status";

const runtime = env as unknown as { AUTH_SECRET?: string; BETTER_AUTH_URL?: string };

export async function loader({ request, params }: Route.LoaderArgs) {
  await requireRole(request, env.trice_auction_db, runtime, "admin");
  const status = new URL(request.url).searchParams.get("status") ?? "all";
  const [event, appointmentOptions] = await Promise.all([
    getDropoffEventById(env.trice_auction_db, Number(params.id), status === "all" ? undefined : status),
    getBookingFormOptions(env.trice_auction_db),
  ]);
  return { event, appointmentOptions, status, created: new URL(request.url).searchParams.has("created") };
}

export async function action({ request, params }: Route.ActionArgs) {
  const actor = await requireRole(request, env.trice_auction_db, runtime, "admin");
  const eventId = Number(params.id);
  if (!Number.isInteger(eventId) || eventId < 1) throw new Response("Not Found", { status: 404 });
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "save");
  let result: ScheduleResult;
  if (intent === "attendance") { const attendanceAction = String(form.get("attendanceAction") ?? ""); const appointmentId = Number(form.get("appointmentId")); if (!isAttendanceAction(attendanceAction)) result = { ok: false, errors: ["Invalid attendance action."] }; else { const attendance = await recordAppointmentAttendance(env.trice_auction_db, { appointmentId, actorUserId: actor.id, action: attendanceAction }); result = attendance.ok ? { ok: true, message: attendance.message } : { ok: false, errors: [attendance.error] }; } }
  else if (intent === "save") result = await updateDropoffEvent(env.trice_auction_db, eventId, dropoffEventInputFromForm(form));
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
      <header className="mt-4"><h1 className="text-3xl font-bold">{event.eventName || "Drop-Off Event"}</h1><p className="mt-1 text-stone-600">{event.date} · {event.visibility === "private" ? "Private / Internal" : "Public"} · {event.isOpen ? "Open for bookings" : "Closed for bookings"}</p></header>
      <StorageCapacitySummary areas={event.areas}/>
      {loaderData.created ? <p className="mt-4 rounded border border-emerald-200 bg-emerald-50 p-3" role="status">Appointment created and added to this Drop-Off Date.</p> : null}
      {actionData?.ok ? <p className="mt-4 rounded border border-emerald-200 bg-emerald-50 p-3" role="status">{actionData.message}</p> : null}
      {actionData && !actionData.ok ? <p className="mt-4 rounded border border-red-200 bg-red-50 p-3" role="alert">{actionData.errors.join(" ")}</p> : null}
      <section id="appointments" className="mt-8"><div className="flex flex-wrap items-center justify-between gap-4"><h2 className="text-2xl font-bold">Appointments</h2><div className="flex flex-wrap gap-3"><AddAppointmentModal scheduleId={event.id} appointmentDate={event.date} options={loaderData.appointmentOptions} onCreated={setAppointmentMessage}/><Link to={`/admin/reports/dropoff-schedule?date=${event.date}`} className="rounded border border-stone-300 bg-white px-3 py-2 font-semibold">Print Daily Schedule</Link></div></div>{appointmentMessage ? <p className="mt-4 rounded border border-emerald-200 bg-emerald-50 p-3" role="status">{appointmentMessage}</p> : null}{event.visibility === "private" ? <p className="mt-2 text-sm text-stone-600">Create one appointment per assigned customer. Private dates are never available for customer self-booking.</p> : null}<div className="mt-3 flex flex-wrap gap-3 text-sm">{APPOINTMENT_STATUS_FILTERS.map((status) => <Link key={status} to={`/admin/schedule/${event.id}?status=${status}`} preventScrollReset className={loaderData.status === status ? "font-bold text-[#9d302f] underline" : "text-[#5f6368]"}>{formatAppointmentStatusLabel(status)}</Link>)}</div><div className="mt-3"><AppointmentSummaryList appointments={event.appointments} attendanceControls/></div></section>
      <section aria-labelledby="dropoff-day-settings" className="mt-10 border-t border-stone-200 pt-8"><div className="flex flex-wrap items-start justify-between gap-4"><div><h2 id="dropoff-day-settings" className="text-2xl font-bold">Drop-Off Day Settings</h2><p className="mt-1 text-sm text-stone-600">Manage booking availability, capacity, and internal operating notes.</p></div><Form method="post"><input type="hidden" name="intent" value={event.isOpen ? "close" : "open"} /><button className="rounded border px-3 py-2">{event.isOpen ? "Close event" : "Open event"}</button></Form></div><Form method="post" className="mt-6 rounded border bg-white p-6"><input type="hidden" name="intent" value="save" /><DropoffEventForm event={event} submitLabel="Save event changes" includeDate={false} /></Form><section className="mt-8 rounded border border-red-200 bg-red-50 p-5"><h3 className="font-bold">Delete event</h3><p className="mt-1 text-sm">Deletion is available only when this event has no appointments. Otherwise close it to preserve operational history.</p><ConfirmationForm method="post" className="mt-3" confirmation={{ title: "Permanently delete Drop-Off Event?", description: <>Are you sure you want to permanently delete this item? This action cannot be undone.<p className="mt-2 text-sm">{event.eventName || "Drop-Off Event"} · {event.date}</p></>, confirmLabel: "Permanently delete", destructive: true }}><input type="hidden" name="intent" value="delete" /><button className="text-sm font-semibold text-red-800 underline">Delete Drop-Off Event</button></ConfirmationForm></section></section>
    </main>
  );
}

function StorageCapacitySummary({ areas }: { areas: EventArea[] }) {
  return <section aria-labelledby="storage-capacity-heading" className="mt-6"><div className="flex flex-wrap items-baseline justify-between gap-2"><h2 id="storage-capacity-heading" className="text-xl font-bold">Storage Capacity</h2><p className="text-sm text-stone-600">Confirmed appointments only; cancelled appointments are excluded.</p></div><div className="mt-3 grid gap-4 md:grid-cols-3">{areas.map((area) => <article key={area.itemAreaId} className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm"><div className="flex items-start justify-between gap-3"><h3 className="font-semibold text-stone-950">{area.name}</h3><span className={area.overrideUsageUnits > 0 ? "rounded-full bg-red-100 px-2 py-1 text-xs font-bold text-red-900" : "rounded-full bg-stone-100 px-2 py-1 text-xs font-bold text-stone-700"}>{formatPercent(area.percentUsed)}</span></div><p className="mt-3 text-sm text-stone-600">Total capacity: {formatStorageAmount(area.capacityUnits, area.measurementType)}</p><p className="mt-1 text-sm text-stone-800"><strong>{formatStorageAmount(area.confirmedUsageUnits, area.measurementType)}</strong> used · {formatStorageAmount(area.remainingCapacityUnits, area.measurementType)} remaining</p><p className="mt-1 text-sm text-stone-600">{formatPercent(area.percentUsed)} used</p><div className="mt-3 h-2 overflow-hidden rounded-full bg-stone-200" role="progressbar" aria-label={`${area.name} storage capacity used`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(area.progressPercent)}><div className={area.overrideUsageUnits > 0 ? "h-full bg-red-700" : "h-full bg-amber-700"} style={{ width: `${area.progressPercent}%` }}/></div>{area.overrideUsageUnits > 0 ? <p className="mt-3 text-sm font-semibold text-red-800">Over capacity / admin override: {formatStorageAmount(area.overrideUsageUnits, area.measurementType)}</p> : null}{area.waitlistUsageUnits > 0 ? <p className="mt-2 text-xs text-stone-600">Waitlist: {formatStorageAmount(area.waitlistUsageUnits, area.measurementType)} / {formatStorageAmount(area.overflowAllowanceUnits, area.measurementType)} overflow capacity</p> : null}</article>)}</div></section>;
}

function formatStorageAmount(value: number, measurementType: EventArea["measurementType"]) {
  const amount = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value);
  return `${amount}${measurementType === "square_feet" ? " sq ft" : measurementType === "shelves" ? " shelves" : " points"}`;
}

function formatPercent(value: number) {
  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(value)}%`;
}
