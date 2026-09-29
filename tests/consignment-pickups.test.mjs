import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const routes = await readFile(new URL("../app/routes.ts", import.meta.url), "utf8");
const navigation = await readFile(new URL("../app/config/admin-navigation.ts", import.meta.url), "utf8");
const migration = await readFile(new URL("../migrations/0038_add_consignment_pickups.sql", import.meta.url), "utf8");
const service = await readFile(new URL("../app/services/consignment-pickups.server.ts", import.meta.url), "utf8");
const list = await readFile(new URL("../app/routes/admin.pickups.tsx", import.meta.url), "utf8");
const create = await readFile(new URL("../app/routes/admin.pickups.new.tsx", import.meta.url), "utf8");
const edit = await readFile(new URL("../app/routes/admin.pickups.edit.tsx", import.meta.url), "utf8");
const detail = await readFile(new URL("../app/routes/admin.pickups.detail.tsx", import.meta.url), "utf8");
const customerCreate = await readFile(new URL("../app/routes/admin.customers.new.tsx", import.meta.url), "utf8");

test("pickups are separate, internal-only admin routes under Consignments", () => {
  for (const path of ["admin/pickups", "admin/pickups/new", "admin/pickups/:id", "admin/pickups/:id/edit"]) assert.match(routes, new RegExp(path.replaceAll("/", "\\/")));
  assert.match(navigation, /label: "Pickups", path: "\/admin\/pickups"/);
  for (const source of [list, create, edit, detail]) assert.match(source, /requireRole\([^\n]*"admin"\)/);
  assert.doesNotMatch(routes, /pickups.*dropoffs|dropoffs.*pickups/);
});

test("pickup records remain independent from public drop-off capacity", () => {
  assert.match(migration, /CREATE TABLE consignment_pickups/);
  assert.match(migration, /CREATE TABLE consignment_pickup_assignments/);
  assert.match(migration, /status TEXT NOT NULL DEFAULT 'planned' CHECK \(status IN \('planned', 'scheduled', 'en_route', 'on_site', 'completed', 'cancelled'\)\)/);
  assert.doesNotMatch(migration, /dropoff_days|appointments|appointment_area_allocations/);
  assert.match(service, /Smalls, Large\/Furniture, and Outdoor estimates must total 100%/);
});

test("admin pickup workflow selects or creates customers, supports staff, and preserves read-only detail", () => {
  assert.match(create, /searchCustomers/);
  assert.match(create, /Create Customer/);
  assert.match(create, /returnTo=/);
  assert.match(customerCreate, /admin\\\/pickups\\\/new/);
  assert.match(service, /validatePickupAssignments/);
  assert.match(edit, /Save Pickup/);
  assert.match(detail, /Edit Pickup/);
  assert.match(list, /Upcoming/);
  assert.match(list, /Past/);
  assert.match(list, /p\.status != 'completed'/);
  assert.match(list, /p\.status='completed'/);
});
