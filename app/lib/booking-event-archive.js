import { CUSTOMER_BOOKING_TIMEZONE, calendarDateInTimezone } from "./booking-event-visibility.js";

/**
 * The admin archive state is intentionally independent from the signup window
 * and the event's active flag. It is derived only from the latest child
 * Drop-Off Date, using the operational (New York) calendar.
 *
 * @param {readonly string[]} dropoffDates ISO calendar dates (YYYY-MM-DD)
 * @returns {string | null}
 */
export function finalDropoffDate(dropoffDates) {
  /** @type {string | null} */
  let latest = null;
  for (const date of dropoffDates) if (!latest || date > latest) latest = date;
  return latest;
}

/** @param {readonly string[]} dropoffDates ISO calendar dates (YYYY-MM-DD) @param {Date} [now] */
export function isBookingEventArchived(dropoffDates, now = new Date()) {
  const finalDate = finalDropoffDate(dropoffDates);
  return finalDate !== null && finalDate < calendarDateInTimezone(now, CUSTOMER_BOOKING_TIMEZONE);
}

/** @param {readonly string[]} dropoffDates ISO calendar dates (YYYY-MM-DD) @param {Date} [now] */
export function bookingEventArchiveStatus(dropoffDates, now = new Date()) {
  return isBookingEventArchived(dropoffDates, now) ? "archived" : "upcoming";
}

/** @param {string | null} view */
export function adminBookingEventsView(view) {
  return view === "archived" ? "archived" : "upcoming";
}
