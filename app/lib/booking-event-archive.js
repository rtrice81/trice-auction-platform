import { CUSTOMER_BOOKING_TIMEZONE, calendarDateInTimezone } from "./booking-event-visibility.js";

/**
 * The past-date state is intentionally independent from the signup window
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
export function isBookingEventPast(dropoffDates, now = new Date()) {
  const finalDate = finalDropoffDate(dropoffDates);
  return finalDate !== null && finalDate < calendarDateInTimezone(now, CUSTOMER_BOOKING_TIMEZONE);
}

/** @param {readonly string[]} dropoffDates ISO calendar dates (YYYY-MM-DD) @param {Date} [now] */
export function bookingEventDateStatus(dropoffDates, now = new Date()) {
  return isBookingEventPast(dropoffDates, now) ? "past" : "upcoming";
}

/** @param {string} dropoffDate ISO calendar date (YYYY-MM-DD) @param {Date} [now] */
export function isDropoffDatePast(dropoffDate, now = new Date()) {
  return dropoffDate < calendarDateInTimezone(now, CUSTOMER_BOOKING_TIMEZONE);
}

/** @param {string} dropoffDate ISO calendar date (YYYY-MM-DD) @param {Date} [now] @returns {"upcoming" | "past"} */
export function dropoffDateStatus(dropoffDate, now = new Date()) {
  return isDropoffDatePast(dropoffDate, now) ? "past" : "upcoming";
}

/** @param {string | null} view @returns {"upcoming" | "past"} */
export function upcomingPastView(view) {
  return view === "past" ? "past" : "upcoming";
}

/** @template {{ date: string }} Event @param {readonly Event[]} events @param {"upcoming" | "past"} view */
export function sortDropoffEventsForDateStatus(events, view) {
  return [...events].sort((left, right) => {
    const comparison = left.date.localeCompare(right.date);
    return view === "past" ? -comparison : comparison;
  });
}
