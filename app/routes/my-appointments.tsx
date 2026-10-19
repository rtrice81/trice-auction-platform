import { env } from "cloudflare:workers";
import { data, Link } from "react-router";
import type { Route } from "./+types/my-appointments";
import { requireOwnership, requireRole, requireUser } from "../services/auth.server";
import { clearBookingSuccessFlashCookie, consumeBookingSuccessFlash, getBookingSuccessFlashToken } from "../services/booking-success-flash.server";
import { ConfirmationForm } from "../components/confirmation-form";
import { Button, Notice, PageCard, PageIntro, PageShell } from "../components/design-system";
import { cancelWaitlistableAppointment } from "../services/notification.server";
import { upcomingPastView } from "../lib/booking-event-archive.js";

import { getCustomerAppointments } from "../services/customer-appointments.server";

const runtime = env as unknown as { AUTH_SECRET?: string; BETTER_AUTH_URL?: string };

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireUser(request, env.trice_auction_db, runtime);
  const token = getBookingSuccessFlashToken(request);
  const view = upcomingPastView(new URL(request.url).searchParams.get("view"));
  const [appointments, bookingSuccess] = await Promise.all([
    getCustomerAppointments(env.trice_auction_db, user.id, view),
    consumeBookingSuccessFlash(env.trice_auction_db, user.id, token),
  ]);
  return data({ appointments, bookingSuccess, view }, token ? { headers: { "Set-Cookie": clearBookingSuccessFlashCookie(request) } } : undefined);
}

export async function action({ request }: Route.ActionArgs) {
  const user = await requireRole(request, env.trice_auction_db, runtime, "consignor");
  const form = await request.formData();
  if (form.has("pickupId") || (form.has("appointmentType") && form.get("appointmentType") !== "dropoff")) {
    return data({ error: "Pickup appointments can only be changed by Trice Auctions." }, { status: 405 });
  }
  const id = Number(form.get("appointmentId"));
  const appointment = await env.trice_auction_db.prepare("SELECT user_id AS userId, status FROM appointments WHERE id=?").bind(id).first<{ userId: number; status: string }>();
  if (!appointment) return data({ error: "Appointment not found." }, { status: 404 });
  requireOwnership(user, appointment.userId);
  const result = await cancelWaitlistableAppointment(env.trice_auction_db, id, env as never, user.email);
  return result.cancelled ? data({ message: "Appointment cancelled." }) : data({ error: "Only confirmed or waitlisted appointments can be cancelled." }, { status: 400 });
}

export default function MyAppointments({ loaderData, actionData }: Route.ComponentProps) {
  const past = loaderData.view === "past";
  return <PageShell><div className="max-w-4xl"><PageIntro eyebrow="Customer portal" title="My Appointments">Review your drop-offs and pickups. Pickup appointments are managed by Trice Auctions.</PageIntro><nav className="mb-7 flex gap-2 border-b border-[#dfe1e4]" aria-label="My Appointment views"><Link to="/my-appointments" aria-current={!past ? "page" : undefined} className={`rounded-t-lg px-4 py-2 font-bold ${!past ? "bg-[#9d302f] text-white" : "text-[#9d302f] underline"}`}>Upcoming</Link><Link to="/my-appointments?view=past" aria-current={past ? "page" : undefined} className={`rounded-t-lg px-4 py-2 font-bold ${past ? "bg-[#9d302f] text-white" : "text-[#9d302f] underline"}`}>Past</Link></nav>{loaderData.bookingSuccess && <Notice variant="success"><p className="font-semibold">Your drop-off appointment was created.</p><p className="mt-1">{loaderData.bookingSuccess.appointmentDate} · {loaderData.bookingSuccess.loadType}</p></Notice>}{actionData && "message" in actionData && <Notice variant="success">{actionData.message}</Notice>}{actionData && "error" in actionData && <Notice variant="error">{actionData.error}</Notice>}<div className="space-y-5">{loaderData.appointments.map((appointment) => appointment.kind === "pickup" ? <PageCard key={`pickup-${appointment.id}`} title={appointment.title}>
        <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-bold text-blue-950">Consignment Pickup</span>
        <p className="mt-3 font-medium text-[#555960]">{appointment.appointmentDate}{appointment.arrivalTime ? ` · ${appointment.arrivalTime} (Eastern time)` : ""} · {appointment.status}</p>
        <p className="mt-2 whitespace-pre-line text-sm text-[#555960]">{[appointment.addressLine1, appointment.addressLine2, `${appointment.city}, ${appointment.state} ${appointment.postalCode}`].filter(Boolean).join("\n")}</p>
        <div className="mt-4 flex flex-wrap items-center gap-3">{appointment.dateStatus === "past" ? <span className="rounded-full bg-stone-800 px-3 py-1 text-xs font-bold text-white">Past</span> : null}<Link className="ta-button ta-button-secondary" to={`/my-appointments/pickups/${appointment.id}`}>View Appointment</Link></div>
      </PageCard> : <PageCard key={`dropoff-${appointment.id}`} title={`${appointment.eventName || appointment.appointmentDate} · ${appointment.loadType}`}><span className="mb-3 inline-block rounded-full bg-stone-100 px-3 py-1 text-xs font-bold text-stone-800">Drop-Off</span><div className="flex flex-wrap items-center justify-between gap-4"><p className="font-medium capitalize text-[#555960]">{appointment.appointmentDate} · {appointment.status}{appointment.visibility === "private" ? " · Private appointment" : ""}</p><div className="flex flex-wrap gap-3">{appointment.dateStatus === "past" ? <span className="rounded-full bg-stone-800 px-3 py-1 text-xs font-bold text-white">Past</span> : null}<Link className="ta-button ta-button-secondary" to={`/my-appointments/${appointment.id}`}>{appointment.visibility === "private" ? "View" : "View / edit"}</Link>{appointment.status === "scheduled" && <ConfirmationForm confirmation={{ title: "Cancel drop-off appointment?", description: <><p>Are you sure you want to cancel this drop-off appointment?</p><p className="mt-2 text-sm">{appointment.appointmentDate} · {appointment.loadType}</p></>, confirmLabel: "Cancel appointment", destructive: true }} method="post"><input type="hidden" name="appointmentType" value="dropoff"/><input type="hidden" name="appointmentId" value={appointment.id}/><Button variant="destructive">Cancel</Button></ConfirmationForm>}</div></div></PageCard>)}{!loaderData.appointments.length && <PageCard title={past ? "No Past Appointments" : "No Upcoming Appointments"}><p>{past ? "Past appointments remain available for your records." : <>When you are ready, <Link className="font-bold text-[#9d302f] underline" to="/">schedule a drop-off</Link>.</>}</p></PageCard>}</div></div></PageShell>;
}
