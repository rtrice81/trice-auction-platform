import { useCallback, useRef, useState } from "react";
import { Form, useNavigation, useSubmit } from "react-router";
import type { PendingBooking } from "../services/pending-booking.server";
import { Button, PageCard } from "./design-system";
import { PublicFormProtection } from "./public-form-protection";

type BookingFormProps = {
  appointmentDate: string;
  booking: PendingBooking | null;
  dropoffTypes: Array<{ id: number; name: string }>;
  itemAreas: Array<{ id: number; name: string }>;
  isAuthenticated: boolean;
  turnstileSiteKey: string;
  formStartToken: string;
};

export function CustomerBookingForm({ appointmentDate, booking, dropoffTypes, itemAreas, isAuthenticated, turnstileSiteKey, formStartToken }: BookingFormProps) {
  const navigation = useNavigation();
  const submitting = navigation.state !== "idle";
  const [turnstileVerified, setTurnstileVerified] = useState(false);
  const turnstileTokenRef = useRef("");
  const submit = useSubmit();
  const handleTurnstileChange = useCallback((hasToken: boolean) => setTurnstileVerified(hasToken), []);
  const requiresTurnstile = !isAuthenticated;
  return <Form method="post" className="space-y-8" onSubmit={(event) => { if (!requiresTurnstile) return; event.preventDefault(); const formData = new FormData(event.currentTarget); formData.set("cf-turnstile-response", turnstileTokenRef.current); const submittedToken = formData.get("cf-turnstile-response"); if (!turnstileVerified || typeof submittedToken !== "string" || !submittedToken) return; console.info("turnstile-submit-check", { hasToken: Boolean(submittedToken), tokenLength: typeof submittedToken === "string" ? submittedToken.length : 0, formDataHasToken: formData.has("cf-turnstile-response") }); submit(formData, { method: "post" }); }}><input type="hidden" name="appointmentDate" value={appointmentDate}/>{requiresTurnstile ? <><PublicFormProtection siteKey={turnstileSiteKey} formStartToken={formStartToken} onTokenChange={handleTurnstileChange} turnstileTokenRef={turnstileTokenRef}/></> : null}
    <fieldset><legend className="sr-only">Choose your load type</legend><PageCard title="1. Choose your load type"><div className="grid gap-4 sm:grid-cols-2">{dropoffTypes.map((dropoffType) => <label key={dropoffType.id} className="cursor-pointer rounded-2xl border border-stone-200 bg-white p-6 shadow-sm transition hover:border-[#9d302f] hover:shadow-md has-[:checked]:border-[#9d302f] has-[:checked]:ring-2 has-[:checked]:ring-[#f2d8d7]"><input required type="radio" name="dropoffTypeId" value={dropoffType.id} defaultChecked={booking ? booking.dropoffTypeId === dropoffType.id : undefined} className="sr-only"/><span className="block text-xl font-semibold text-stone-950">{dropoffType.name}</span></label>)}</div></PageCard></fieldset>
    <fieldset><legend className="sr-only">Allocate your item areas</legend><PageCard title="2. Allocate your item areas"><p className="mb-5 max-w-2xl text-sm leading-6 text-stone-600">Enter whole percentages for every active area. They must add up to exactly 100%.</p><div className="grid gap-4 sm:grid-cols-3">{itemAreas.map((area, index) => <label key={area.id} className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm"><span className="block font-semibold text-stone-950">{area.name}</span><span className="mt-1 block text-sm text-stone-600">Percentage of this load</span><span className="mt-4 flex items-center gap-2"><input required type="number" name={`allocation-${area.id}`} min="0" max="100" step="1" defaultValue={booking?.allocations.find((allocation) => allocation.itemAreaId === area.id)?.percentage ?? (index === 0 ? 100 : 0)} className="block w-20 rounded-lg border border-stone-300 bg-white px-3 py-2 font-semibold outline-none focus:border-[#9d302f] focus:ring-2 focus:ring-[#f2d8d7]"/><span className="text-sm text-stone-500">%</span></span></label>)}</div></PageCard></fieldset>
    <label className="block max-w-2xl text-sm font-semibold text-stone-800">Notes about your items <span className="font-normal text-stone-500">(optional)</span><textarea name="description" rows={4} defaultValue={booking?.description ?? ""} className="mt-2 block w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 font-normal outline-none focus:border-[#9d302f] focus:ring-2 focus:ring-[#f2d8d7]"/></label>
    <Button type="submit" disabled={submitting || (requiresTurnstile && !turnstileVerified)}>{submitting ? "Saving your request…" : "Request drop-off appointment"}</Button>
  </Form>;
}
