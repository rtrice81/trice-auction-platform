import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createElement } from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import * as router from "react-router";
import { createSourceFile, isFunctionDeclaration, JsxEmit, ModuleKind, ScriptTarget, transpileModule } from "typescript";
import { appointmentDate, createBooking, fixture, getAppointmentOverrideHistory, moduleUrl, validateBooking } from "./helpers/booking-fixture.mjs";

const booking = await import(await moduleUrl(new URL("../app/services/booking.server.ts", import.meta.url)));
const creation = await import(await moduleUrl(new URL("../app/services/admin-appointment-creation.server.ts", import.meta.url)));
const customers = await import(await moduleUrl(new URL("../app/services/customer-management.server.ts", import.meta.url)));
const schedule = await import(await moduleUrl(new URL("../app/services/schedule-management.server.ts", import.meta.url)));
const fields = await import(await moduleUrl(new URL("../app/components/admin-appointment-fields.tsx", import.meta.url)));
const confirmation = await import(await moduleUrl(new URL("../app/components/admin-appointment-feedback.tsx", import.meta.url)));
const roles = await import(await moduleUrl(new URL("../app/lib/roles.ts", import.meta.url)));
const admin = { actorUserId: 1 };
const yes = { ...admin, overrideMonthlyLimit: true };

function setup(t, options = {}) {
  return fixture(t, { dailyCapacity: 100, areaCapacity: 100, ...options });
}
function count(sqlite) { return sqlite.prepare("SELECT COUNT(*) AS count FROM appointments").get().count; }

test("admin creates normally when the customer has no appointment in that month", async t => {
  const { db, sqlite, input, snapshot } = setup(t);
  sqlite.exec("INSERT INTO user_roles (user_id, role) VALUES (2, 'employee')");
  const result = await creation.createAdminAppointment(db, input(), admin);
  assert.equal(result.ok, true);
  assert.equal(result.status, "scheduled");
  assert.equal(count(sqlite), 1);
  assert.equal(snapshot(result.appointmentId).allocations.length, 3);
  assert.deepEqual(await getAppointmentOverrideHistory(db, result.appointmentId), []);
  assert.deepEqual(sqlite.prepare("SELECT role FROM user_roles WHERE user_id = 2 ORDER BY role").all().map(row => row.role), ["consignor", "employee"]);
});

for (const status of ["scheduled", "checked_in", "completed", "waitlisted"]) {
  test(`${status} triggers admin confirmation, even below the configured customer limit`, async t => {
    const { db, sqlite, addAppointment, input } = setup(t);
    const id = addAppointment(status);
    const result = await creation.createAdminAppointment(db, input(), admin);
    assert.equal(result.ok, false);
    assert.equal(result.monthlyConfirmation, true);
    assert.deepEqual(result.monthlyAppointments.map(appointment => appointment.id), [id]);
    assert.deepEqual(result.submitted, input());
    assert.equal(count(sqlite), 1);
  });
}

for (const status of ["cancelled", "no_show", "last_minute_cancelled"]) {
  test(`${status} does not count toward the monthly limit or warning`, async t => {
    const { db, addAppointment, input } = setup(t);
    addAppointment(status);
    const result = await creation.createAdminAppointment(db, input(), admin);
    assert.equal(result.ok, true);
    assert.deepEqual(await getAppointmentOverrideHistory(db, result.appointmentId), []);
  });
}

test("No returns the submitted form values and does not create or audit anything", async t => {
  const { db, sqlite, addAppointment, input } = setup(t);
  addAppointment("completed");
  const original = input();
  const warning = await creation.createAdminAppointment(db, original, admin);
  assert.equal(warning.monthlyConfirmation, true);
  const result = await creation.createAdminAppointment(db, warning.submitted, { ...yes, goBack: true });
  assert.equal(result.ok, false);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.submitted, original);
  assert.equal(result.monthlyConfirmation, undefined);
  assert.equal(count(sqlite), 1);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM appointment_override_audits").get().count, 0);
});

test("Yes creates the appointment above the monthly limit and audits all triggering appointments", async t => {
  const { db, sqlite, addAppointment, input, snapshot } = setup(t);
  sqlite.exec("UPDATE settings SET value = '1' WHERE key = 'monthly_booking_limit'");
  const previous = [addAppointment("completed"), addAppointment("checked_in")];
  addAppointment("cancelled");
  addAppointment("scheduled", 10, 3); // Audit must link to the new customer's appointment.
  const result = await creation.createAdminAppointment(db, input(), yes);
  assert.equal(result.ok, true);
  assert.equal(count(sqlite), 5);
  const created = snapshot(result.appointmentId);
  assert.equal(created.appointment.user_id, 2);
  assert.equal(created.appointment.appointment_date, appointmentDate);
  assert.equal(created.appointment.description, input().description);
  assert.equal(created.allocations.reduce((sum, allocation) => sum + allocation.capacity_points, 0), 10);
  const [audit] = await getAppointmentOverrideHistory(db, result.appointmentId);
  assert.equal(audit.actorUserId, 1);
  assert.equal(audit.actorRole, "admin");
  assert.ok(audit.occurredAt);
  assert.ok(audit.violatedRules.includes("monthly_appointment_limit_override"));
  assert.equal(audit.requestedValues.userId, 2);
  assert.equal(audit.requestedValues.appointmentDate, appointmentDate);
  assert.deepEqual(audit.previousValues.monthlyAppointments.map(appointment => appointment.id), previous);
});

test("the comparison uses drop-off dates, including month and year boundaries, rather than creation time", async t => {
  const { db, sqlite, addAppointment, input } = setup(t);
  const year = Number(appointmentDate.slice(0, 4));
  addAppointment("completed", 10, 2, `${year}-09-30`);
  addAppointment("completed", 10, 2, `${year}-11-01`);
  const first = addAppointment("completed", 10, 2, `${year}-10-01`);
  const last = addAppointment("completed", 10, 2, `${year}-10-31`);
  sqlite.exec("UPDATE appointments SET created_at = '1999-12-31 23:59:59'");
  assert.deepEqual((await booking.getMonthlyAppointmentUsage(db, input())).appointments.map(appointment => appointment.id), [first, last]);
  const december = addAppointment("completed", 10, 2, `${year}-12-31`);
  const january = addAppointment("completed", 10, 2, `${year + 1}-01-01`);
  assert.deepEqual((await booking.getMonthlyAppointmentUsage(db, { ...input(), appointmentDate: `${year}-12-01` })).appointments.map(appointment => appointment.id), [december]);
  assert.deepEqual((await booking.getMonthlyAppointmentUsage(db, { ...input(), appointmentDate: `${year + 1}-01-31` })).appointments.map(appointment => appointment.id), [january]);
});

for (const actorUserId of [2, 4, 5, 999]) {
  test(`non-admin actor ${actorUserId} cannot use monthly or capacity creation overrides`, async t => {
    const { db, sqlite, addAppointment, input } = setup(t);
    addAppointment("scheduled");
    const result = await creation.createAdminAppointment(db, input(), { overrideMonthlyLimit: true, overrideCapacity: true, capacityOverrideReason: "Forged consent", actorUserId });
    assert.equal(result.ok, false);
    assert.match(result.errors.join(" "), /Only an active administrator/);
    assert.equal(count(sqlite), 1);
  });
}

test("inactive admins cannot use the monthly override", async t => {
  const { db, sqlite, input } = setup(t);
  sqlite.exec("UPDATE users SET active = 0 WHERE id = 1");
  assert.equal((await creation.createAdminAppointment(db, input(), yes)).ok, false);
  assert.equal(count(sqlite), 0);
});

test("customer booking keeps its configured monthly limit and ignores forged override options", async t => {
  const { db, sqlite, addAppointment, input } = setup(t);
  sqlite.exec("UPDATE settings SET value = '2' WHERE key = 'monthly_booking_limit'");
  addAppointment("completed");
  assert.equal((await validateBooking(db, input())).ok, true);
  addAppointment("checked_in");
  const result = await createBooking(db, input(), { overrideMonthlyLimit: true, actorUserId: 1 });
  assert.equal(result.ok, false);
  assert.match(result.errors.join(" "), /monthly booking limit of 2/);
  assert.equal(count(sqlite), 2);
});

for (const change of [
  { appointmentDate: "invalid-date" },
  { appointmentDate: "2099-12-31" },
  { dropoffTypeId: 999 },
  { userId: 999 },
  { allocations: [{ itemAreaId: 1, percentage: 10 }] },
  { description: "x".repeat(2001) },
]) {
  test(`monthly override retains validation for ${Object.keys(change)[0]}`, async t => {
    const { db, sqlite, addAppointment, input } = setup(t);
    addAppointment("completed");
    const result = await creation.createAdminAppointment(db, { ...input(), ...change }, yes);
    assert.equal(result.ok, false);
    assert.ok(result.errors.length);
    assert.equal(count(sqlite), 1);
  });
}

test("monthly override does not bypass a customer drop-off ban", async t => {
  const { db, sqlite, addAppointment, input } = setup(t);
  addAppointment("completed");
  sqlite.exec("UPDATE users SET dropoff_banned = 1 WHERE id = 2");
  const result = await creation.createAdminAppointment(db, input(), yes);
  assert.equal(result.ok, false);
  assert.match(result.errors.join(" "), /unable to schedule/);
  assert.equal(count(sqlite), 1);
});

test("monthly confirmation combines with the automatic capacity audit", async t => {
  const { db, addAppointment, input } = setup(t, { dailyCapacity: 20 });
  addAppointment("completed", 20);
  assert.equal((await creation.createAdminAppointment(db, input(), admin)).monthlyConfirmation, true);
  const result = await creation.createAdminAppointment(db, input(), yes);
  assert.equal(result.ok, true);
  const [audit] = await getAppointmentOverrideHistory(db, result.appointmentId);
  assert.ok(audit.violatedRules.includes("monthly_appointment_limit_override"));
  assert.ok(audit.violatedRules.some(rule => rule.includes("confirmed daily intake capacity")));
  assert.equal(audit.reason, "admin-created appointment");
});

test("monthly confirmation creates a scheduled appointment above storage capacity", async t => {
  const { db, addAppointment, input } = setup(t, { areaCapacity: 20 });
  addAppointment("scheduled", 20);
  const result = await creation.createAdminAppointment(db, input(), yes);
  assert.equal(result.ok, true);
  assert.equal(result.status, "scheduled");
});

test("monthly confirmation allows full waitlist creation without manual capacity consent", async t => {
  const { db, sqlite, addAppointment, input } = setup(t, { areaCapacity: 0, overflow: 0 });
  addAppointment("completed");
  const result = await creation.createAdminAppointment(db, input(), yes);
  assert.equal(result.ok, true);
  assert.equal(result.status, "scheduled");
  assert.equal(count(sqlite), 2);
});

test("write or audit failures return visible errors and leave no partial appointment", async t => {
  const { db, sqlite, addAppointment, input } = setup(t);
  addAppointment("completed");
  sqlite.exec("CREATE TRIGGER reject_test_audit BEFORE INSERT ON appointment_override_audits BEGIN SELECT RAISE(ABORT, 'Audit unavailable'); END");
  const result = await creation.createAdminAppointment(db, input(), yes);
  assert.equal(result.ok, false);
  assert.match(result.errors.join(" "), /could not be created/);
  assert.deepEqual(result.submitted, input());
  assert.equal(count(sqlite), 1);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM appointment_area_allocations").get().count, 3);
});

// Exercise the real route action and real requireRole/requireUser functions.
// Only session lookup, Cloudflare env and notification delivery are replaced.
const authSource = await readFile(new URL("../app/services/auth.server.ts", import.meta.url), "utf8");
const authTree = createSourceFile("auth.server.ts", authSource, ScriptTarget.Latest, true);
const authGuards = authTree.statements.filter(node => isFunctionDeclaration(node) && ["requireUser", "requireAnyRole", "requireRole"].includes(node.name?.text)).map(node => node.getText(authTree)).join("\n");
const routeSource = await readFile(new URL("../app/routes/admin.appointments.new.tsx", import.meta.url), "utf8");
function compile(source, imports, parameters = {}) {
  const exports = {};
  const code = transpileModule(source, { compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022, jsx: JsxEmit.ReactJSX } }).outputText;
  new Function("require", "exports", ...Object.keys(parameters), code)(name => {
    if (!(name in imports)) throw new Error(`Unexpected import ${name}`);
    return imports[name];
  }, exports, ...Object.values(parameters));
  return exports;
}
function routeFor(db, { notificationFailure = false } = {}) {
  const auth = compile(authGuards, {}, {
    redirect: router.redirect,
    hasAnyRole: roles.hasAnyRole,
    async getCurrentUser(request) {
      const id = Number(request.headers.get("test-session-user"));
      const user = db.sqlite.prepare("SELECT id, email, active FROM users WHERE id = ?").get(id);
      if (!user?.active) return null;
      return { ...user, roles: db.sqlite.prepare("SELECT role FROM user_roles WHERE user_id = ?").all(id).map(row => row.role) };
    },
  });
  return compile(routeSource, {
    "react/jsx-runtime": jsxRuntime,
    "cloudflare:workers": { env: { trice_auction_db: db } },
    "react-router": router,
    "../services/booking.server": booking,
    "../services/admin-appointment-creation.server": creation,
    "../services/auth.server": auth,
    "../services/customer-management.server": customers,
    "../services/schedule-management.server": schedule,
    "../services/notification.server": { async queueAppointmentCreated() { if (notificationFailure) throw new Error("Notification unavailable"); } },
    "../components/admin-appointment-fields": fields,
    "../components/admin-appointment-feedback": confirmation,
  });
}
function request(input, extra = {}, actor = 1) {
  const form = new URLSearchParams({ customerId: String(input.userId), appointmentDate: input.appointmentDate, dropoffTypeId: String(input.dropoffTypeId), description: input.description, responseMode: "modal", intent: "save", ...extra });
  for (const allocation of input.allocations) form.set(`allocation-${allocation.itemAreaId}`, String(allocation.percentage));
  return new Request("https://example.test/admin/appointments/new", { method: "POST", headers: { "test-session-user": String(actor) }, body: form });
}

function renderPage(Component, props) {
  const memoryRouter = router.createMemoryRouter([{ path: "/", element: createElement(Component, props) }]);
  return renderToStaticMarkup(createElement(router.RouterProvider, { router: memoryRouter }));
}

for (const actor of [2, 4, 5]) {
  test(`forged monthly override POST from actor ${actor} is rejected by the actual route guard`, async t => {
    const { db, sqlite, addAppointment, input } = setup(t);
    addAppointment("scheduled");
    await assert.rejects(routeFor(db).action({ request: request(input(), { overrideMonthlyLimit: "true", intent: "confirm-monthly", actorUserId: "1" }, actor) }), response => response instanceof Response && response.status === 403);
    assert.equal(count(sqlite), 1);
  });
}

test("unauthenticated monthly override POST requires login", async t => {
  const { db, input } = setup(t);
  await assert.rejects(routeFor(db).action({ request: request(input(), { overrideMonthlyLimit: "true" }, 999) }), response => response instanceof Response && response.headers.get("Location") === "/login");
});

test("modal POST warning, No and Yes form a two-step workflow with preserved inputs", async t => {
  const { db, sqlite, addAppointment, input } = setup(t);
  addAppointment("completed");
  const route = routeFor(db);
  const warning = await route.action({ request: request(input()) });
  assert.equal(warning.data.monthlyConfirmation, true);
  assert.equal(warning.init.status, 200);
  const no = await route.action({ request: request(warning.data.submitted, { intent: "go-back", overrideMonthlyLimit: "true" }) });
  assert.deepEqual(no.data.submitted, warning.data.submitted);
  assert.equal(no.data.monthlyConfirmation, undefined);
  assert.equal(count(sqlite), 1);
  const result = await route.action({ request: request(input(), { intent: "confirm-monthly", overrideMonthlyLimit: "true" }) });
  assert.equal(result.data.ok, true);
  assert.equal(count(sqlite), 2);
});

test("schedule-bound creation revalidates the schedule date rather than a forged form date", async t => {
  const { db, addAppointment, input } = setup(t);
  addAppointment("completed");
  const result = await routeFor(db).action({ request: request(input(), { scheduleId: "1", appointmentDate: "2099-01-01", overrideMonthlyLimit: "true" }) });
  assert.equal(result.data.ok, true);
  assert.equal(db.sqlite.prepare("SELECT appointment_date AS date FROM appointments WHERE id = ?").get(result.data.appointmentId).date, appointmentDate);
});

test("the standalone page renders the monthly prompt, both buttons, and entered values", async t => {
  const { db, addAppointment, input } = setup(t);
  addAppointment("completed");
  const actionData = await creation.createAdminAppointment(db, input(), admin);
  const loaderData = { options: await booking.getBookingOptions(db, { adminScheduling: true }), customers: [], selectedCustomer: await customers.getCustomerById(db, 2), q: "", selectedDate: { date: appointmentDate }, scheduleId: null };
  const markup = renderPage(routeFor(db).default, { loaderData, actionData });
  assert.match(markup, /already had a drop-off appointment this month/);
  assert.match(markup, /Yes, Schedule Anyway/);
  assert.match(markup, /No, Go Back/);
  assert.match(markup, /name="overrideMonthlyLimit" value="true"/);
  assert.match(markup, /Furniture and boxes/);
});

test("creation errors stay in the modal response and render a visible alert on the standalone page", async t => {
  const { db, input } = setup(t);
  db.sqlite.exec("CREATE TRIGGER reject_test_appointment BEFORE INSERT ON appointments BEGIN SELECT RAISE(ABORT, 'Database unavailable'); END");
  const route = routeFor(db);
  const result = await route.action({ request: request(input()) });
  assert.equal(result.init.status, 400);
  assert.equal(result.data.ok, false);
  assert.match(result.data.errors.join(" "), /could not be created/);
  const loaderData = { options: await booking.getBookingOptions(db, { adminScheduling: true }), customers: [], selectedCustomer: await customers.getCustomerById(db, 2), q: "", selectedDate: { date: appointmentDate }, scheduleId: null };
  const markup = renderPage(route.default, { loaderData, actionData: result.data });
  assert.match(markup, /role="alert"/);
  assert.match(markup, /could not be created/);
});

test("notification failure reports creation success rather than encouraging a duplicate retry", async t => {
  const { db, sqlite, input } = setup(t);
  const result = await routeFor(db, { notificationFailure: true }).action({ request: request(input()) });
  assert.equal(result.data.ok, true);
  assert.match(result.data.message, /Notifications could not be queued/);
  assert.equal(count(sqlite), 1);
});

for (const actor of [2, 4, 5]) {
  test(`forged automatic capacity POST from actor ${actor} is forbidden`, async t => {
    const { db, sqlite, input } = setup(t, { dailyCapacity: 0, areaCapacity: 0, overflow: 0 });
    await assert.rejects(routeFor(db).action({ request: request(input(), { isAdmin: "true", actorUserId: "1", overrideCapacity: "true" }, actor) }), response => response instanceof Response && response.status === 403);
    assert.equal(count(sqlite), 0);
  });
}

test("normal authenticated admin save confirms above all limits without an override flag or reason", async t => {
  const { db, input } = setup(t, { dailyCapacity: 0, areaCapacity: 0, overflow: 0 });
  const result = await routeFor(db).action({ request: request(input()) });
  assert.equal(result.data.ok, true);
  const saved = db.sqlite.prepare("SELECT status FROM appointments WHERE id=?").get(result.data.appointmentId);
  assert.equal(saved.status, "scheduled");
  const [audit] = await getAppointmentOverrideHistory(db, result.data.appointmentId);
  assert.equal(audit.reason, "admin-created appointment");
  assert.equal(audit.actorUserId, 1);
});
