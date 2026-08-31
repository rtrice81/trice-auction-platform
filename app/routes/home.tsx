import { env } from "cloudflare:workers";
import { data, Form, Link, redirect, useNavigation } from "react-router";
import { useState } from "react";

import type { Route } from "./+types/home";
import { createBooking, getBookingOptions } from "../services/booking.server";
import { getCurrentUser } from "../services/auth.server";
import { clearPendingBookingCookie, createPendingBooking, deletePendingBooking, getPendingBooking, getPendingBookingToken, pendingBookingCookie, pendingBookingFromForm } from "../services/pending-booking.server";
import { bookingSuccessFlashCookie, createBookingSuccessFlash } from "../services/booking-success-flash.server";
import { Button, Notice, PageCard, PageIntro, PageShell } from "../components/design-system";
import { PendingBookingDialog } from "../components/pending-booking-dialog";
import { PublicFormProtection } from "../components/public-form-protection";
import { createPublicFormStart, verifyPublicFormSubmission } from "../services/public-form-protection.server";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Schedule a Drop-Off | Trice Auctions" },
    {
      name: "description",
      content: "Schedule your consignment drop-off with Trice Auctions.",
    },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  const runtime = env as unknown as { AUTH_SECRET?: string; BETTER_AUTH_URL?: string; TURNSTILE_SITE_KEY?: string; TURNSTILE_SECRET_KEY?: string };
  const user = await getCurrentUser(request, env.trice_auction_db, runtime);
  const token = getPendingBookingToken(request);
  const [options, pendingBooking] = await Promise.all([
    getBookingOptions(env.trice_auction_db),
    user ? getPendingBooking(env.trice_auction_db, token) : Promise.resolve(null),
  ]);
  const protection = user ? null : await createPublicFormStart(request, "public-booking", runtime);
  return data({
    dropoffTypes: options.dropoffTypes.map(({ id, name }) => ({ id, name })),
    itemAreas: options.itemAreas.map(({ id, name }) => ({ id, name })),
    availableDates: options.availableDates,
    pendingBooking,
    resumed: Boolean(user && pendingBooking),
    isAuthenticated: Boolean(user),
    turnstileSiteKey: runtime.TURNSTILE_SITE_KEY ?? "",
    formStartToken: protection?.token ?? "",
  }, protection ? { headers: protection.headers } : undefined);
}

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const pendingBooking = pendingBookingFromForm(formData);
  const user = await getCurrentUser(request, env.trice_auction_db, env as unknown as { AUTH_SECRET?: string; BETTER_AUTH_URL?: string });
  if (!user) {
    if (!hasBasicPublicBookingFields(pendingBooking)) return data({ ok: false as const, requiresAuthentication: false, errors: ["We couldn’t verify this submission. Please try again."], submitted: pendingBooking }, { status: 400 });
    const protection = await verifyPublicFormSubmission({ request, formData, form: "public-booking", runtime: env as unknown as { AUTH_SECRET?: string; TURNSTILE_SECRET_KEY?: string }, db: env.trice_auction_db, rateLimit: { maximumAttempts: 12, windowSeconds: 600 } });
    if (!protection.ok) return data({ ok: false as const, requiresAuthentication: false, errors: [protection.error], submitted: pendingBooking }, { status: 400 });
    const token = await createPendingBooking(env.trice_auction_db, pendingBooking, getPendingBookingToken(request));
    return data({ ok: false as const, requiresAuthentication: true, errors: [] as string[], submitted: pendingBooking }, { headers: { "Set-Cookie": pendingBookingCookie(token, request) } });
  }

  const result = await createBooking(env.trice_auction_db, {
    userId: user.id,
    ...pendingBooking,
  });
  if (result.ok) {
    const token = getPendingBookingToken(request);
    const flashToken = await createBookingSuccessFlash(env.trice_auction_db, user.id, result.appointmentId);
    await deletePendingBooking(env.trice_auction_db, token);
    const headers = new Headers();
    headers.append("Set-Cookie", clearPendingBookingCookie(request));
    headers.append("Set-Cookie", bookingSuccessFlashCookie(flashToken, request));
    return redirect("/my-appointments", { headers });
  }
  return data({ ...result, submitted: pendingBooking }, { status: 400 });
}

export default function Home({ loaderData, actionData }: Route.ComponentProps) {
  const booking = actionData && "submitted" in actionData ? actionData.submitted : loaderData.pendingBooking;
  const needsAuthentication = Boolean(actionData && "requiresAuthentication" in actionData && actionData.requiresAuthentication);
  const [dismissedAccountPrompt, setDismissedAccountPrompt] = useState(false);
  const navigation = useNavigation();
  const submitting = navigation.state !== "idle";
  return (
    <PageShell><div className="max-w-5xl">
        <PageIntro eyebrow="Drop-off appointments" title="Schedule a Consignment Drop-Off">Choose your load and tell us how it is divided between our intake areas. Current capacity is confirmed when you submit your request.</PageIntro>

        {loaderData.resumed ? <Notice variant="warning"><p className="font-semibold">Your pending booking has been restored.</p><p className="mt-1">Availability will be checked again when you submit.</p></Notice> : null}

        {needsAuthentication ? <noscript><Notice variant="warning"><p className="font-semibold">You’re almost done</p><p className="mt-1">An account is required to complete your drop-off request. Your appointment details have been saved for two hours.</p><div className="mt-4 flex flex-wrap gap-3"><Link to="/login" className="ta-button ta-button-primary">Log In</Link><Link to="/register" className="ta-button ta-button-secondary">Create Account</Link></div></Notice></noscript> : null}

        {actionData && !actionData.ok && !needsAuthentication ? (
          <Notice variant="error">
            <p className="font-semibold">We could not schedule this drop-off.</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
              {actionData.errors.map((error) => <li key={error}>{error}</li>)}
            </ul>
          </Notice>
        ) : null}

        <Form method="post" action="?index" className="space-y-10">
          {!loaderData.isAuthenticated ? <PublicFormProtection siteKey={loaderData.turnstileSiteKey} formStartToken={loaderData.formStartToken}/> : null}
          <PageCard title="1. Your drop-off">
            <div className="grid gap-5 sm:grid-cols-2">
              <label className="text-sm font-semibold text-stone-800">
                Preferred drop-off date
                <select required name="appointmentDate" defaultValue={booking?.appointmentDate ?? ""} disabled={loaderData.availableDates.length === 0} className="mt-2 block w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 font-normal outline-none focus:border-amber-600 focus:ring-2 focus:ring-amber-100">
                  <option value="">{loaderData.availableDates.length === 0 ? "No drop-off dates are currently available" : "Choose an available date"}</option>
                  {loaderData.availableDates.map((date) => <option key={date.date} value={date.date}>{date.date}{date.eventName ? ` — ${date.eventName}` : ""}</option>)}
                </select>
                {booking && !loaderData.availableDates.some((date) => date.date === booking.appointmentDate) ? <span className="mt-2 block text-sm font-normal text-amber-800">Your saved date is no longer available. Choose another open date.</span> : null}
              </label>
            </div>
          </PageCard>

          <fieldset><legend className="sr-only">Choose your load type</legend><PageCard title="2. Choose your load type">
            <div className="grid gap-4 sm:grid-cols-2">
              {loaderData.dropoffTypes.map((dropoffType) => (
                <label key={dropoffType.id} className="cursor-pointer rounded-2xl border border-stone-200 bg-white p-6 shadow-sm transition hover:border-amber-500 hover:shadow-md has-[:checked]:border-amber-600 has-[:checked]:ring-2 has-[:checked]:ring-amber-100">
                  <input
                    required
                    type="radio"
                    name="dropoffTypeId"
                    value={dropoffType.id}
                    defaultChecked={booking ? booking.dropoffTypeId === dropoffType.id : undefined}
                    className="sr-only"
                  />
                  <span className="block text-xl font-semibold text-stone-950">{dropoffType.name}</span>
                </label>
              ))}
            </div></PageCard></fieldset>

          <fieldset><legend className="sr-only">Allocate your item areas</legend><PageCard title="3. Allocate your item areas">
            <p className="mb-5 max-w-2xl text-sm leading-6 text-stone-600">
              Enter whole percentages for every active area. They must add up to exactly 100%.
            </p>
            <div className="grid gap-4 sm:grid-cols-3">
              {loaderData.itemAreas.map((area, index) => (
                <label key={area.id} className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
                  <span className="block font-semibold text-stone-950">{area.name}</span>
                  <span className="mt-1 block text-sm text-stone-600">Percentage of this load</span>
                  <span className="mt-4 flex items-center gap-2">
                    <input
                      required
                      type="number"
                      name={`allocation-${area.id}`}
                      min="0"
                      max="100"
                      step="1"
                      defaultValue={booking?.allocations.find((allocation) => allocation.itemAreaId === area.id)?.percentage ?? (index === 0 ? 100 : 0)}
                      className="block w-20 rounded-lg border border-stone-300 bg-white px-3 py-2 font-semibold outline-none focus:border-amber-600 focus:ring-2 focus:ring-amber-100"
                    />
                    <span className="text-sm text-stone-500">%</span>
                  </span>
                </label>
              ))}
            </div></PageCard></fieldset>

          <label className="block max-w-2xl text-sm font-semibold text-stone-800">
            Notes about your items <span className="font-normal text-stone-500">(optional)</span>
            <textarea
              name="description"
              rows={4}
              defaultValue={booking?.description ?? ""}
              className="mt-2 block w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 font-normal outline-none focus:border-amber-600 focus:ring-2 focus:ring-amber-100"
            />
          </label>

          <Button type="submit" disabled={loaderData.availableDates.length === 0 || submitting}>{submitting ? "Saving your request…" : "Request drop-off appointment"}</Button>
        </Form>
        <PendingBookingDialog open={needsAuthentication && !dismissedAccountPrompt} onClose={() => setDismissedAccountPrompt(true)} />
      </div>
    </PageShell>
  );
}

function hasBasicPublicBookingFields(booking: ReturnType<typeof pendingBookingFromForm>) {
  return Boolean(booking.appointmentDate) && Number.isInteger(booking.dropoffTypeId) && booking.dropoffTypeId > 0 && booking.allocations.length > 0;
}
