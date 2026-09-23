import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const bookingService = await readFile(new URL("../app/services/booking.server.ts", import.meta.url), "utf8");
const roleService = await readFile(new URL("../app/services/user-roles.server.ts", import.meta.url), "utf8");
const migration = await readFile(new URL("../migrations/0032_backfill_consignor_role_from_appointments.sql", import.meta.url), "utf8");

test("accepted appointments add the consignor role through the shared idempotent helper", () => {
  assert.match(roleService, /INSERT OR IGNORE INTO user_roles \(user_id, role\) VALUES \(\?, \?\)/);
  assert.match(bookingService, /await ensureUserRole\(db, input\.userId, "consignor"\)/);
  assert.match(bookingService, /await db\.batch\([\s\S]*?await ensureUserRole\(db, input\.userId, "consignor"\)/);
});

test("both normal and override admin appointment creation preserve existing role memberships", () => {
  assert.equal((bookingService.match(/await ensureUserRole\(db, input\.userId, "consignor"\)/g) ?? []).length, 2);
  assert.doesNotMatch(roleService, /DELETE FROM user_roles|UPDATE user_roles/);
});

test("existing appointment owners are backfilled as consignors", () => {
  assert.match(migration, /INSERT OR IGNORE INTO user_roles/);
  assert.match(migration, /SELECT DISTINCT user_id, 'consignor'\s+FROM appointments/);
});
