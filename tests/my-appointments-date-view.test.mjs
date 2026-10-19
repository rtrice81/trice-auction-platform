import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const appointments = await readFile(new URL("../app/routes/my-appointments.tsx", import.meta.url), "utf8");
const customerAppointments = await readFile(new URL("../app/services/customer-appointments.server.ts", import.meta.url), "utf8");
const detail = await readFile(new URL("../app/routes/my-appointments.detail.tsx", import.meta.url), "utf8");

test("My Appointments defaults to Upcoming and derives Past from the Drop-Off Date", () => {
  assert.match(appointments, /upcomingPastView\(new URL\(request\.url\)\.searchParams\.get\("view"\)\)/);
  assert.match(customerAppointments, /dropoffDateStatus\(appointment\.appointmentDate, now\)/);
  assert.match(appointments, /to="\/my-appointments\?view=past"/);
  assert.doesNotMatch(appointments, /Archived/);
});

test("My Appointments sorts Upcoming first and Past most-recent-first without changing appointment status", () => {
  assert.match(customerAppointments, /return view === "past" \? -comparison : comparison/);
  assert.match(customerAppointments, /appointment\.dateStatus === view/);
  assert.match(appointments, /appointment\.status === "scheduled"/);
});

test("Past appointments retain their detail link and customer-visible historical information", () => {
  assert.match(appointments, /to=\{`\/my-appointments\/\$\{appointment\.id\}`\}/);
  assert.match(detail, /appointment\.appointmentDate/);
  assert.match(detail, /appointment\.description/);
  assert.match(detail, /AreaAllocationFields/);
  assert.match(detail, /appointment\.status/);
});
