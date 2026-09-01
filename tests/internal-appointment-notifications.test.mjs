import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const service = await readFile(new URL("../app/services/internal-appointment-notifications.server.ts", import.meta.url), "utf8");
const delivery = await readFile(new URL("../app/services/notification.server.ts", import.meta.url), "utf8");
const recipientsRoute = await readFile(new URL("../app/routes/admin.notification-recipients.tsx", import.meta.url), "utf8");
const migration = await readFile(new URL("../migrations/0024_add_internal_appointment_notification_recipients.sql", import.meta.url), "utf8");

test("internal recipients are active, event-subscribed, and idempotently queued", () => {
  assert.match(service, /WHERE active=1 AND \$\{subscription\}=1/);
  assert.match(service, /ON CONFLICT\(idempotency_key\) DO NOTHING/);
  assert.match(service, /internal:\$\{input\.appointmentId\}:\$\{input\.event\}:\$\{recipient\.email\}:\$\{eventVersion\}/);
});

test("internal delivery uses the existing outbox and avoids private notes", () => {
  assert.match(delivery, /job\.notification_type\.startsWith\("internal_"\)/);
  assert.match(delivery, /Review appointment: \$\{detail\}/);
  assert.doesNotMatch(service, /private_notes|password|auth/i);
});

test("recipient management is admin-only and persisted in D1", () => {
  assert.match(recipientsRoute, /requireRole\(request, env\.trice_auction_db, runtime, "admin"\)/);
  assert.match(migration, /CREATE TABLE appointment_notification_recipients/);
  assert.match(migration, /receive_created/);
  assert.match(migration, /receive_updated/);
  assert.match(migration, /receive_cancelled/);
});
