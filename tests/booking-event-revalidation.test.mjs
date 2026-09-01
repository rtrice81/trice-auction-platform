import assert from "node:assert/strict";
import test from "node:test";
import { BOOKING_EVENT_AVAILABILITY_POLL_INTERVAL_MS, estimateServerNowMs, hasOpenBookingEvent, millisecondsUntilNextBookingEventOpening } from "../app/lib/booking-event-revalidation.js";

const opening = 1_000_000;

test("a page loaded before opening schedules server revalidation at the opening boundary", () => {
  assert.equal(millisecondsUntilNextBookingEventOpening([{ id: 1, status: "upcoming", opensAtMs: opening }], opening - 5_000), 5_000);
});

test("the opening boundary requests immediate server revalidation without a browser refresh", () => {
  assert.equal(millisecondsUntilNextBookingEventOpening([{ id: 1, status: "upcoming", opensAtMs: opening }], opening), 0);
});

test("only an open Booking Event enables periodic availability polling", () => {
  assert.equal(hasOpenBookingEvent([{ id: 1, status: "upcoming", opensAtMs: opening }]), false);
  assert.equal(hasOpenBookingEvent([{ id: 1, status: "open", opensAtMs: opening }]), true);
  assert.equal(hasOpenBookingEvent([{ id: 1, status: "full", opensAtMs: opening }]), true);
  assert.equal(BOOKING_EVENT_AVAILABILITY_POLL_INTERVAL_MS, 20_000);
});

test("closed and full child-date state cannot be changed by the client timer", () => {
  assert.equal(millisecondsUntilNextBookingEventOpening([{ id: 1, status: "closed", opensAtMs: opening }], opening - 5_000), null);
  assert.equal(millisecondsUntilNextBookingEventOpening([{ id: 1, status: "full", opensAtMs: opening }], opening - 5_000), null);
});

test("the countdown uses loader-provided server time rather than the device wall clock", () => {
  assert.equal(estimateServerNowMs(opening - 5_000, 2_000), opening - 3_000);
  assert.equal(millisecondsUntilNextBookingEventOpening([{ id: 1, status: "upcoming", opensAtMs: opening }], estimateServerNowMs(opening - 5_000, 2_000)), 3_000);
});
