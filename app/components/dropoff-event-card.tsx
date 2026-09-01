import { Link } from "react-router";
import type { CustomerDropoffDate } from "../services/booking-event.server";
import { AvailabilityBadge } from "./availability-badge";

export function DropoffEventCard({ event }: { event: CustomerDropoffDate }) {
  return <article className="flex flex-col gap-4 rounded-xl border border-[#dfe1e4] bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
    <div>
      <p className="font-bold text-[#25272b]">{formatDropoffDate(event.eventDate)}</p>
      {event.eventName ? <p className="mt-1 text-sm text-[#5f6368]">{event.eventName}</p> : null}
      {event.description?.trim() ? <p className="mt-2 whitespace-pre-wrap text-sm text-[#41454b]">{event.description}</p> : null}
      <div className="mt-3"><AvailabilityBadge label={event.availability}/></div>
    </div>
    {event.bookable ? <Link to={`/dropoffs/${event.eventId}/book`} className="ta-button ta-button-primary w-full sm:w-auto">{event.availability === "Waitlist" ? "Join Waitlist" : "Request Appointment"}</Link> : <button type="button" disabled className="ta-button ta-button-secondary w-full sm:w-auto">Request Appointment</button>}
  </article>;
}

export function formatDropoffDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
}
