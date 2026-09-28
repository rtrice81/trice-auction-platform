import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const detail = await readFile(new URL("../app/routes/admin.appointments.detail.tsx", import.meta.url), "utf8");
const list = await readFile(new URL("../app/routes/admin.appointments.tsx", import.meta.url), "utf8");
const service = await readFile(new URL("../app/services/appointment-deletion.server.ts", import.meta.url), "utf8");
const migration = await readFile(new URL("../migrations/0037_add_appointment_deletion_audit.sql", import.meta.url), "utf8");
const capacity = await readFile(new URL("../app/services/booking-event.server.ts", import.meta.url), "utf8");

test("appointment deletion is an explicit admin-only action with an irreversible confirmation", () => {
  assert.match(detail, /requireRole\(request, env\.trice_auction_db, runtime, "admin"\)/);
  assert.match(detail, /form\.get\("intent"\) === "delete"/);
  assert.match(detail, /Permanently delete this appointment\?/);
  assert.match(detail, /Delete Permanently/);
  assert.match(detail, /customerName.*appointment\.appointmentDate/s);
  assert.match(detail, /Consignor #/);
});

test("hard deletion removes only appointment-scoped data and retains a lightweight audit", () => {
  assert.match(service, /INSERT INTO appointment_deletion_audits/);
  assert.match(migration, /appointment_id INTEGER NOT NULL/);
  assert.match(migration, /customer_id INTEGER NOT NULL/);
  assert.match(migration, /dropoff_day_id INTEGER/);
  assert.match(migration, /actor_user_id INTEGER NOT NULL/);
  assert.match(migration, /action_type = 'appointment_deleted'/);
  assert.match(service, /DELETE FROM appointment_status_history WHERE appointment_id = \?/);
  assert.match(service, /UPDATE notification_jobs[\s\S]*appointment_id = NULL/);
  assert.match(service, /DELETE FROM appointments WHERE id = \?/);
  assert.match(service, /DELETE FROM booking_holds WHERE id = \?/);
  assert.doesNotMatch(service, /DELETE FROM users/);
  assert.doesNotMatch(service, /DELETE FROM dropoff_days/);
  assert.doesNotMatch(service, /DELETE FROM booking_events/);
});

test("deletion returns to the appointments view with a success message and fresh capacity queries", () => {
  assert.match(detail, /\/admin\/appointments\?view=past&deleted=1/);
  assert.match(detail, /\/admin\/appointments\?deleted=1/);
  assert.match(list, /Appointment permanently deleted\./);
  assert.match(capacity, /FROM appointments appointment/);
  assert.match(capacity, /appointment\.status IN \('scheduled', 'checked_in', 'completed'\)/);
});
