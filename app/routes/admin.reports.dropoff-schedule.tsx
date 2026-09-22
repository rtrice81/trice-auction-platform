import { env } from "cloudflare:workers";
import { Form, Link } from "react-router";
import type { Route } from "./+types/admin.reports.dropoff-schedule";
import { requireRole } from "../services/auth.server";
import { getDailyDropoffScheduleReport } from "../services/dropoff-schedule-report.server";
import { formatAppointmentStatusLabel } from "../lib/appointment-status";

const runtime = env as unknown as { AUTH_SECRET?: string; BETTER_AUTH_URL?: string };

export function meta() { return [{ title: "Daily Drop-Off Schedule | Trice Auctions" }]; }

export async function loader({ request }: Route.LoaderArgs) {
  await requireRole(request, env.trice_auction_db, runtime, "admin");
  const url = new URL(request.url);
  const requestedDate = url.searchParams.get("date") ?? new Date().toISOString().slice(0, 10);
  if (!isIsoDate(requestedDate)) throw new Response("Choose a valid report date.", { status: 400 });
  const includeCancelled = url.searchParams.get("includeCancelled") === "true";
  const report = await getDailyDropoffScheduleReport(env.trice_auction_db, requestedDate, includeCancelled);
  return { report, includeCancelled, scheduleUrl: report.dropoffDayId ? `/admin/schedule/${report.dropoffDayId}` : "/admin/schedule" };
}

export default function DailyDropoffScheduleReport({ loaderData }: Route.ComponentProps) {
  const { report, includeCancelled, scheduleUrl } = loaderData;
  const previousDate = shiftDate(report.date, -1);
  const nextDate = shiftDate(report.date, 1);
  const query = (date: string, include = includeCancelled) => `/admin/reports/dropoff-schedule?date=${date}${include ? "&includeCancelled=true" : ""}`;
  return <main className="schedule-report mx-auto max-w-[1500px] bg-white p-4 text-stone-950 sm:p-8">
    <style>{printStyles}</style>
    <div className="report-controls print-hide mb-6 flex flex-wrap items-end gap-3 border-b border-stone-200 pb-5">
      <Link to={scheduleUrl} className="rounded border border-stone-300 px-3 py-2 font-semibold">← Daily Schedules</Link>
      <Link to={query(previousDate)} className="rounded border border-stone-300 px-3 py-2 font-semibold">Previous day</Link>
      <Link to={query(nextDate)} className="rounded border border-stone-300 px-3 py-2 font-semibold">Next day</Link>
      <Form method="get" className="flex flex-wrap items-end gap-3"><label className="text-sm font-semibold">Selected date<input type="date" name="date" defaultValue={report.date} className="mt-1 block rounded border border-stone-300 px-3 py-2 font-normal" /></label><label className="flex items-center gap-2 pb-2 text-sm"><input type="checkbox" name="includeCancelled" value="true" defaultChecked={includeCancelled} /> Include cancelled</label><button className="rounded border border-stone-300 px-3 py-2 font-semibold">View date</button></Form>
      <button type="button" onClick={() => window.print()} className="rounded bg-stone-950 px-4 py-2 font-bold text-white">Print</button>
    </div>
    <header className="report-header border-b-2 border-stone-950 pb-4">
      <div><h1 className="text-2xl font-bold">Daily Drop-Off Schedule</h1><p className="mt-1 text-sm">{formatDate(report.date)}{report.eventName ? ` · ${report.eventName}` : ""}</p></div>
      <dl className="report-totals mt-4 grid grid-cols-2 gap-x-5 gap-y-2 text-sm sm:grid-cols-3 lg:grid-cols-6"><Metric label="Scheduled" value={report.totals.scheduled} /><Metric label="Checked In" value={report.totals.checkedIn} /><Metric label="Completed" value={report.totals.completed} /><Metric label="No-Shows" value={report.totals.noShow} /><Metric label="Last-Minute Cancellations" value={report.totals.lastMinuteCancelled} /><Metric label="Waitlisted" value={report.totals.waitlisted} /></dl>
      {report.capacity ? <p className="mt-3 text-xs"><strong>Capacity:</strong> Normal {report.capacity.normal} · Confirmed usage {report.capacity.confirmed} · Waitlist usage {report.capacity.waitlist}</p> : null}
    </header>
    {report.appointments.length === 0 ? <p className="mt-8 rounded border border-dashed border-stone-300 p-6 text-center text-stone-600">No appointments scheduled.</p> : <div className="report-table-wrap mt-6 overflow-x-auto"><table className="report-table w-full border-collapse text-left text-xs"><thead><tr><th>Consignor</th><th>ID</th><th>Phone</th><th>Load</th><th>Allocation</th><th>Description</th><th>Status</th><th>Staff Check</th></tr></thead><tbody>{report.appointments.map((appointment) => <tr key={appointment.id}><td>{appointment.customer}</td><td>{appointment.consignorId || "—"}</td><td className="whitespace-nowrap">{appointment.phone || "—"}</td><td>{appointment.loadType}</td><td>{appointment.allocationSummary || "—"}</td><td className="description-cell">{appointment.description?.trim() || "No description provided."}{appointment.adminNotes?.trim() ? <p className="operational-note"><strong>Ops:</strong> {appointment.adminNotes}</p> : null}</td><td><span className="status-label">{formatAppointmentStatusLabel(appointment.status)}</span>{appointment.checkedInAt ? <small className="mt-1 block">In: {formatTimestamp(appointment.checkedInAt)}</small> : null}</td><td className="staff-check whitespace-nowrap">□ Arrived<br />□ Completed</td></tr>)}</tbody></table></div>}
    <section className="staff-notes mt-7 border border-stone-400 p-4"><h2 className="font-bold">Staff Notes</h2><div className="mt-2 h-20" /></section>
  </main>;
}

function Metric({ label, value }: { label: string; value: number }) { return <div><dt className="text-stone-600">{label}</dt><dd className="text-lg font-bold">{value}</dd></div>; }
function formatDate(value: string) { return new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(new Date(`${value}T12:00:00`)); }
function formatTimestamp(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? value : date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }); }
function shiftDate(value: string, amount: number) { const date = new Date(`${value}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + amount); return date.toISOString().slice(0, 10); }
function isIsoDate(value: string) { const date = new Date(`${value}T00:00:00Z`); return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value; }

const printStyles = `
  .report-table th, .report-table td { border: 1px solid #777; padding: 0.4rem; vertical-align: top; }
  .report-table th { background: #f1f1f1; font-weight: 700; }
  .description-cell, .operational-note { white-space: pre-wrap; overflow-wrap: anywhere; }
  .operational-note { margin-top: 0.35rem; color: #333; }
  @page { size: landscape; margin: 0.45in; }
  @media print {
    html, body { background: #fff !important; color: #000 !important; }
    .print-hide { display: none !important; }
    .schedule-report { max-width: none !important; margin: 0 !important; padding: 0 !important; }
    .report-table-wrap { overflow: visible !important; }
    .report-table { font-size: 8pt; }
    .report-table thead { display: table-header-group; }
    .report-table tr { break-inside: avoid; page-break-inside: avoid; }
    .report-table th { background: #fff !important; }
    .staff-notes { break-inside: avoid; page-break-inside: avoid; }
  }
`;
