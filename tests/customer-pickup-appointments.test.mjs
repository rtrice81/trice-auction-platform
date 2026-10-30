import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createElement } from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import * as router from "react-router";
import { createStaticHandler } from "react-router";
import { createSourceFile, isFunctionDeclaration, JsxEmit, ModuleKind, ScriptTarget, transpileModule } from "typescript";
import { appointmentDate, fixture, moduleUrl } from "./helpers/booking-fixture.mjs";

const service = await import(await moduleUrl(new URL("../app/services/customer-appointments.server.ts", import.meta.url)));
const statuses = await import(await moduleUrl(new URL("../app/lib/consignment-pickup-status.ts", import.meta.url)));
const booking = await import(await moduleUrl(new URL("../app/services/booking.server.ts", import.meta.url)));
const flash = await import(await moduleUrl(new URL("../app/services/booking-success-flash.server.ts", import.meta.url)));
const design = await import(await moduleUrl(new URL("../app/components/design-system.tsx", import.meta.url)));
const confirmation = await import(await moduleUrl(new URL("../app/components/confirmation-form.tsx", import.meta.url)));
const allocations = await import(await moduleUrl(new URL("../app/components/area-allocation-fields.tsx", import.meta.url)));
const roles = await import(await moduleUrl(new URL("../app/lib/roles.ts", import.meta.url)));
const notificationService = await import(await moduleUrl(new URL("../app/services/notification.server.ts", import.meta.url)));
const pickupService = await import(await moduleUrl(new URL("../app/services/consignment-pickups.server.ts", import.meta.url)));
const customers = await import(await moduleUrl(new URL("../app/services/customer-management.server.ts", import.meta.url)));
const adminSources = await Promise.all(["admin.pickups.new", "admin.pickups.edit"].map(name => readFile(new URL(`../app/routes/${name}.tsx`, import.meta.url), "utf8")));
const internalNotifications = await import(await moduleUrl(new URL("../app/services/internal-appointment-notifications.server.ts", import.meta.url)));
const archive = await import("../app/lib/booking-event-archive.js");
const managerSource = await readFile(new URL("../app/routes/manager.detail.tsx", import.meta.url), "utf8");
const adminDropoffSource = await readFile(new URL("../app/routes/admin.appointments.edit.tsx", import.meta.url), "utf8");
const audit = await import(await moduleUrl(new URL("../app/services/appointment-override-audit.server.ts", import.meta.url)));
const sources = await Promise.all(["my-appointments", "my-appointments.detail", "my-appointments.pickups.detail"].map(name => readFile(new URL(`../app/routes/${name}.tsx`, import.meta.url), "utf8")));
const authSource = await readFile(new URL("../app/services/auth.server.ts", import.meta.url), "utf8");
const tree = createSourceFile("auth.ts", authSource, ScriptTarget.Latest, true);
const guards = tree.statements.filter(node => isFunctionDeclaration(node) && ["requireUser", "requireAnyRole", "requireRole", "requireOwnership", "hasPermission"].includes(node.name?.text)).map(node => node.getText(tree)).join("\n");
function compile(source, imports, parameters = {}) {
  const exports = {};
  const code = transpileModule(source, { compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022, jsx: JsxEmit.ReactJSX } }).outputText;
  new Function("require", "exports", ...Object.keys(parameters), code)(name => {
    assert.ok(name in imports, `Unexpected import: ${name}`);
    return imports[name];
  }, exports, ...Object.values(parameters));
  return exports;
}
function routes(db) {
  const auth = compile(guards, {}, {
    redirect: router.redirect, hasAnyRole: roles.hasAnyRole,
    ROLE_PERMISSIONS: { consignor: ["appointment:edit-own"], admin: ["appointment:manage-all"], employee: [], manager: [], bidder: [] },
    async getCurrentUser(request) {
      const id = Number(request.headers.get("test-user"));
      const user = db.sqlite.prepare("SELECT id, email, active FROM users WHERE id=?").get(id);
      return user?.active ? { ...user, roles: db.sqlite.prepare("SELECT role FROM user_roles WHERE user_id=?").all(id).map(row => row.role) } : null;
    },
  });
  auth.hasAnyRole = roles.hasAnyRole;
  const imports = {
    "react/jsx-runtime": jsxRuntime, "react-router": router, "cloudflare:workers": { env: { trice_auction_db: db } },
    "../services/auth.server": auth, "../services/customer-appointments.server": service,
    "../services/booking-success-flash.server": flash, "../services/booking.server": booking,
    "../services/notification.server": notificationService, "../services/internal-appointment-notifications.server": internalNotifications,
    "../components/design-system": design, "../components/confirmation-form": confirmation,
    "../components/area-allocation-fields": allocations, "../services/appointment-override-audit.server": audit, "../lib/booking-event-archive.js": archive,
  };
  const [list, dropoff, pickup] = sources.map(source => compile(source, imports));
  const adminImports = { ...imports, "../services/consignment-pickups.server": pickupService, "../services/customer-management.server": customers, "../components/consignment-pickup-form": {} };
  const [adminCreate, adminEdit] = adminSources.map(source => compile(source, adminImports));
  const manager = compile(managerSource, imports);
  const adminDropoff = compile(adminDropoffSource, { ...imports, "./manager.detail": manager });
  return { list, dropoff, pickup, adminCreate, adminEdit, adminDropoff, handler: createStaticHandler([
    { path: "/my-appointments", ...list },
    { path: "/my-appointments/pickups/:id", ...pickup },
    { path: "/my-appointments/:id", ...dropoff },
  ]) };
}
function request(path = "/my-appointments", actor = 2, values) {
  return new Request(`https://example.test${path}`, { headers: { "test-user": String(actor) }, ...(values ? { method: "POST", body: new URLSearchParams(values) } : {}) });
}
function render(Component, loaderData) {
  const memory = router.createMemoryRouter([{ path: "/", element: createElement(Component, { loaderData }) }]);
  return renderToStaticMarkup(createElement(router.RouterProvider, { router: memory }));
}
function addPickup(sqlite, { userId = 2, date = appointmentDate, status = "planned", time = "09:30" } = {}) {
  return Number(sqlite.prepare(`INSERT INTO consignment_pickups
    (user_id, title, pickup_date, arrival_time, status, contact_name, contact_phone, address_line1, address_line2, city, state, postal_code, estate_description, internal_notes, access_instructions, estimated_load_size, created_by_user_id)
    VALUES (?, 'Estate furniture collection', ?, ?, ?, 'Customer Contact', '555-0100', '123 Main Street', 'Unit 2', 'Denton', 'MD', '21629', 'Furniture and household goods', 'SECRET STAFF NOTE', 'SECRET ACCESS CODE', 'SECRET TRUCK PLAN', 1)`)
    .run(userId, date, time, status).lastInsertRowid);
}
function snapshot(sqlite) { return sqlite.prepare("SELECT * FROM consignment_pickups ORDER BY id").all().map(row => ({ ...row })); }

function assertSafe(value) {
  assert.doesNotMatch(JSON.stringify(value), /SECRET|internalNotes|internal_notes|accessInstructions|access_instructions|assignedStaff|assignedUser|createdBy|created_by|estimatedLoad|notificationRevision/);
}

test("customer list combines own pickups and drop-offs with distinct cards and safe data", async t => {
  const { db, sqlite, addAppointment } = fixture(t);
  const dropoffId = addAppointment("scheduled");
  const pickupId = addPickup(sqlite);
  addPickup(sqlite, { userId: 3 });
  sqlite.prepare("INSERT INTO consignment_pickup_assignments (pickup_id,user_id,assigned_by_user_id) VALUES (?,5,1)").run(pickupId);
  const { list } = routes(db);
  const response = await list.loader({ request: request() });
  assert.equal(response.data.appointments.length, 2);
  assert.deepEqual(response.data.appointments.map(row => row.kind).sort(), ["dropoff", "pickup"]);
  assertSafe(response.data);
  const html = render(list.default, response.data);
  assert.match(html, /Consignment Pickup/);
  assert.match(html, /Drop-Off/);
  assert.match(html, new RegExp(`/my-appointments/pickups/${pickupId}`));
  assert.match(html, new RegExp(`/my-appointments/${dropoffId}`));
  assert.match(html, /123 Main Street/);
  const pickupCard = html.match(/<section[^>]*><h2[^>]*>Estate furniture collection[\s\S]*?<\/section>/)?.[0];
  assert.ok(pickupCard);
  assert.match(pickupCard, /View Appointment/);
  assert.doesNotMatch(pickupCard, /<form|<button|edit|reschedule|cancel/i);
  assert.match(html, /View Appointment/);
  assert.match(html, />Cancel<\/button>/);
});

test("pickup-only authenticated customers can list and open their pickup", async t => {
  const { db, sqlite } = fixture(t);
  sqlite.exec("DELETE FROM user_roles WHERE user_id=2");
  const id = addPickup(sqlite);
  const { list, pickup } = routes(db);
  assert.equal((await list.loader({ request: request() })).data.appointments[0].kind, "pickup");
  const detail = await pickup.loader({ request: request(`/my-appointments/pickups/${id}`), params: { id: String(id) } });
  assert.equal(detail.pickup.id, id);
  assertSafe(detail);
  const html = render(pickup.default, detail);
  for (const text of ["Consignment Pickup", "Estate furniture collection", "Scheduled", "09:30", "123 Main Street", "Customer Contact", "555-0100", "Furniture and household goods", "Please contact us if changes are needed"]) assert.ok(html.includes(text), text);
  assert.doesNotMatch(html, /<form|<button|<input|<select|<textarea|SECRET|Edit|Reschedule|Cancel/);
});

for (const actor of [1, 3, 4, 5]) {
  test(`customer pickup detail does not expose another user's pickup to actor ${actor}`, async t => {
    const { db, sqlite } = fixture(t);
    const id = addPickup(sqlite);
    await assert.rejects(routes(db).pickup.loader({ request: request(`/my-appointments/pickups/${id}`, actor), params: { id: String(id) } }), response => response.status === 404);
  });
}

test("anonymous users must log in to list or read pickups; invalid IDs return 404", async t => {
  const { db } = fixture(t);
  const { list, pickup } = routes(db);
  for (const read of [() => list.loader({ request: request("/my-appointments", 999) }), () => pickup.loader({ request: request("/my-appointments/pickups/1", 999), params: { id: "1" } })]) {
    await assert.rejects(read(), response => response.headers.get("Location") === "/login");
  }
  for (const id of ["0", "-1", "not-an-id", "999"]) await assert.rejects(pickup.loader({ request: request(), params: { id } }), response => response.status === 404);
});

for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
  test(`${method} to pickup detail is rejected by the actual router without mutating records`, async t => {
    const { db, sqlite } = fixture(t);
    const id = addPickup(sqlite);
    const before = snapshot(sqlite);
    const { handler, pickup } = routes(db);
    assert.equal(pickup.action, undefined);
    const response = await handler.query(new Request(`https://example.test/my-appointments/pickups/${id}`, { method, headers: { "test-user": "2" }, body: new URLSearchParams({ status: "cancelled", title: "Changed" }) }));
    assert.equal(response.statusCode, 405);
    assert.deepEqual(snapshot(sqlite), before);
  });
}

test("customer drop-off details allow only the description and enforce ownership", async t => {
  const { db, sqlite, addAppointment } = fixture(t);
  const id = addAppointment("scheduled");
  const otherId = addAppointment("scheduled", 10, 3);
  const { dropoff, handler } = routes(db);
  const detail = await dropoff.loader({ request: request(), params: { id: String(id) } });
  const html = render(dropoff.default, detail);
  for (const label of ["Drop-off date", "Load type", "Status", "Item allocations", "What you are bringing", "Update What You Are Bringing"]) assert.ok(html.includes(label), label);
  assert.doesNotMatch(html, /<select|name="(?:appointmentDate|dropoffTypeId|status|allocation-)/);
  const before = { ...sqlite.prepare("SELECT * FROM appointments WHERE id=?").get(id) };
  const allocationBefore = sqlite.prepare("SELECT * FROM appointment_area_allocations WHERE appointment_id=?").all(id);
  for (const values of [
    { description: "Attack", appointmentDate: "2030-01-01", appointmentTime: "10:00", dropoffTypeId: "2", status: "cancelled", userId: "3", adminNotes: "attack", bookingEventId: "2", "allocation-1": "0", capacity: "100" },
    { intent: "cancel", status: "scheduled" }, { pickupId: String(id), description: "Attack" },
    { description: "x".repeat(2001) },
  ]) {
    const result = await dropoff.action({ request: request(`/my-appointments/${id}`, 2, values), params: { id: String(id) } });
    assert.equal(result.init.status, 400);
    assert.deepEqual({ ...sqlite.prepare("SELECT * FROM appointments WHERE id=?").get(id) }, before);
    assert.deepEqual(sqlite.prepare("SELECT * FROM appointment_area_allocations WHERE appointment_id=?").all(id), allocationBefore);
  }
  for (const operation of [dropoff.loader, dropoff.action]) {
    await assert.rejects(operation({ request: request(`/my-appointments/${otherId}`, 2, { description: "Attack" }), params: { id: String(otherId) } }), response => response.status === 404);
  }
  const result = await dropoff.action({ request: request(`/my-appointments/${id}`, 2, { description: "Updated customer description" }), params: { id: String(id) } });
  assert.match(result.data.message, /updated/);
  const after = { ...sqlite.prepare("SELECT * FROM appointments WHERE id=?").get(id) };
  assert.equal(after.description, "Updated customer description");
  delete before.description; delete before.updated_at; delete after.description; delete after.updated_at;
  assert.deepEqual(after, before);
  assert.deepEqual(sqlite.prepare("SELECT * FROM appointment_area_allocations WHERE appointment_id=?").all(id), allocationBefore);
  await assert.rejects(dropoff.action({ request: request(`/my-appointments/${otherId}`, 2, { intent: "cancel" }), params: { id: String(otherId) } }), response => response.status === 404);
  assert.equal(sqlite.prepare("SELECT status FROM appointments WHERE id=?").get(otherId).status, "scheduled");
  const cancel = await dropoff.action({ request: request(`/my-appointments/${id}`, 2, { intent: "cancel" }), params: { id: String(id) } });
  assert.match(cancel.data.message, /cancelled/);
  assert.equal(sqlite.prepare("SELECT status FROM appointments WHERE id=?").get(id).status, "cancelled");
});

test("an appointment owner without the consignor role can view, update and cancel their drop-off", async t => {
  const { db, sqlite, addAppointment } = fixture(t);
  const id = addAppointment("scheduled");
  const otherId = addAppointment("scheduled", 10, 3);
  sqlite.prepare("DELETE FROM user_roles WHERE user_id=?").run(2);
  const { list, dropoff } = routes(db);
  assert.ok((await list.loader({ request: request() })).data.appointments.some(appointment => appointment.id === id && appointment.kind === "dropoff"));
  assert.equal((await dropoff.loader({ request: request(), params: { id: String(id) } })).appointment.id, id);
  const updated = await dropoff.action({ request: request(`/my-appointments/${id}`, 2, { description: "Updated without a role" }), params: { id: String(id) } });
  assert.match(updated.data.message, /updated/);
  assert.equal(sqlite.prepare("SELECT description FROM appointments WHERE id=?").get(id).description, "Updated without a role");
  for (const values of [{ description: "Not mine" }, { intent: "cancel" }]) {
    await assert.rejects(dropoff.action({ request: request(`/my-appointments/${otherId}`, 2, values), params: { id: String(otherId) } }), response => response.status === 404);
  }
  const cancelled = await dropoff.action({ request: request(`/my-appointments/${id}`, 2, { intent: "cancel" }), params: { id: String(id) } });
  assert.match(cancelled.data.message, /cancelled/);
  assert.equal(sqlite.prepare("SELECT status FROM appointments WHERE id=?").get(otherId).status, "scheduled");
});

test("admin drop-off editing still updates date, load type, description and allocations", async t => {
  const { db, sqlite, addAppointment } = fixture(t);
  const id = addAppointment("scheduled");
  const nextDate = `${Number(appointmentDate.slice(0, 4))}-10-08`;
  sqlite.prepare("INSERT INTO dropoff_days (id, dropoff_date, capacity_points, is_open, visibility) VALUES (2, ?, 100, 1, 'public')").run(nextDate);
  sqlite.exec("INSERT INTO booking_event_dropoff_dates (booking_event_id, dropoff_day_id) VALUES (1, 2)");
  const { adminDropoff } = routes(db);
  const result = await adminDropoff.action({ request: request(`/admin/appointments/${id}/edit`, 1, { date: nextDate, typeId: "2", description: "Admin update", "allocation-1": "0", "allocation-2": "100", "allocation-3": "0" }), params: { id: String(id) } });
  assert.equal(result.data.ok, true);
  const updated = sqlite.prepare("SELECT appointment_date, dropoff_type_id, description FROM appointments WHERE id=?").get(id);
  assert.deepEqual({ ...updated }, { appointment_date: nextDate, dropoff_type_id: 2, description: "Admin update" });
  assert.equal(sqlite.prepare("SELECT allocation_percent FROM appointment_area_allocations WHERE appointment_id=? AND item_area_id=2").get(id).allocation_percent, 100);
});

for (const [status, label] of [["planned", "Scheduled"], ["scheduled", "Scheduled"], ["en_route", "On the Way"], ["on_site", "In Progress"], ["completed", "Completed"], ["cancelled", "Cancelled"]]) {
  test(`pickup status ${status} is displayed as ${label} without changing stored status`, async t => {
    const { db, sqlite } = fixture(t);
    const id = addPickup(sqlite, { status });
    assert.equal((await service.getCustomerPickup(db, 2, id)).status, label);
    assert.equal(sqlite.prepare("SELECT status FROM consignment_pickups WHERE id=?").get(id).status, status);
    assert.equal(statuses.pickupStatusLabel(status), { planned: "Planned", en_route: "En Route", on_site: "On Site" }[status] ?? label);
  });
}

for (const [date, before, midnight] of [
  ["2026-10-19", "2026-10-20T03:59:59.999Z", "2026-10-20T04:00:00.000Z"],
  ["2026-11-01", "2026-11-02T04:59:59.999Z", "2026-11-02T05:00:00.000Z"],
]) {
  test(`mixed appointments on ${date} become past at New York midnight, independently of status and time`, async t => {
    const { db, sqlite, addAppointment } = fixture(t);
    addAppointment("completed", 10, 2, date);
    addPickup(sqlite, { date, status: "completed", time: "00:01" });
    assert.equal((await service.getCustomerAppointments(db, 2, "upcoming", new Date(before))).length, 2);
    assert.equal((await service.getCustomerAppointments(db, 2, "past", new Date(before))).length, 0);
    assert.equal((await service.getCustomerAppointments(db, 2, "past", new Date(midnight))).length, 2);
    assert.equal((await service.getCustomerAppointments(db, 2, "upcoming", new Date(midnight))).length, 0);
  });
}

test("mixed types sort Upcoming ascending and Past descending with two queries, regardless of pickup count", async t => {
  const { db, sqlite, addAppointment } = fixture(t);
  addAppointment("scheduled", 10, 2, "2026-10-19");
  addAppointment("scheduled", 10, 2, "2026-10-22");
  for (const date of ["2026-10-18", "2026-10-20", "2026-10-23"]) addPickup(sqlite, { date });
  const prepare = db.prepare.bind(db);
  let queries = 0;
  db.prepare = sql => { queries++; return prepare(sql); };
  const upcoming = await service.getCustomerAppointments(db, 2, "upcoming", new Date("2026-10-19T12:00:00Z"));
  assert.equal(queries, 2);
  assert.deepEqual(upcoming.map(row => [row.kind, row.appointmentDate]), [["dropoff", "2026-10-19"], ["pickup", "2026-10-20"], ["dropoff", "2026-10-22"], ["pickup", "2026-10-23"]]);
  const past = await service.getCustomerAppointments(db, 2, "past", new Date("2026-10-24T12:00:00Z"));
  assert.deepEqual(past.map(row => row.appointmentDate), ["2026-10-23", "2026-10-22", "2026-10-20", "2026-10-19", "2026-10-18"]);
});


test("pickup creation and editing stay admin-only; admin management preserves internal fields", async t => {
  const { db, sqlite } = fixture(t);
  const id = addPickup(sqlite);
  const before = snapshot(sqlite);
  const { adminCreate, adminEdit } = routes(db);
  for (const actor of [2, 3, 4, 5]) {
    for (const route of [adminCreate, adminEdit]) {
      await assert.rejects(route.action({ request: request(`/admin/pickups/${id}/edit`, actor, { status: "cancelled" }), params: { id: String(id) } }), response => response.status === 403);
    }
  }
  assert.deepEqual(snapshot(sqlite), before);
  const loaded = await adminEdit.loader({ request: request(`/admin/pickups/${id}/edit`, 1), params: { id: String(id) } });
  assert.equal(loaded.values.internalNotes, "SECRET STAFF NOTE");
  assert.equal(loaded.values.accessInstructions, "SECRET ACCESS CODE");
  const form = { ...loaded.values, customerId: "2", title: "Updated by admin", status: "en_route", estimatedSmallsPercent: "100", assignedUserIds: "5" };
  const result = await adminEdit.action({ request: request(`/admin/pickups/${id}/edit`, 1, form), params: { id: String(id) } });
  assert.equal(result.status, 302);
  const updated = sqlite.prepare("SELECT title,status,internal_notes,access_instructions FROM consignment_pickups WHERE id=?").get(id);
  assert.equal(updated.title, "Updated by admin");
  assert.equal(updated.status, "en_route");
  assert.equal(updated.internal_notes, "SECRET STAFF NOTE");
  assert.equal(updated.access_instructions, "SECRET ACCESS CODE");
  assert.equal((await service.getCustomerPickup(db, 2, id)).status, "On the Way");
  const created = await adminCreate.action({ request: request("/admin/pickups/new", 1, form) });
  assert.equal(created.status, 302);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM consignment_pickups").get().n, 2);
});
