import assert from "node:assert/strict";
import test from "node:test";
import { bookingEventDateStatus, dropoffDateStatus, finalDropoffDate, isBookingEventPast, sortDropoffEventsForDateStatus, upcomingPastView } from "../app/lib/booking-event-archive.js";

test("Upcoming is the default view and Past selects the past-date view", () => {
  assert.equal(upcomingPastView(null), "upcoming");
  assert.equal(upcomingPastView("past"), "past");
});

test("a Drop-Off Date today stays Upcoming through midnight in New York, including private dates", () => {
  const now = new Date("2026-09-26T03:59:59.999Z"); // 11:59:59 PM EDT on Sept. 25
  assert.equal(dropoffDateStatus("2026-09-25", now), "upcoming");
  assert.equal(dropoffDateStatus("2026-09-26", now), "upcoming");
});

test("a Drop-Off Date becomes Past at the following New York midnight", () => {
  assert.equal(dropoffDateStatus("2026-09-25", new Date("2026-09-26T04:00:00.000Z")), "past");
});

test("date views sort Upcoming soonest first and Past newest first", () => {
  const events = [{ date: "2026-09-28" }, { date: "2026-09-25" }, { date: "2026-09-26" }];
  assert.deepEqual(sortDropoffEventsForDateStatus(events, "upcoming").map((event) => event.date), ["2026-09-25", "2026-09-26", "2026-09-28"]);
  assert.deepEqual(sortDropoffEventsForDateStatus(events, "past").map((event) => event.date), ["2026-09-28", "2026-09-26", "2026-09-25"]);
});

test("an event with a Drop-Off Date today remains Upcoming through the New York calendar day", () => {
  const dates = ["2026-09-25"];
  assert.equal(bookingEventDateStatus(dates, new Date("2026-09-26T03:59:59.999Z")), "upcoming"); // 11:59:59 PM EDT
});

test("an event becomes Past at New York midnight on the following day", () => {
  const dates = ["2026-09-25"];
  assert.equal(isBookingEventPast(dates, new Date("2026-09-26T04:00:00.000Z")), true); // midnight EDT
});

test("the latest child Drop-Off Date controls the archive boundary", () => {
  const dates = ["2026-09-24", "2026-09-25", "2026-09-23"];
  assert.equal(finalDropoffDate(dates), "2026-09-25");
  assert.equal(isBookingEventPast(dates, new Date("2026-09-25T16:00:00.000Z")), false);
  assert.equal(isBookingEventPast(dates, new Date("2026-09-26T04:00:00.000Z")), true);
});

test("an event without Drop-Off Dates is never automatically Past", () => {
  assert.equal(bookingEventDateStatus([], new Date("2030-01-01T00:00:00.000Z")), "upcoming");
});

test("New York midnight archive boundaries remain correct across DST", () => {
  const dates = ["2026-11-01"];
  assert.equal(isBookingEventPast(dates, new Date("2026-11-02T04:59:59.999Z")), false); // 11:59:59 PM EST
  assert.equal(isBookingEventPast(dates, new Date("2026-11-02T05:00:00.000Z")), true); // midnight EST
});
