import { useCallback, useEffect, useRef, useState } from "react";
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
  areaAvailability: Array<{ id: number; name: string; full: boolean }>;
  isAuthenticated: boolean;
  turnstileSiteKey: string;
  formStartToken: string;
  waitlistOnly?: boolean;
  hold?: { expiresAt: string; appointmentDate: string; dropoffTypeId: number; allocations: Array<{ itemAreaId: number; percentage: number }> } | null;
};

export function CustomerBookingForm({ appointmentDate, booking, dropoffTypes, itemAreas, areaAvailability, isAuthenticated, turnstileSiteKey, formStartToken, waitlistOnly = false, hold = null }: BookingFormProps) {
  const navigation = useNavigation();
  const submitting = navigation.state !== "idle";
  const [turnstileVerified, setTurnstileVerified] = useState(false);
  const turnstileTokenRef = useRef("");
  const submit = useSubmit();
  const handleTurnstileChange = useCallback((hasToken: boolean) => setTurnstileVerified(hasToken), []);
  const requiresTurnstile = !isAuthenticated;
  const [total, setTotal] = useState(() => (booking?.allocations ?? hold?.allocations ?? []).reduce((sum, allocation) => sum + allocation.percentage, 0));
  const fullAreas = areaAvailability.filter(area => area.full);
  const availableAreas = areaAvailability.filter(area => !area.full);
  const names = (areas: typeof areaAvailability) => areas.map(area => area.name).join(", ").replace(/, ([^,]+)$/, " and $1");
  const [now, setNow] = useState(Date.now());
  const activeHold = hold && Date.parse(`${hold.expiresAt.replace(" ", "T")}Z`) > now ? hold : null;
  const seconds = activeHold ? Math.max(0, Math.ceil((Date.parse(`${activeHold.expiresAt.replace(" ", "T")}Z`) - now) / 1000)) : 0;
  useEffect(() => { if (!activeHold) return; const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(timer); }, [activeHold?.expiresAt]);
  return <Form method="post" className="mt-8 space-y-8" onSubmit={(event) => { if (!requiresTurnstile) return; event.preventDefault(); const formData = new FormData(event.currentTarget); formData.set("cf-turnstile-response", turnstileTokenRef.current); const submittedToken = formData.get("cf-turnstile-response"); if (!turnstileVerified || typeof submittedToken !== "string" || !submittedToken) return; submit(formData, { method: "post" }); }}><input type="hidden" name="appointmentDate" value={appointmentDate}/>
    {requiresTurnstile ? <><PublicFormProtection siteKey={turnstileSiteKey} formStartToken={formStartToken} onTokenChange={handleTurnstileChange} turnstileTokenRef={turnstileTokenRef}/></> : null}
    <fieldset><legend className="sr-only">Choose your load type</legend><PageCard title="1. Choose your load type"><div className="grid gap-4 sm:grid-cols-2">{dropoffTypes.map((dropoffType) => <label key={dropoffType.id} className="cursor-pointer rounded-2xl border border-stone-200 bg-white p-6 shadow-sm transition hover:border-[#9d302f] hover:shadow-md has-[:checked]:border-[#9d302f] has-[:checked]:ring-2 has-[:checked]:ring-[#f2d8d7]"><input required type="radio" name="dropoffTypeId" value={dropoffType.id} defaultChecked={booking ? booking.dropoffTypeId === dropoffType.id : undefined} className="sr-only"/><span className="block text-xl font-semibold text-stone-950">{dropoffType.name}</span></label>)}</div></PageCard></fieldset>
    <fieldset><legend className="sr-only">Allocate your item areas</legend><PageCard title="2. Allocate your item areas"><p className="mb-5 max-w-2xl text-sm leading-6 text-stone-600">Enter whole percentages for every area. Your allocations must total exactly 100% before space can be reserved.</p>{fullAreas.length ? <p className="mb-5 rounded-lg bg-amber-50 p-4 text-sm font-semibold text-amber-950" role="status">{availableAreas.length ? `${names(fullAreas)} ${fullAreas.length === 1 ? "capacity is" : "capacities are"} full for this drop-off date. We can currently accept ${names(availableAreas)} items${availableAreas.length === 1 ? " only" : ""}.` : "Storage capacity for this drop-off date is full."}</p> : null}<AreaAllocationFields key={areaAvailability.map(area => `${area.id}:${area.full}`).join("|")} itemAreas={itemAreas} allocations={booking?.allocations ?? hold?.allocations} fullAreaIds={fullAreas.map(area => area.id)} onTotalChange={setTotal}/></PageCard></fieldset>
    {activeHold ? <PageCard title="Your reserved space"><p className="text-lg font-bold text-emerald-800">Your space is reserved for {String(Math.floor(seconds / 60)).padStart(2, "0")}:{String(seconds % 60).padStart(2, "0")}</p><p className="mt-2 text-sm text-stone-600">Complete your booking before the timer expires. If the hold expires, the space may become available to another customer.</p></PageCard> : null}
    {!activeHold ? <Button name="intent" value="reserve" type="submit" disabled={submitting || availableAreas.length === 0 || waitlistOnly || total !== 100 || (requiresTurnstile && !turnstileVerified)}>{submitting ? "Checking availability…" : "Reserve My Space"}</Button> : <><label className="block max-w-2xl text-sm font-semibold text-stone-800">What are you bringing? <span className="font-normal text-stone-500">(optional)</span><textarea name="description" rows={5} maxLength={2000} defaultValue={booking?.description ?? ""} className="mt-2 block min-h-32 w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 font-normal leading-6"/></label><Button name="intent" value="complete" type="submit" disabled={submitting || !isAuthenticated}>{submitting ? "Completing booking…" : isAuthenticated ? "Complete booking" : "Log in or create an account to complete booking"}</Button></>}
  </Form>;
}
