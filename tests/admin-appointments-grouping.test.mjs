import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const appointments = await readFile(new URL("../app/routes/admin.appointments.tsx", import.meta.url), "utf8");

test("admin appointments join and group on the Drop-Off Date record", () => {
  assert.match(appointments, /JOIN dropoff_days day ON day\.dropoff_date = a\.appointment_date/);
  assert.match(appointments, /day\.id AS dropoffDateId/);
  assert.match(appointments, /groupAppointmentsByDropoffDate/);
  assert.match(appointments, /new Map<number, AppointmentGroup>/);
  assert.match(appointments, /key=\{group\.dropoffDateId\}/);
});

test("admin appointment groups show event context and exclude cancelled records from their count", () => {
  assert.match(appointments, /event\.name AS bookingEventName/);
  assert.match(appointments, /if \(appointment\.status !== "cancelled"\) group\.nonCancelledAppointmentCount \+= 1/);
  assert.match(appointments, /formatDropoffDate\(group\.date\)/);
  assert.match(appointments, /non-cancelled appointment/);
});

test("admin appointment group ordering puts current dates before past dates without N plus one loading", () => {
  assert.match(appointments, /CASE WHEN a\.appointment_date >= \? THEN 0 ELSE 1 END ASC/);
  assert.match(appointments, /CASE WHEN a\.appointment_date >= \? THEN a\.appointment_date END ASC/);
  assert.match(appointments, /CASE WHEN a\.appointment_date < \? THEN a\.appointment_date END DESC/);
  assert.equal((appointments.match(/\.prepare\(/g) ?? []).length, 1);
});
