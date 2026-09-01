import type { CustomerBookingEvent } from "../services/booking-event.server";
import { DropoffEventCard } from "./dropoff-event-card";
import { formatBookingEventTime } from "../lib/booking-event-time";
import { getBookingEventCountdownPresentation } from "../lib/booking-event-revalidation";

export function BookingEventCard({ bookingEvent, estimatedServerNowMs }: { bookingEvent: CustomerBookingEvent & { opensAtMs: number }; estimatedServerNowMs: number }) {
  const opening = formatBookingEventTime(bookingEvent.opensAt, bookingEvent.timezone, bookingEvent.timeStorageVersion);
  const statusLabel = bookingEvent.status === "closed" ? "Signup Closed" : bookingEvent.status;
  const remaining = Math.max(0, bookingEvent.opensAtMs - estimatedServerNowMs);
  const countdownPresentation = getBookingEventCountdownPresentation(remaining);
  const upcomingMessage = countdownPresentation === "scheduled" ? <p className="mb-5 rounded-lg border border-[#e9c7a6] bg-[#fff7ed] px-4 py-3 font-semibold text-[#7c2d12]">Signup opens {opening}</p> : <div className={`mb-5 rounded-lg border border-[#e9c7a6] bg-[#fff7ed] px-4 py-3 font-semibold text-[#7c2d12] ${countdownPresentation === "urgent" ? "border-2 text-center shadow-sm" : ""}`}><p className={countdownPresentation === "urgent" ? "text-2xl" : ""}>Signup opens in {formatCountdown(remaining)}</p><p className="mt-1 text-sm font-medium">Signup opens {opening}</p></div>;
  return <section className="overflow-hidden rounded-xl border border-[#dfe1e4] bg-white shadow-sm"><header className="bg-[#9d302f] px-5 py-4 text-white sm:px-6"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm font-semibold uppercase tracking-wide text-white/80">Drop-Off Signup</p><h2 className="mt-1 text-xl font-bold">{bookingEvent.name}</h2></div><span className="rounded-full bg-white/20 px-3 py-1 text-xs font-bold capitalize">{statusLabel}</span></div></header><div className="bg-[#f8f9fa] p-5 sm:p-6">{bookingEvent.description ? <p className="mb-5 whitespace-pre-wrap text-[#41454b]">{bookingEvent.description}</p> : null}{bookingEvent.status === "upcoming" ? upcomingMessage : bookingEvent.status === "closed" ? <p className="mb-5 rounded-lg border border-stone-300 bg-stone-100 px-4 py-3 font-semibold text-stone-700">Signup Closed</p> : bookingEvent.status === "full" ? <p className="mb-5 rounded-lg border border-stone-300 bg-stone-100 px-4 py-3 font-semibold text-stone-700">All current drop-off dates are full. Availability will update automatically if a spot opens.</p> : <div className="mb-5 text-sm text-[#5f6368]"><p className="font-semibold text-emerald-800">Appointments are now open</p><p className="mt-1">Signup opened {opening}</p>{bookingEvent.closesAt ? <p className="mt-1">Signup closes {formatBookingEventTime(bookingEvent.closesAt, bookingEvent.timezone, bookingEvent.timeStorageVersion)}</p> : null}</div>}<h3 className="mb-3 font-bold text-[#25272b]">Available Drop-Off Dates</h3><div className="space-y-3">{bookingEvent.dates.map((event) => <DropoffEventCard key={event.eventId} event={event}/>)}</div></div></section>;
}

function formatCountdown(milliseconds: number) {
  const totalSeconds = Math.ceil(milliseconds / 1_000);
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
