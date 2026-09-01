import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const scheduleDetail = await readFile(new URL("../app/routes/admin.schedule.detail.tsx", import.meta.url), "utf8");
const appointmentRoute = await readFile(new URL("../app/routes/admin.appointments.new.tsx", import.meta.url), "utf8");

test("schedule detail offers a schedule-bound admin appointment action", () => {
  assert.match(scheduleDetail, /Add Appointment/);
  assert.match(scheduleDetail, /\/admin\/appointments\/new\?scheduleId=\$\{event\.id\}/);
});

test("schedule-bound appointments require admin access and lock the submitted date server-side", () => {
  assert.match(appointmentRoute, /requireRole\(request, env\.trice_auction_db, runtime, "admin"\)/);
  assert.match(appointmentRoute, /getDropoffEventById\(env\.trice_auction_db, scheduleId\)/);
  assert.match(appointmentRoute, /if \(schedule\) input\.appointmentDate = schedule\.date/);
  assert.match(appointmentRoute, /allowAdminScheduling: true/);
});

test("schedule-bound creation keeps capacity overrides audited and returns to the schedule", () => {
  assert.match(appointmentRoute, /createAppointmentOverrideAuditStatement/);
  assert.match(appointmentRoute, /`\/admin\/schedule\/\$\{schedule\.id\}\?created=\$\{result\.appointmentId\}`/);
  assert.match(appointmentRoute, /`\/admin\/schedule\/\$\{schedule\.id\}\?created=\$\{appointmentId\}`/);
});
