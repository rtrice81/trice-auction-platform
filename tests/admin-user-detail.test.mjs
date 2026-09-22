import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const routes = await readFile(new URL("../app/routes.ts", import.meta.url), "utf8");
const users = await readFile(new URL("../app/routes/admin.users.tsx", import.meta.url), "utf8");
const detail = await readFile(new URL("../app/routes/admin.users.detail.tsx", import.meta.url), "utf8");
const edit = await readFile(new URL("../app/routes/admin.users.edit.tsx", import.meta.url), "utf8");

test("user management opens a read-only user detail route from the name and View action", () => {
  assert.match(routes, /route\("admin\/users\/:id", "routes\/admin\.users\.detail\.tsx"\)/);
  assert.match(users, /<Link to=\{`\/admin\/users\/\$\{user\.id\}`\}[^>]*>\{user\.name\}<\/Link>/);
  assert.match(users, /<Link to=\{`\/admin\/users\/\$\{user\.id\}`\}[^>]*>View<\/Link>/);
  assert.doesNotMatch(users, /\/admin\/users\/\$\{user\.id\}\/edit/);
});

test("the user detail is admin-only, keeps profile data read-only, and retains appointment access", () => {
  assert.match(detail, /requireRole\(request, env\.trice_auction_db, runtime, "admin"\)/);
  assert.match(detail, /User Information/);
  assert.match(detail, /Consignment Appointments/);
  assert.match(detail, /getCustomerAppointmentsByTiming\(env\.trice_auction_db, user\.id\)/);
  assert.match(detail, /View Appointments/);
  assert.match(detail, /Edit User/);
  assert.match(detail, /\/admin\/users\/\$\{user\.id\}\/edit/);
  assert.match(detail, /Drop-Off Status/);
  assert.match(detail, /Internal Notes/);
  assert.match(detail, /getCustomerStanding\(env\.trice_auction_db, user\.id\)/);
  assert.match(detail, /getCustomerPrivateNotes\(env\.trice_auction_db, user\.id\)/);
  assert.doesNotMatch(edit, /Drop-Off Status|Internal Notes|add-private-note|ban-customer|unban-customer/);
});

test("staff tools on the detail page reuse the existing server-side status and append-only note actions", () => {
  assert.match(detail, /export async function action/);
  assert.match(detail, /requireRole\(request, env\.trice_auction_db, runtime, "admin"\)/);
  assert.match(detail, /addCustomerPrivateNote/);
  assert.match(detail, /setCustomerDropoffBan/);
  assert.match(detail, /removeCustomerDropoffBan/);
  assert.match(detail, /Save Status: Ban Drop-Offs/);
  assert.match(detail, /Save Status: Allow Drop-Offs/);
  assert.match(detail, /Add Note/);
  assert.match(detail, /actionData\?\.ok/);
});

test("editing remains isolated to the existing edit route", () => {
  assert.match(edit, /export async function action/);
  assert.match(edit, /<Form method="post"/);
});
