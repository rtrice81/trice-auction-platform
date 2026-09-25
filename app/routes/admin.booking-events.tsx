import { env } from "cloudflare:workers";
import { Link } from "react-router";
import type { Route } from "./+types/admin.booking-events";
import { requireRole } from "../services/auth.server";
import { PageCard, PageIntro, PageShell } from "../components/design-system";
import { bookingEventInstant, formatBookingEventTime } from "../lib/booking-event-time";
import { bookingEventDateStatus, finalDropoffDate, upcomingPastView } from "../lib/booking-event-archive.js";

const runtime = env as unknown as { AUTH_SECRET?: string; BETTER_AUTH_URL?: string };
type BookingEventRow = { id: number; name: string; description: string | null; opensAt: string; closesAt: string | null; timezone: string; timeStorageVersion: number; active: number; dropoffDateCount: number; appointmentCount: number };
type DropoffDateRow = { bookingEventId: number; id: number; date: string; name: string | null; isOpen: number; appointmentCount: number };

export async function loader({ request }: Route.LoaderArgs) {
  await requireRole(request, env.trice_auction_db, runtime, "admin");
  const view = upcomingPastView(new URL(request.url).searchParams.get("view"));
  const [{ results: bookingEvents }, { results: dates }] = await Promise.all([
    env.trice_auction_db.prepare(`SELECT event.id, event.name, event.description, event.opens_at AS opensAt, event.closes_at AS closesAt, event.timezone, event.timestamp_storage_version AS timeStorageVersion, event.active, COUNT(day.id) AS dropoffDateCount, COALESCE(SUM((SELECT COUNT(*) FROM appointments appointment WHERE appointment.appointment_date = day.dropoff_date)), 0) AS appointmentCount FROM booking_events event LEFT JOIN booking_event_dropoff_dates link ON link.booking_event_id = event.id LEFT JOIN dropoff_days day ON day.id = link.dropoff_day_id GROUP BY event.id`).all<BookingEventRow>(),
    env.trice_auction_db.prepare(`SELECT link.booking_event_id AS bookingEventId, day.id, day.dropoff_date AS date, day.event_name AS name, day.is_open AS isOpen, COUNT(appointment.id) AS appointmentCount FROM booking_event_dropoff_dates link JOIN dropoff_days day ON day.id = link.dropoff_day_id LEFT JOIN appointments appointment ON appointment.appointment_date = day.dropoff_date AND appointment.status = 'scheduled' GROUP BY link.booking_event_id, day.id ORDER BY day.dropoff_date`).all<DropoffDateRow>(),
  ]);
  const datesByBookingEvent = new Map<number, DropoffDateRow[]>();
  for (const date of dates) datesByBookingEvent.set(date.bookingEventId, [...(datesByBookingEvent.get(date.bookingEventId) ?? []), date]);
  const now = new Date();
  const classifiedEvents = bookingEvents.map((event) => {
    const eventDates = datesByBookingEvent.get(event.id) ?? [];
    const dateStatus = bookingEventDateStatus(eventDates.map((date) => date.date), now);
    return { ...event, status: signupStatus(event, now), dateStatus, finalDropoffDate: finalDropoffDate(eventDates.map((date) => date.date)), dates: eventDates };
  }).filter((event) => event.dateStatus === view);
  classifiedEvents.sort((left, right) => {
    const leftDate = left.finalDropoffDate;
    const rightDate = right.finalDropoffDate;
    if (!leftDate && !rightDate) return left.opensAt.localeCompare(right.opensAt) || left.id - right.id;
    if (!leftDate) return view === "upcoming" ? 1 : -1;
    if (!rightDate) return view === "upcoming" ? -1 : 1;
    const comparison = leftDate.localeCompare(rightDate);
    return (view === "past" ? -comparison : comparison) || left.id - right.id;
  });
  return { bookingEvents: classifiedEvents, view };
}

function signupStatus(event: Pick<BookingEventRow, "active" | "opensAt" | "closesAt" | "timezone" | "timeStorageVersion">, now: Date) {
  const opensAt = bookingEventInstant(event.opensAt, event.timezone, event.timeStorageVersion);
  const closesAt = event.closesAt ? bookingEventInstant(event.closesAt, event.timezone, event.timeStorageVersion) : null;
  if (!event.active || !opensAt) return "Inactive";
  if (now.getTime() < opensAt.getTime()) return "Upcoming";
  if (closesAt && now.getTime() >= closesAt.getTime()) return "Closed";
  return "Open";
}

export default function BookingEvents({ loaderData }: Route.ComponentProps) {
  const past = loaderData.view === "past";
  return <PageShell><div className="max-w-6xl"><PageIntro eyebrow="Trice Auctions · Administration" title="Booking Events">Create customer-facing signup events and manage their Drop-Off Dates.</PageIntro><nav className="mb-7 flex gap-2 border-b border-[#dfe1e4]" aria-label="Booking Event views"><Link to="/admin/booking-events" aria-current={!past ? "page" : undefined} className={`rounded-t-lg px-4 py-2 font-bold ${!past ? "bg-[#9d302f] text-white" : "text-[#9d302f] underline"}`}>Upcoming</Link><Link to="/admin/booking-events?view=past" aria-current={past ? "page" : undefined} className={`rounded-t-lg px-4 py-2 font-bold ${past ? "bg-[#9d302f] text-white" : "text-[#9d302f] underline"}`}>Past</Link></nav><div className="mb-7"><Link to="/admin/booking-events/new" className="ta-button ta-button-primary">New Booking Event</Link></div>{loaderData.bookingEvents.length ? <section className="grid gap-5 lg:grid-cols-2">{loaderData.bookingEvents.map((event) => <PageCard key={event.id} title={<Link to={`/admin/booking-events/${event.id}`} className="block rounded-sm underline decoration-transparent underline-offset-4 transition hover:text-[#fce7e7] hover:decoration-current focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#9d302f]">{event.name}</Link>}><div className="flex items-center justify-between gap-3"><p className="text-sm text-[#5f6368]">Opens {formatBookingEventTime(event.opensAt, event.timezone, event.timeStorageVersion)}</p><span className={`rounded-full px-3 py-1 text-xs font-bold ${event.dateStatus === "past" ? "bg-stone-800 text-white" : "bg-stone-100"}`}>{event.dateStatus === "past" ? "Past" : event.status}</span></div>{event.closesAt ? <p className="mt-1 text-sm text-[#5f6368]">Closes {formatBookingEventTime(event.closesAt, event.timezone, event.timeStorageVersion)}</p> : null}<p className="mt-4 text-sm text-[#5f6368]">{event.dropoffDateCount} Drop-Off Date{event.dropoffDateCount === 1 ? "" : "s"} · {event.appointmentCount} appointment{event.appointmentCount === 1 ? "" : "s"}</p><section className="mt-5 border-t border-[#dfe1e4] pt-4" aria-label={`${event.name} Drop-Off Dates`}><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-bold text-[#25272b]">Drop-Off Dates</h2><Link to={`/admin/schedule/new?bookingEventId=${event.id}`} className="text-sm font-bold text-[#9d302f] underline">Add Drop-Off Date</Link></div>{event.dates.length ? <ul className="mt-3 space-y-2">{event.dates.map((date) => <li key={date.id} className="rounded-lg border border-[#dfe1e4] bg-[#f8f9fa] p-3"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="font-semibold text-[#25272b]">{date.date}</p><p className="text-sm text-[#5f6368]">{date.isOpen ? "Open" : "Closed"} · {date.appointmentCount} appointment{date.appointmentCount === 1 ? "" : "s"}</p></div><div className="flex gap-3 text-sm font-bold text-[#9d302f]"><Link className="underline" to={`/admin/schedule/${date.id}`}>Edit</Link><Link className="underline" to={`/admin/schedule/${date.id}#appointments`}>View Schedule</Link></div></div></li>)}</ul> : <p className="mt-3 text-sm text-[#5f6368]">No Drop-Off Dates have been added yet.</p>}</section><Link className="mt-5 inline-flex font-bold text-[#9d302f] underline" to={`/admin/booking-events/${event.id}`}>View / edit Booking Event</Link></PageCard>)}</section> : <PageCard title={past ? "No Past Booking Events" : "No Upcoming Booking Events"}><p className="text-[#5f6368]">{past ? "Past Booking Events remain available here for review and administration." : "Create a Booking Event, then add one or more public Drop-Off Dates."}</p></PageCard>}</div></PageShell>;
}
