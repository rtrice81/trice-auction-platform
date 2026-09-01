import assert from "node:assert/strict";
import test from "node:test";
import { customerBookingEventSignupStatus, getEffectivePublicDropoffDateAvailability, isCustomerBookingEventBookable, isCustomerBookingEventVisible } from "../app/lib/booking-event-visibility.js";

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

const childDate = {
  opensAt: new Date("2026-09-10T13:00:00.000Z"), // 9 AM EDT
  closesAt: new Date("2026-09-10T21:00:00.000Z"),
  active: true,
  visibility: "public",
  operationallyEnabled: true,
};

test("a future Booking Event does not make an enabled child date publicly bookable", () => {
  assert.equal(getEffectivePublicDropoffDateAvailability(childDate, new Date("2026-09-10T12:59:59.999Z")).bookable, false);
});

test("the same child date becomes bookable exactly when its Booking Event opens without an admin update", () => {
  assert.equal(getEffectivePublicDropoffDateAvailability(childDate, new Date("2026-09-10T12:59:59.999Z")).bookable, false);
  assert.equal(getEffectivePublicDropoffDateAvailability(childDate, new Date("2026-09-10T13:00:00.000Z")).bookable, true);
});

test("the availability rule used by direct public submissions rejects a crafted pre-open request", () => {
  const result = getEffectivePublicDropoffDateAvailability(childDate, new Date("2026-09-10T12:59:59.999Z"));
  assert.equal(result.bookingEventStatus, "upcoming");
  assert.equal(result.bookable, false);
});

test("the Booking Event close time stops public booking", () => {
  assert.equal(getEffectivePublicDropoffDateAvailability(childDate, new Date("2026-09-10T21:00:00.000Z")).bookable, false);
});

test("an explicitly closed child date remains unavailable while its parent is open", () => {
  assert.equal(getEffectivePublicDropoffDateAvailability({ ...childDate, operationallyEnabled: false }, new Date("2026-09-10T14:00:00.000Z")).bookable, false);
});

test("capacity can close one child date while another remains available", () => {
  const now = new Date("2026-09-10T14:00:00.000Z");
  assert.equal(getEffectivePublicDropoffDateAvailability({ ...childDate, capacityAvailable: false }, now).bookable, false);
  assert.equal(getEffectivePublicDropoffDateAvailability({ ...childDate, capacityAvailable: true }, now).bookable, true);
});

test("private dates never inherit a Booking Event's public availability", () => {
  assert.equal(getEffectivePublicDropoffDateAvailability({ ...childDate, visibility: "private" }, new Date("2026-09-10T14:00:00.000Z")).bookable, false);
});
