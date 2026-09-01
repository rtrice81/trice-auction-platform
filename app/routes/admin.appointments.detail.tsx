import { env } from "cloudflare:workers";
import { data, Link, redirect } from "react-router";
import type { Route } from "./+types/admin.appointments.detail";
import { Button, Notice, PageCard, PageIntro, PageShell } from "../components/design-system";
import { ConfirmationForm } from "../components/confirmation-form";
import { requireRole } from "../services/auth.server";
import { getAppointmentOverrideHistory } from "../services/appointment-override-audit.server";
import { cancelScheduledAppointment } from "../services/notification.server";

const runtime = env as unknown as { AUTH_SECRET?: string; BETTER_AUTH_URL?: string };

export async function loader({ request, params }: Route.LoaderArgs) {
  await requireRole(request, env.trice_auction_db, runtime, "admin");
  const appointmentId = Number(params.id);
  const appointment = await env.trice_auction_db.prepare(
    `SELECT appointments.id, appointments.appointment_date AS appointmentDate,
            appointments.appointment_time AS appointmentTime, appointments.description,
            appointments.status, appointments.admin_notes AS adminNotes,
            dropoff_types.name AS loadType, dropoff_types.capacity_points AS loadCapacityPoints,
            users.first_name AS firstName, users.last_name AS lastName, users.email,
            users.phone
     FROM appointments
     JOIN users ON users.id = appointments.user_id
     JOIN dropoff_types ON dropoff_types.id = appointments.dropoff_type_id
     WHERE appointments.id = ?`,
  ).bind(appointmentId).first<AppointmentDetail>();
  if (!appointment) throw new Response("Not Found", { status: 404 });
  const [allocationResult, overrideHistory] = await Promise.all([
    env.trice_auction_db.prepare(
      `SELECT item_areas.name, appointment_area_allocations.allocation_percent AS percentage,
              appointment_area_allocations.capacity_points AS capacityPoints
       FROM appointment_area_allocations
       JOIN item_areas ON item_areas.id = appointment_area_allocations.item_area_id
       WHERE appointment_area_allocations.appointment_id = ?
       ORDER BY item_areas.id`,
    ).bind(appointmentId).all<AllocationDetail>(),
    getAppointmentOverrideHistory(env.trice_auction_db, appointmentId),
  ]);
  return { appointment, allocations: allocationResult.results, overrideHistory, updated: new URL(request.url).searchParams.get("updated") === "1", cancelled: new URL(request.url).searchParams.get("cancelled") === "1" };
}

export async function action({ request, params }: Route.ActionArgs) {
  await requireRole(request, env.trice_auction_db, runtime, "admin");
  const appointmentId = Number(params.id);
  const appointment = await env.trice_auction_db.prepare(
    "SELECT appointment_date AS appointmentDate, appointment_time AS appointmentTime, status FROM appointments WHERE id = ?",
  ).bind(appointmentId).first<{ appointmentDate: string; appointmentTime: string | null; status: string }>();
  if (!appointment) throw new Response("Not Found", { status: 404 });
  const form = await request.formData();
  if (form.get("intent") !== "cancel") return data({ error: "Invalid action." }, { status: 400 });
  if (appointment.status !== "scheduled") return data({ error: "Only scheduled appointments can be cancelled." }, { status: 400 });
  const result = await cancelScheduledAppointment(env.trice_auction_db, appointmentId, env as never);
  if (!result.cancelled) return data({ error: "Only scheduled appointments can be cancelled." }, { status: 400 });
  return redirect(`/admin/appointments/${appointmentId}?cancelled=1`);
}

export default function AdminAppointmentDetail({ loaderData, actionData }: Route.ComponentProps) {
  const { appointment, allocations, overrideHistory } = loaderData;
  const customerName = `${appointment.firstName || ""} ${appointment.lastName || ""}`.trim() || appointment.email;
  const totalCapacityPoints = allocations.reduce((total, allocation) => total + allocation.capacityPoints, 0);
  return <PageShell><div className="max-w-5xl"><PageIntro eyebrow="Trice Auctions · Administration" title={`Appointment #${appointment.id}`}><span className="capitalize">{appointment.status.replace("_", " ")}</span> · {appointment.appointmentDate} · {appointment.appointmentTime || "Time TBD"}</PageIntro>
    {loaderData.updated ? <Notice variant="success">Appointment changes saved.</Notice> : null}{loaderData.cancelled ? <Notice variant="success">Appointment cancelled.</Notice> : null}{actionData?.error ? <Notice variant="error">{actionData.error}</Notice> : null}
    <div className="mb-7 flex flex-wrap gap-3"><Link to={`/admin/appointments/${appointment.id}/edit`} className="ta-button ta-button-primary">Edit Appointment</Link>{appointment.status === "scheduled" ? <ConfirmationForm method="post" confirmation={{ title: "Cancel drop-off appointment?", description: <>Are you sure you want to cancel this drop-off appointment?<p className="mt-2 text-sm">{customerName} · {appointment.appointmentDate} · {appointment.appointmentTime || "Time TBD"}</p></>, confirmLabel: "Cancel appointment", destructive: true }}><input type="hidden" name="intent" value="cancel"/><Button variant="destructive">Cancel Appointment</Button></ConfirmationForm> : null}<Link to="/admin/appointments" className="ta-button ta-button-secondary">Back to Appointments</Link></div>
    <div className="grid gap-6 lg:grid-cols-2"><PageCard title="Appointment Details"><DetailList values={[['Date', appointment.appointmentDate], ['Time', appointment.appointmentTime || 'Time TBD'], ['Load type', appointment.loadType], ['Status', humanize(appointment.status)], ['Description', appointment.description || 'No description provided.']]}/></PageCard><PageCard title="Customer"><DetailList values={[['Name', customerName], ['Email', appointment.email], ['Phone', appointment.phone || 'Not provided']]}/></PageCard><PageCard title="Load & Item Areas" className="lg:col-span-2"><div className="grid gap-4 sm:grid-cols-3">{allocations.map((allocation) => <div key={allocation.name} className="rounded-lg border border-[#dfe1e4] bg-white p-4"><p className="font-semibold text-[#25272b]">{allocation.name}</p><p className="mt-2 text-2xl font-bold text-[#9d302f]">{allocation.percentage}%</p><p className="mt-1 text-sm text-[#5f6368]">Capacity impact: {allocation.capacityPoints} points</p></div>)}</div><p className="mt-5 text-sm text-[#5f6368]">Load capacity: {appointment.loadCapacityPoints} points · Allocated impact: {totalCapacityPoints} points</p></PageCard><PageCard title="Internal Information" className="lg:col-span-2"><p className="whitespace-pre-wrap text-[#35383d]">{appointment.adminNotes || 'No internal operational notes.'}</p></PageCard><PageCard title="Audit / Override History" className="lg:col-span-2"><p className="text-sm text-[#5f6368]">Read-only record of capacity-rule overrides.</p>{overrideHistory.length ? <ol className="mt-5 space-y-4">{overrideHistory.map((entry) => <li key={entry.id} className="rounded-lg border border-[#dfe1e4] bg-white p-4"><p className="font-semibold">{entry.occurredAt} · {entry.actorRole} #{entry.actorUserId}</p><p className="mt-2">{entry.reason}</p><p className="mt-2 text-sm"><strong>Violated rules:</strong> {entry.violatedRules.length ? entry.violatedRules.join(', ') : 'None recorded'}</p><details className="mt-3 text-sm"><summary className="cursor-pointer font-semibold text-[#9d302f]">Audit context</summary><pre className="mt-2 overflow-x-auto rounded bg-[#f3f4f6] p-3 text-xs">{JSON.stringify({ previousValues: entry.previousValues, requestedValues: entry.requestedValues, capacityContext: entry.capacityContext }, null, 2)}</pre></details></li>)}</ol> : <p className="mt-4 text-sm text-[#5f6368]">No override history has been recorded for this appointment.</p>}</PageCard></div>
  </div></PageShell>;
}

function DetailList({ values }: { values: Array<[string, string]> }) { return <dl className="grid gap-4 sm:grid-cols-2">{values.map(([label, value]) => <div key={label} className={label === 'Description' ? 'sm:col-span-2' : ''}><dt className="text-xs font-bold uppercase tracking-wide text-[#5f6368]">{label}</dt><dd className="mt-1 whitespace-pre-wrap font-medium text-[#25272b]">{value}</dd></div>)}</dl>; }
function humanize(value: string) { return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()); }
type AppointmentDetail = { id: number; appointmentDate: string; appointmentTime: string | null; description: string | null; status: string; adminNotes: string | null; loadType: string; loadCapacityPoints: number; firstName: string | null; lastName: string | null; email: string; phone: string | null; };
type AllocationDetail = { name: string; percentage: number; capacityPoints: number; };
