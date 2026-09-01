import { useCallback, useRef, useState } from "react";
import { Form, useNavigation, useSubmit } from "react-router";
import type { PendingBooking } from "../services/pending-booking.server";
import { Button, PageCard } from "./design-system";
import { PublicFormProtection } from "./public-form-protection";
import { AreaAllocationFields } from "./area-allocation-fields";

type BookingFormProps = {
  appointmentDate: string;
  booking: PendingBooking | null;
  dropoffTypes: Array<{ id: number; name: string }>;
  itemAreas: Array<{ id: number; name: string }>;
  isAuthenticated: boolean;
  turnstileSiteKey: string;
  formStartToken: string;
  waitlistOnly?: boolean;
};

export function CustomerBookingForm({ appointmentDate, booking, dropoffTypes, itemAreas, isAuthenticated, turnstileSiteKey, formStartToken, waitlistOnly = false }: BookingFormProps) {
  const navigation = useNavigation();
  const submitting = navigation.state !== "idle";
  const [turnstileVerified, setTurnstileVerified] = useState(false);
  const turnstileTokenRef = useRef("");
  const submit = useSubmit();
  const handleTurnstileChange = useCallback((hasToken: boolean) => setTurnstileVerified(hasToken), []);
  const requiresTurnstile = !isAuthenticated;
  return <Form method="post" className="space-y-8" onSubmit={(event) => { if (!requiresTurnstile) return; event.preventDefault(); const formData = new FormData(event.currentTarget); formData.set("cf-turnstile-response", turnstileTokenRef.current); const submittedToken = formData.get("cf-turnstile-response"); if (!turnstileVerified || typeof submittedToken !== "string" || !submittedToken) return; console.info("turnstile-submit-check", { hasToken: Boolean(submittedToken), tokenLength: typeof submittedToken === "string" ? submittedToken.length : 0, formDataHasToken: formData.has("cf-turnstile-response") }); submit(formData, { method: "post" }); }}><input type="hidden" name="appointmentDate" value={appointmentDate}/>{requiresTurnstile ? <><PublicFormProtection siteKey={turnstileSiteKey} formStartToken={formStartToken} onTokenChange={handleTurnstileChange} turnstileTokenRef={turnstileTokenRef}/></> : null}
    <fieldset><legend className="sr-only">Choose your load type</legend><PageCard title="1. Choose your load type"><div className="grid gap-4 sm:grid-cols-2">{dropoffTypes.map((dropoffType) => <label key={dropoffType.id} className="cursor-pointer rounded-2xl border border-stone-200 bg-white p-6 shadow-sm transition hover:border-[#9d302f] hover:shadow-md has-[:checked]:border-[#9d302f] has-[:checked]:ring-2 has-[:checked]:ring-[#f2d8d7]"><input required type="radio" name="dropoffTypeId" value={dropoffType.id} defaultChecked={booking ? booking.dropoffTypeId === dropoffType.id : undefined} className="sr-only"/><span className="block text-xl font-semibold text-stone-950">{dropoffType.name}</span></label>)}</div></PageCard></fieldset>
    <fieldset><legend className="sr-only">Allocate your item areas</legend><PageCard title="2. Allocate your item areas"><p className="mb-5 max-w-2xl text-sm leading-6 text-stone-600">Enter whole percentages for Smalls and Outdoor. Large/Furniture is calculated from the remaining percentage.</p><AreaAllocationFields itemAreas={itemAreas} allocations={booking?.allocations}/></PageCard></fieldset>
    <label className="block max-w-2xl text-sm font-semibold text-stone-800">What are you bringing? <span className="font-normal text-stone-500">(optional)</span><textarea name="description" rows={5} maxLength={2000} defaultValue={booking?.description ?? ""} placeholder="Example: glassware, household items, lawn mower, bedroom suite, car, tools, collectibles, etc." className="mt-2 block min-h-32 w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 font-normal leading-6 outline-none focus:border-[#9d302f] focus:ring-2 focus:ring-[#f2d8d7]"/><span className="mt-2 block text-sm font-normal leading-5 text-stone-600">Please tell us about the items you plan to bring. This is shared with our appointment team.</span></label>
    {waitlistOnly ? <p className="rounded-lg border border-violet-200 bg-violet-50 p-4 text-sm text-violet-950">This date is accepting waitlist requests. Joining the waitlist does not guarantee an appointment.</p> : null}<Button type="submit" disabled={submitting || (requiresTurnstile && !turnstileVerified)}>{submitting ? "Saving your request…" : waitlistOnly ? "Join Waitlist" : "Request drop-off appointment"}</Button>
  </Form>;
}
