import { env } from "cloudflare:workers";
import { data, Link, redirect } from "react-router";
import { useState } from "react";
import type { Route } from "./+types/dropoffs.book";
import { createBooking, getBookingOptions } from "../services/booking.server";
import { getCurrentUser } from "../services/auth.server";
import { clearPendingBookingCookie, createPendingBooking, deletePendingBooking, getPendingBooking, getPendingBookingToken, pendingBookingCookie, pendingBookingFromForm } from "../services/pending-booking.server";
import { bookingSuccessFlashCookie, createBookingSuccessFlash } from "../services/booking-success-flash.server";
import { createPublicFormStart, verifyPublicFormSubmission } from "../services/public-form-protection.server";
import { getCustomerDropoffDateById } from "../services/booking-event.server";
import { CustomerBookingForm } from "../components/customer-booking-form";
import { formatDropoffDate } from "../components/dropoff-event-card";
import { AvailabilityBadge } from "../components/availability-badge";
import { queueAppointmentCreated } from "../services/notification.server";
import { Notice, PageCard, PageIntro, PageShell } from "../components/design-system";
import { PendingBookingDialog } from "../components/pending-booking-dialog";

const runtime = env as unknown as { AUTH_SECRET?: string; BETTER_AUTH_URL?: string; TURNSTILE_SITE_KEY?: string; TURNSTILE_SECRET_KEY?: string };

export function meta({}: Route.MetaArgs) { return [{ title: "Request a Drop-Off Appointment | Trice Auctions" }]; }

export async function loader({ request, params }: Route.LoaderArgs) {
  const eventId = Number(params.eventId);
  if (!Number.isInteger(eventId) || eventId < 1) throw data("Drop-Off Event not found.", { status: 404 });
  const [user, selected] = await Promise.all([getCurrentUser(request, env.trice_auction_db, runtime), getCustomerDropoffDateById(env.trice_auction_db, eventId)]);
  if (!selected) throw data("Drop-Off Event not found.", { status: 404 });
  const pendingBooking = user ? await getPendingBooking(env.trice_auction_db, getPendingBookingToken(request)) : null;
  const protection = user || !selected.date.bookable ? null : await createPublicFormStart(request, "public-booking", runtime);
  const options = selected.date.bookable ? await getBookingOptions(env.trice_auction_db) : null;
  return data({ selected, pendingBooking: pendingBooking?.appointmentDate === selected.date.eventDate ? pendingBooking : null, resumed: new URL(request.url).searchParams.get("resume") === "1" && Boolean(pendingBooking), isAuthenticated: Boolean(user), turnstileSiteKey: runtime.TURNSTILE_SITE_KEY ?? "", formStartToken: protection?.token ?? "", dropoffTypes: options?.dropoffTypes.map(({ id, name }) => ({ id, name })) ?? [], itemAreas: options?.itemAreas.map(({ id, name }) => ({ id, name })) ?? [] }, protection ? { headers: protection.headers } : undefined);
}

export async function action({ request, params }: Route.ActionArgs) {
  const eventId = Number(params.eventId);
  const selected = Number.isInteger(eventId) ? await getCustomerDropoffDateById(env.trice_auction_db, eventId) : null;
  if (!selected || !selected.date.bookable) return data({ ok: false as const, requiresAuthentication: false, errors: ["This drop-off date is not currently available for signup."] }, { status: 400 });
  const formData = await request.formData();
  const pendingBooking = { ...pendingBookingFromForm(formData), appointmentDate: selected.date.eventDate };
  const user = await getCurrentUser(request, env.trice_auction_db, runtime);
  if (!user) {
    if (!hasBasicPublicBookingFields(pendingBooking)) return data({ ok: false as const, requiresAuthentication: false, errors: ["We couldn’t verify this submission. Please try again."], submitted: pendingBooking }, { status: 400 });
    const protection = await verifyPublicFormSubmission({ request, formData, form: "public-booking", runtime, db: env.trice_auction_db, rateLimit: { maximumAttempts: 12, windowSeconds: 600 } });
    if (!protection.ok) return data({ ok: false as const, requiresAuthentication: false, errors: [protection.error], submitted: pendingBooking }, { status: 400 });
    const token = await createPendingBooking(env.trice_auction_db, pendingBooking, getPendingBookingToken(request));
    return data({ ok: false as const, requiresAuthentication: true, errors: [] as string[], submitted: pendingBooking }, { headers: { "Set-Cookie": pendingBookingCookie(token, request) } });
  }
  const result = await createBooking(env.trice_auction_db, { userId: user.id, ...pendingBooking });
  if (result.ok) {
    await queueAppointmentCreated(env.trice_auction_db, result.appointmentId, env as never, user.email, result.status);
    const token = getPendingBookingToken(request); const flashToken = await createBookingSuccessFlash(env.trice_auction_db, user.id, result.appointmentId); await deletePendingBooking(env.trice_auction_db, token);
    const headers = new Headers(); headers.append("Set-Cookie", clearPendingBookingCookie(request)); headers.append("Set-Cookie", bookingSuccessFlashCookie(flashToken, request));
    return redirect("/my-appointments", { headers });
  }
  return data({ ...result, submitted: pendingBooking }, { status: 400 });
}

export default function BookDropoff({ loaderData, actionData }: Route.ComponentProps) {
  const booking = actionData && "submitted" in actionData ? actionData.submitted : loaderData.pendingBooking;
  const needsAuthentication = Boolean(actionData && "requiresAuthentication" in actionData && actionData.requiresAuthentication);
  const [dismissedAccountPrompt, setDismissedAccountPrompt] = useState(false);
  const { date: event, bookingEvent } = loaderData.selected;
  return <PageShell><div className="max-w-5xl"><Link to="/" className="text-sm font-bold text-[#9d302f] underline underline-offset-4">← All drop-off dates</Link><PageIntro eyebrow={bookingEvent.name} title="Request a Drop-Off Appointment">Complete the details below for your selected drop-off date.</PageIntro>
    <PageCard title="Selected Drop-Off Event"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xl font-bold text-[#25272b]">{formatDropoffDate(event.eventDate)}</p>{event.eventName ? <p className="mt-1 text-[#5f6368]">{event.eventName}</p> : null}{event.description?.trim() ? <p className="mt-3 max-w-2xl whitespace-pre-wrap text-[#41454b]">{event.description}</p> : null}</div><AvailabilityBadge label={event.availability}/></div></PageCard>
    {loaderData.resumed ? <Notice variant="warning"><p className="font-semibold">Your pending booking has been restored.</p><p className="mt-1">Availability will be checked again when you submit.</p></Notice> : null}
    {actionData && !actionData.ok && !needsAuthentication ? <Notice variant="error"><p className="font-semibold">We could not schedule this drop-off.</p><ul className="mt-2 list-disc space-y-1 pl-5 text-sm">{actionData.errors.map((error) => <li key={error}>{error}</li>)}</ul></Notice> : null}
    {!event.bookable ? <Notice variant="warning">This drop-off event is not currently available for signup. Please choose another scheduled event.</Notice> : <CustomerBookingForm appointmentDate={event.eventDate} booking={booking} dropoffTypes={loaderData.dropoffTypes} itemAreas={loaderData.itemAreas} isAuthenticated={loaderData.isAuthenticated} turnstileSiteKey={loaderData.turnstileSiteKey} formStartToken={loaderData.formStartToken} waitlistOnly={event.availability === "Waitlist"}/>}
    <PendingBookingDialog open={needsAuthentication && !dismissedAccountPrompt} onClose={() => setDismissedAccountPrompt(true)}/>
  </div></PageShell>;
}

function hasBasicPublicBookingFields(booking: ReturnType<typeof pendingBookingFromForm>) { return Boolean(booking.appointmentDate) && Number.isInteger(booking.dropoffTypeId) && booking.dropoffTypeId > 0 && booking.allocations.length > 0; }
