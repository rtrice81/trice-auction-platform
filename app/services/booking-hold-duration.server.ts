import { DEFAULT_BOOKING_HOLD_DURATION_MINUTES } from "../lib/booking-hold-duration";
export { DEFAULT_BOOKING_HOLD_DURATION_MINUTES } from "../lib/booking-hold-duration";

/** Resolves an issued hold's duration without copying inherited values to dates. */
export async function getBookingHoldDuration(db: D1Database, dropoffDayId: number) {
  const [row, setting] = await db.batch([
    db.prepare(`SELECT day.hold_duration_minutes_override AS overrideMinutes, event.hold_duration_minutes AS eventMinutes FROM dropoff_days day LEFT JOIN booking_event_dropoff_dates link ON link.dropoff_day_id=day.id LEFT JOIN booking_events event ON event.id=link.booking_event_id WHERE day.id=?`).bind(dropoffDayId),
    db.prepare("SELECT value FROM settings WHERE key='default_booking_hold_duration_minutes'"),
  ]);
  const duration = Number((setting.results[0] as { value?: string } | undefined)?.value);
  return (row.results[0] as { overrideMinutes?: number | null; eventMinutes?: number | null } | undefined)?.overrideMinutes ?? (row.results[0] as { eventMinutes?: number | null } | undefined)?.eventMinutes ?? (Number.isInteger(duration) ? duration : DEFAULT_BOOKING_HOLD_DURATION_MINUTES);
}

export function formatBookingHoldDuration(minutes: number, source: "override" | "event" | "default") {
  return `Reservation Hold: ${minutes} minutes${source === "override" ? " (override)" : source === "event" ? " (Booking Event)" : " (application default)"}`;
}
