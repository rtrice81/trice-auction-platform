import { useCallback, useEffect, useRef, useState } from "react";
import { useRevalidator } from "react-router";
import { BOOKING_EVENT_AVAILABILITY_POLL_INTERVAL_MS, estimateServerNowMs, hasOpenBookingEvent, millisecondsUntilNextBookingEventOpening } from "../lib/booking-event-revalidation";

type MonitoredBookingEvent = { id: number; status: string; opensAtMs: number };

/**
 * Keeps the booking-event listing synchronized with server availability. The
 * server timestamp establishes the client clock baseline, while revalidation
 * keeps the server authoritative for every availability change.
 */
export function useBookingEventAvailabilityMonitor(bookingEvents: MonitoredBookingEvent[], serverNow: string) {
  const { revalidate } = useRevalidator();
  const requestInFlight = useRef(false);
  const openingRevalidated = useRef<string | null>(null);
  const clock = useRef({ serverNow, serverNowMs: Date.parse(serverNow), performanceNow: 0 });
  const [estimatedServerNowMs, setEstimatedServerNowMs] = useState(() => Date.parse(serverNow));

  if (clock.current.serverNow !== serverNow) {
    clock.current = { serverNow, serverNowMs: Date.parse(serverNow), performanceNow: typeof performance === "undefined" ? 0 : performance.now() };
  }

  const getEstimatedServerNowMs = useCallback(() => {
    if (typeof performance === "undefined") return clock.current.serverNowMs;
    return estimateServerNowMs(clock.current.serverNowMs, performance.now() - clock.current.performanceNow);
  }, []);

  useEffect(() => {
    clock.current = { serverNow, serverNowMs: Date.parse(serverNow), performanceNow: performance.now() };
    const updateClock = () => setEstimatedServerNowMs(getEstimatedServerNowMs());
    updateClock();
    const interval = window.setInterval(updateClock, 1_000);
    return () => window.clearInterval(interval);
  }, [getEstimatedServerNowMs, serverNow]);

  const revalidateAvailability = useCallback(async () => {
    if (requestInFlight.current) return;
    requestInFlight.current = true;
    try {
      await revalidate();
    } finally {
      requestInFlight.current = false;
    }
  }, [revalidate]);

  const openingKey = bookingEvents.filter((event) => event.status === "upcoming").map((event) => `${event.id}:${event.opensAtMs}`).join(",");
  useEffect(() => {
    const delay = millisecondsUntilNextBookingEventOpening(bookingEvents, estimatedServerNowMs);
    if (delay === null) {
      openingRevalidated.current = null;
      return;
    }
    if (delay === 0) {
      if (openingRevalidated.current !== openingKey) {
        openingRevalidated.current = openingKey;
        void revalidateAvailability();
      }
      return;
    }
    const timer = window.setTimeout(() => void revalidateAvailability(), delay);
    return () => window.clearTimeout(timer);
  }, [bookingEvents, estimatedServerNowMs, openingKey, revalidateAvailability]);

  const hasOpenEvent = hasOpenBookingEvent(bookingEvents);
  useEffect(() => {
    if (!hasOpenEvent) return;
    const interval = window.setInterval(() => void revalidateAvailability(), BOOKING_EVENT_AVAILABILITY_POLL_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [hasOpenEvent, revalidateAvailability]);

  return estimatedServerNowMs;
}
