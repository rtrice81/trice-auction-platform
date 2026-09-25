import { DEFAULT_BOOKING_HOLD_DURATION_MINUTES } from "../lib/booking-hold-duration";
export { DEFAULT_BOOKING_HOLD_DURATION_MINUTES } from "../lib/booking-hold-duration";

/** Resolves an issued hold's duration without copying inherited values to dates. */
export async function getBookingHoldDuration(db: D1Database, dropoffDayId: number) {
  const row = await db.prepare(`SELECT day.hold_duration_minutes_override AS overrideMinutes, event.hold_duration_minutes AS eventMinutes FROM dropoff_days day LEFT JOIN booking_event_dropoff_dates link ON link.dropoff_day_id=day.id LEFT JOIN booking_events event ON event.id=link.booking_event_id WHERE day.id=?`).bind(dropoffDayId).first<{ overrideMinutes: number | null; eventMinutes: number | null }>();
  return row?.overrideMinutes ?? row?.eventMinutes ?? DEFAULT_BOOKING_HOLD_DURATION_MINUTES;
}

export function formatBookingHoldDuration(minutes: number, source: "override" | "event" | "default") {
  return `Reservation Hold: ${minutes} minutes${source === "override" ? " (override)" : source === "event" ? " (Booking Event)" : " (application default)"}`;
}
