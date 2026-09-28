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

test("admin appointment views use the New York calendar and order each selected date set ascending", () => {
  assert.match(appointments, /const view = upcomingPastView\(url\.searchParams\.get\("view"\)\)/);
  assert.match(appointments, /calendarDateInTimezone\(new Date\(\), "America\/New_York"\)/);
  assert.match(appointments, /\? = 'upcoming' AND a\.appointment_date >= \?/);
  assert.match(appointments, /\? = 'past' AND a\.appointment_date < \?/);
  assert.match(appointments, /ORDER BY a\.appointment_date ASC, a\.id DESC/);
  assert.match(appointments, /aria-label="Appointment views"/);
  assert.match(appointments, /<Link to=\{appointmentUrl\("upcoming"/);
  assert.match(appointments, /<Link to=\{appointmentUrl\("past"/);
  assert.match(appointments, /<input type="hidden" name="view"/);
  assert.equal((appointments.match(/\.prepare\(/g) ?? []).length, 1);
});
