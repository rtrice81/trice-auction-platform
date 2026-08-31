import type { CustomerBookingRelease } from "../services/booking-release.server";
import { DropoffEventCard } from "./dropoff-event-card";

export function BookingReleaseCard({ release }: { release: CustomerBookingRelease }) {
  const opening = formatReleaseTime(release.opensAt, release.timezone);
  return <section className="overflow-hidden rounded-xl border border-[#dfe1e4] bg-white shadow-sm">
    <header className="bg-[#9d302f] px-5 py-4 text-white sm:px-6"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm font-semibold uppercase tracking-wide text-white/80">Drop-Off Signup</p><h2 className="mt-1 text-xl font-bold">{release.name}</h2></div><span className="rounded-full bg-white/20 px-3 py-1 text-xs font-bold capitalize">{release.status}</span></div></header>
    <div className="bg-[#f8f9fa] p-5 sm:p-6">
      {release.status === "upcoming" ? <p className="mb-5 rounded-lg border border-[#e9c7a6] bg-[#fff7ed] px-4 py-3 font-semibold text-[#7c2d12]">Signup opens {opening}</p> : <div className="mb-5 text-sm text-[#5f6368]"><p>Signup opened {opening}</p>{release.closesAt ? <p className="mt-1">Signup closes {formatReleaseTime(release.closesAt, release.timezone)}</p> : null}</div>}
      <div className="space-y-3">{release.events.map((event) => <DropoffEventCard key={event.eventId} event={event}/>)}</div>
    </div>
  </section>;
}

export function formatReleaseTime(value: string, timezone: string) {
  return new Intl.DateTimeFormat("en-US", { timeZone: timezone, month: "long", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));
}
