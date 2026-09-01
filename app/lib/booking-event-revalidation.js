export const BOOKING_EVENT_AVAILABILITY_POLL_INTERVAL_MS = 20_000;

/**
 * Advances the loader-provided server time by monotonic elapsed time. This
 * deliberately has no dependency on the device's wall clock.
 * @param {number} serverNowMs
 * @param {number} elapsedMs
 */
export function estimateServerNowMs(serverNowMs, elapsedMs) {
  return serverNowMs + Math.max(0, elapsedMs);
}

/**
 * Finds the next server-confirmed Booking Event opening boundary. The caller
 * schedules a loader revalidation at this boundary; it never unlocks booking
 * locally.
 *
 * @param {Array<{ status: string; opensAtMs: number }>} bookingEvents
 * @param {number} serverNowMs
 */
export function millisecondsUntilNextBookingEventOpening(bookingEvents, serverNowMs) {
  const nextOpening = bookingEvents
    .filter((bookingEvent) => bookingEvent.status === "upcoming" && Number.isFinite(bookingEvent.opensAtMs))
    .map((bookingEvent) => bookingEvent.opensAtMs)
    .reduce((earliest, opening) => Math.min(earliest, opening), Infinity);
  return Number.isFinite(nextOpening) ? Math.max(0, nextOpening - serverNowMs) : null;
}

/** @param {Array<{ status: string }>} bookingEvents */
export function hasOpenBookingEvent(bookingEvents) {
  return bookingEvents.some((bookingEvent) => bookingEvent.status === "open" || bookingEvent.status === "full");
}
