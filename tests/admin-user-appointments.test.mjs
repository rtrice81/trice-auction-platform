import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const routes = await readFile(new URL("../app/routes.ts", import.meta.url), "utf8");
const navigation = await readFile(new URL("../app/config/admin-navigation.ts", import.meta.url), "utf8");
const overview = await readFile(new URL("../app/routes/admin.users.edit.tsx", import.meta.url), "utf8");
const appointments = await readFile(new URL("../app/routes/admin.users.appointments.tsx", import.meta.url), "utf8");
const appointmentQuery = await readFile(new URL("../app/services/customer-standing.server.ts", import.meta.url), "utf8");
const subnav = await readFile(new URL("../app/components/admin-user-subnav.tsx", import.meta.url), "utf8");

test("appointments are routed from a selected admin user and exposed through reusable user navigation", () => {
  assert.match(routes, /admin\/users\/:id\/appointments/);
  assert.match(overview, /<AdminUserSubnav userId=\{user\.id\} activeSection="overview"/);
  assert.match(appointments, /<AdminUserSubnav userId=\{user\.id\} activeSection="appointments"/);
  assert.match(subnav, /\{ label: "Overview", path: `\/admin\/users\/\$\{userId\}\/edit` \}/);
  assert.match(subnav, /\{ label: "Appointments", path: `\/admin\/users\/\$\{userId\}\/appointments` \}/);
  assert.match(subnav, /aria-current=\{active \? "page" : undefined\}/);
});

test("appointments are no longer a standalone Consignments navigation item", () => {
  assert.doesNotMatch(navigation, /label: "Appointments", path: "\/admin\/appointments"/);
});

test("the user appointment page is admin-only, user-scoped, ordered, and keeps cancelled records visible", () => {
  assert.match(appointments, /requireRole\(request, env\.trice_auction_db, runtime, "admin"\)/);
  assert.match(appointments, /getCustomerAppointmentsByTiming\(env\.trice_auction_db, user\.id\)/);
  assert.match(appointments, /Upcoming Appointments/);
  assert.match(appointments, /Past Appointments/);
  assert.match(appointments, /No upcoming appointments\./);
  assert.match(appointments, /No past appointments\./);
  assert.match(appointmentQuery, /WHERE appointment\.user_id = \?/);
  assert.match(appointmentQuery, /appointment\.appointment_date >= date\('now'\)/);
  assert.match(appointmentQuery, /appointment\.status NOT IN \('cancelled', 'last_minute_cancelled'\)/);
  assert.match(appointmentQuery, /ORDER BY appointment\.appointment_date ASC/);
  assert.match(appointmentQuery, /appointment\.appointment_date < date\('now'\)[\s\S]*appointment\.status IN \('cancelled', 'last_minute_cancelled'\)/);
  assert.match(appointmentQuery, /ORDER BY appointment\.appointment_date DESC/);
});

test("user appointment actions use the existing admin detail and edit routes", () => {
  assert.match(appointments, /to=\{`\/admin\/appointments\/\$\{appointment\.id\}`\}/);
  assert.match(appointments, /to=\{`\/admin\/appointments\/\$\{appointment\.id\}\/edit`\}/);
  assert.doesNotMatch(appointments, /\/manager\//);
});
