import { env } from "cloudflare:workers";
import { Form, Link } from "react-router";
import type { Route } from "./+types/admin.appointments";
import { requireRole } from "../services/auth.server";
import { AdminAppointmentCard } from "../components/admin-appointment-summary";
import { Button, PageCard, PageIntro, PageShell } from "../components/design-system";
import { APPOINTMENT_STATUS_FILTERS, formatAppointmentStatusLabel } from "../lib/appointment-status";
import { formatDropoffDate } from "../components/dropoff-event-card";
import { calendarDateInTimezone } from "../lib/booking-event-visibility.js";
import { upcomingPastView } from "../lib/booking-event-archive.js";

const runtime = env as unknown as { AUTH_SECRET?: string; BETTER_AUTH_URL?: string };
type AppointmentRow = { id: number; date: string; status: string; loadType: string; customer: string; email: string; consignorId: string | null; allocationSummary: string; dropoffDateId: number; bookingEventName: string | null };
type AppointmentGroup = { dropoffDateId: number; date: string; bookingEventName: string | null; appointments: AppointmentRow[]; nonCancelledAppointmentCount: number };

export async function loader({ request }: Route.LoaderArgs) {
  await requireRole(request, env.trice_auction_db, runtime, "admin");
  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim() ?? "";
  const status = url.searchParams.get("status") ?? "all";
  const view = upcomingPastView(url.searchParams.get("view"));
  const pattern = `%${q}%`;
  const today = calendarDateInTimezone(new Date(), "America/New_York");
  const { results } = await env.trice_auction_db.prepare(
    `SELECT a.id, a.appointment_date AS date, a.status, d.name AS loadType,
            COALESCE(NULLIF(TRIM(u.first_name || ' ' || u.last_name), ''), u.email) AS customer,
            u.email, u.consignor_id AS consignorId,
            day.id AS dropoffDateId, event.name AS bookingEventName,
            COALESCE(GROUP_CONCAT(area.name || ': ' || allocation.allocation_percent || '%', ' · '), '') AS allocationSummary
     FROM appointments a
     JOIN users u ON u.id = a.user_id
     JOIN dropoff_types d ON d.id = a.dropoff_type_id
     JOIN dropoff_days day ON day.dropoff_date = a.appointment_date
     LEFT JOIN booking_event_dropoff_dates link ON link.dropoff_day_id = day.id
     LEFT JOIN booking_events event ON event.id = link.booking_event_id
     LEFT JOIN appointment_area_allocations allocation ON allocation.appointment_id = a.id
     LEFT JOIN item_areas area ON area.id = allocation.item_area_id
     WHERE (? = 'all' OR a.status = ?)
       AND ((? = 'upcoming' AND a.appointment_date >= ?) OR (? = 'past' AND a.appointment_date < ?))
       AND (? = '' OR LOWER(u.email) LIKE LOWER(?) OR LOWER(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')) LIKE LOWER(?) OR LOWER(COALESCE(u.consignor_id, '')) LIKE LOWER(?))
     GROUP BY a.id
     ORDER BY a.appointment_date ASC, a.id DESC`,
  ).bind(status, status, view, today, view, today, q, pattern, pattern, pattern).all<AppointmentRow>();
  return { q, status, view, appointmentGroups: groupAppointmentsByDropoffDate(results) };
}

function groupAppointmentsByDropoffDate(appointments: AppointmentRow[]): AppointmentGroup[] {
  const groups = new Map<number, AppointmentGroup>();
  for (const appointment of appointments) {
    let group = groups.get(appointment.dropoffDateId);
    if (!group) {
      group = { dropoffDateId: appointment.dropoffDateId, date: appointment.date, bookingEventName: appointment.bookingEventName, appointments: [], nonCancelledAppointmentCount: 0 };
      groups.set(appointment.dropoffDateId, group);
    }
    group.appointments.push(appointment);
    if (appointment.status !== "cancelled") group.nonCancelledAppointmentCount += 1;
  }
  return [...groups.values()];
}

export default function AdminAppointments({ loaderData }: Route.ComponentProps) {
  const past = loaderData.view === "past";
  return <PageShell><div className="max-w-7xl"><PageIntro eyebrow="Trice Auctions · Administration" title="Appointments">Search and manage customer drop-off appointments.</PageIntro><nav className="mb-7 flex gap-2 border-b border-[#dfe1e4]" aria-label="Appointment views"><Link to={appointmentUrl("upcoming", loaderData.q, loaderData.status)} aria-current={!past ? "page" : undefined} className={`rounded-t-lg px-4 py-2 font-bold ${!past ? "bg-[#9d302f] text-white" : "text-[#9d302f] underline"}`}>Upcoming</Link><Link to={appointmentUrl("past", loaderData.q, loaderData.status)} aria-current={past ? "page" : undefined} className={`rounded-t-lg px-4 py-2 font-bold ${past ? "bg-[#9d302f] text-white" : "text-[#9d302f] underline"}`}>Past</Link></nav><div className="mb-7 flex flex-wrap gap-3"><Link to="/admin/appointments/new" className="ta-button ta-button-primary">New Appointment</Link><Link to="/admin/schedule" className="ta-button ta-button-secondary">Manage Drop-Off Events</Link></div><PageCard title="Find Appointments"><Form method="get" className="flex flex-col gap-3 sm:flex-row"><input type="hidden" name="view" value={loaderData.view === "past" ? "past" : ""}/><input name="q" defaultValue={loaderData.q} placeholder="Customer name, email, or Consignor ID" className="min-h-11 flex-1 rounded-md border border-[#c9cdd2] bg-white px-3 py-2.5 outline-none focus:border-[#9d302f] focus:ring-2 focus:ring-[#f2d8d7]"/><select name="status" defaultValue={loaderData.status} className="rounded-md border border-[#c9cdd2] bg-white px-3 py-2.5">{APPOINTMENT_STATUS_FILTERS.map((status) => <option key={status} value={status}>{status === "all" ? "All Statuses" : formatAppointmentStatusLabel(status)}</option>)}</select><Button variant="secondary">Search</Button></Form></PageCard><section className="mt-8" aria-label="Appointments">{loaderData.appointmentGroups.length ? <div className="space-y-10">{loaderData.appointmentGroups.map((group) => <section key={group.dropoffDateId} aria-labelledby={`dropoff-date-${group.dropoffDateId}`} className="border-t-4 border-[#9d302f] pt-4"><div className="mb-4 flex flex-wrap items-baseline justify-between gap-2"><div><h2 id={`dropoff-date-${group.dropoffDateId}`} className="text-xl font-bold text-[#25272b] sm:text-2xl">{formatDropoffDate(group.date)}</h2>{group.bookingEventName ? <p className="mt-1 text-sm text-[#5f6368]">{group.bookingEventName}</p> : null}</div><p className="text-sm font-semibold text-[#5f6368]">{group.nonCancelledAppointmentCount} non-cancelled appointment{group.nonCancelledAppointmentCount === 1 ? "" : "s"}</p></div><div className="space-y-4">{group.appointments.map((appointment) => <AdminAppointmentCard key={appointment.id} appointment={appointment}/>)}</div></section>)}</div> : <div className="rounded-xl border border-[#dfe1e4] bg-white p-8 text-center shadow-sm"><p className="font-semibold text-[#25272b]">No {past ? "past" : "upcoming"} appointments found.</p><p className="mt-2 text-sm text-[#5f6368]">Try a different customer name, email, Consignor ID, or status.</p></div>}</section></div></PageShell>;
}

function appointmentUrl(view: "upcoming" | "past", q: string, status: string) {
  const params = new URLSearchParams();
  if (view === "past") params.set("view", "past");
  if (q) params.set("q", q);
  if (status !== "all") params.set("status", status);
  const query = params.toString();
  return query ? `/admin/appointments?${query}` : "/admin/appointments";
}
