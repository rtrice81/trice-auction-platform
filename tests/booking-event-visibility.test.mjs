import assert from "node:assert/strict";
import test from "node:test";
import { customerBookingEventSignupStatus, isCustomerBookingEventBookable, isCustomerBookingEventVisible } from "../app/lib/booking-event-visibility.js";

const open = new Date("2026-09-01T13:00:00.000Z"); // 9 AM EDT

test("open date today with no end date remains visible", () => {
  assert.equal(isCustomerBookingEventVisible({ opensAt: open }, new Date("2026-09-02T03:59:59.000Z")), true);
});

test("next day after open date with no end date is hidden", () => {
  assert.equal(isCustomerBookingEventVisible({ opensAt: open }, new Date("2026-09-02T04:00:00.000Z")), false);
});

test("end date today remains visible through the calendar day", () => {
  assert.equal(isCustomerBookingEventVisible({ opensAt: open, closesAt: new Date("2026-09-05T18:00:00.000Z") }, new Date("2026-09-06T03:59:59.000Z")), true);
});

test("next day after the end date is hidden", () => {
  assert.equal(isCustomerBookingEventVisible({ opensAt: open, closesAt: new Date("2026-09-05T18:00:00.000Z") }, new Date("2026-09-06T04:00:00.000Z")), false);
});

test("a closed event remains visible for the rest of its close-date calendar day", () => {
  const closesAt = new Date("2026-09-05T18:00:00.000Z");
  const now = new Date("2026-09-05T20:00:00.000Z");
  assert.equal(now >= closesAt, true);
  assert.equal(customerBookingEventSignupStatus({ opensAt: open, closesAt }, now), "closed");
  assert.equal(isCustomerBookingEventBookable({ opensAt: open, closesAt }, now), false);
  assert.equal(isCustomerBookingEventVisible({ opensAt: open, closesAt }, now), true);
});

test("New York midnight boundary handles DST using the IANA timezone", () => {
  const closesAt = new Date("2026-11-01T19:00:00.000Z"); // 2 PM EST after fall-back
  assert.equal(isCustomerBookingEventVisible({ opensAt: open, closesAt }, new Date("2026-11-02T04:59:59.000Z")), true);
  assert.equal(isCustomerBookingEventVisible({ opensAt: open, closesAt }, new Date("2026-11-02T05:00:00.000Z")), false);
});
