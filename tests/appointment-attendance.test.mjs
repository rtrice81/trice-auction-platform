import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(new URL("../migrations/0029_add_appointment_attendance.sql", import.meta.url), "utf8");
const service = await readFile(new URL("../app/services/appointment-attendance.server.ts", import.meta.url), "utf8");
const schedule = await readFile(new URL("../app/routes/admin.schedule.detail.tsx", import.meta.url), "utf8");
const summary = await readFile(new URL("../app/components/admin-appointment-summary.tsx", import.meta.url), "utf8");
const capacity = await readFile(new URL("../app/services/booking.server.ts", import.meta.url), "utf8");
const profile = await readFile(new URL("../app/routes/my-appointments.detail.tsx", import.meta.url), "utf8");

test("attendance migration preserves existing appointments and records status history", () => {
  for (const column of ["checked_in_at", "completed_at", "no_show_at", "last_minute_cancelled_at"]) assert.match(migration, new RegExp(`ADD COLUMN ${column} TEXT`));
  assert.match(migration, /CREATE TABLE appointment_status_history/);
  assert.match(migration, /actor_user_id INTEGER NOT NULL/);
});

test("attendance transitions are admin-callable, conditional, and audited", () => {
  assert.match(service, /"check-in".*from: "scheduled".*to: "checked_in"/s);
  assert.match(service, /complete:.*from: "checked_in".*to: "completed"/s);
  assert.match(service, /"no-show".*to: "no_show"/s);
  assert.match(service, /"last-minute-cancel".*to: "last_minute_cancelled"/s);
  assert.match(service, /WHERE id = \? AND status = \?/);
  assert.match(service, /INSERT INTO appointment_status_history/);
  assert.match(schedule, /requireRole\(request, env\.trice_auction_db, runtime, "admin"\)/);
  assert.match(schedule, /recordAppointmentAttendance/);
});

test("attendance controls are internal and release capacity only for terminal attendance outcomes", () => {
  assert.match(summary, /Check In/);
  assert.match(summary, /Mark this appointment as a no-show\?/);
  assert.match(summary, /last-minute cancellation/);
  assert.match(capacity, /status IN \('scheduled', 'checked_in', 'completed'\)/);
  assert.doesNotMatch(profile, /attendanceAction|check-in|last-minute-cancel/);
});
