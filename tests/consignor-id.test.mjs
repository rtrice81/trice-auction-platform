import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(new URL("../migrations/0028_add_user_consignor_id.sql", import.meta.url), "utf8");
const userManagement = await readFile(new URL("../app/services/user-management.server.ts", import.meta.url), "utf8");
const adminUsers = await readFile(new URL("../app/routes/admin.users.tsx", import.meta.url), "utf8");
const adminUserEdit = await readFile(new URL("../app/routes/admin.users.edit.tsx", import.meta.url), "utf8");
const profileManagement = await readFile(new URL("../app/services/profile-management.server.ts", import.meta.url), "utf8");
const adminAppointments = await readFile(new URL("../app/routes/admin.appointments.tsx", import.meta.url), "utf8");

test("Consignor ID is a nullable text field with no uniqueness constraint", () => {
  assert.match(migration, /ALTER TABLE users ADD COLUMN consignor_id TEXT/);
  assert.doesNotMatch(migration, /CREATE\s+UNIQUE|UNIQUE\s+INDEX/i);
});

test("admin user management can edit, clear, display, and search Consignor IDs", () => {
  assert.match(adminUserEdit, /name="consignorId"/);
  assert.match(adminUserEdit, /Internal consignor number used to match this customer/);
  assert.match(userManagement, /consignorId \|\| null/);
  assert.match(userManagement, /u\.consignor_id AS consignorId/);
  assert.match(userManagement, /LOWER\(COALESCE\(u\.consignor_id, ''\)\) LIKE LOWER\(\?\)/);
  assert.match(adminUsers, /Consignor #\$\{user\.consignorId\}/);
});

test("customer profile updates do not accept or expose Consignor IDs", () => {
  assert.doesNotMatch(profileManagement, /consignorId|consignor_id/);
});

test("internal appointment search includes Consignor IDs", () => {
  assert.match(adminAppointments, /u\.consignor_id AS consignorId/);
  assert.match(adminAppointments, /Customer name, email, or Consignor ID/);
});
