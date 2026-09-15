import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(new URL("../migrations/0028_add_user_consignor_id.sql", import.meta.url), "utf8");
const userManagement = await readFile(new URL("../app/services/user-management.server.ts", import.meta.url), "utf8");
const adminUsers = await readFile(new URL("../app/routes/admin.users.tsx", import.meta.url), "utf8");
const adminUserEdit = await readFile(new URL("../app/routes/admin.users.edit.tsx", import.meta.url), "utf8");
const adminCustomerCreate = await readFile(new URL("../app/routes/admin.customers.new.tsx", import.meta.url), "utf8");
const customerManagement = await readFile(new URL("../app/services/customer-management.server.ts", import.meta.url), "utf8");
const profileManagement = await readFile(new URL("../app/services/profile-management.server.ts", import.meta.url), "utf8");
const adminAppointments = await readFile(new URL("../app/routes/admin.appointments.tsx", import.meta.url), "utf8");

test("Consignor Number is a nullable text field with no uniqueness constraint", () => {
  assert.match(migration, /ALTER TABLE users ADD COLUMN consignor_id TEXT/);
  assert.doesNotMatch(migration, /CREATE\s+UNIQUE|UNIQUE\s+INDEX/i);
});

test("admin creates customers with an optional Consignor Number", () => {
  assert.match(adminCustomerCreate, /Consignor Number<input name="consignorNumber"/);
  assert.match(customerManagement, /consignorNumber: String\(form\.get\("consignorNumber"\).*\.trim\(\)/);
  assert.match(customerManagement, /consignor_id, role/);
  assert.match(customerManagement, /input\.consignorNumber \|\| null/);
});

test("admin can edit, clear, display, and search by Consignor Number", () => {
  assert.match(adminUserEdit, /Consignor Number<input name="consignorNumber"/);
  assert.match(adminUserEdit, /values\?\.consignorNumber \?\? user\.consignorNumber/);
  assert.match(userManagement, /consignorNumber \|\| null/);
  assert.match(userManagement, /u\.consignor_id AS consignorNumber/);
  assert.match(userManagement, /LOWER\(COALESCE\(u\.consignor_id, ''\)\) LIKE LOWER\(\?\)/);
  assert.match(userManagement, /OR u\.phone LIKE \?/);
  assert.match(adminUsers, /Search name, email, phone, or Consignor Number/);
  assert.match(adminUsers, /user\.consignorNumber \|\| "—"/);
});

test("leading zeroes are preserved and customers cannot edit their own Consignor Number", () => {
  assert.match(customerManagement, /String\(form\.get\("consignorNumber"\).*\.trim\(\)/);
  assert.doesNotMatch(customerManagement, /Number\(form\.get\("consignorNumber"\)/);
  assert.doesNotMatch(profileManagement, /consignorNumber|consignor_id/);
});

test("internal appointment search includes Consignor Numbers", () => {
  assert.match(adminAppointments, /u\.consignor_id AS consignorId/);
  assert.match(adminAppointments, /Customer name, email, or Consignor ID/);
});
