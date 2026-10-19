import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as jsxRuntime from "react/jsx-runtime";
import { createSourceFile, isFunctionDeclaration, JsxEmit, ModuleKind, ScriptTarget, transpileModule } from "typescript";
import { fixture, moduleUrl, createBooking, getAppointmentOverrideHistory } from "./helpers/booking-fixture.mjs";

const { createAdminAppointment } = await import(await moduleUrl(new URL("../app/services/admin-appointment-creation.server.ts", import.meta.url)));
const { getDropoffEventById } = await import(await moduleUrl(new URL("../app/services/schedule-management.server.ts", import.meta.url)));
const admin = { actorUserId: 1 };

for (const kind of ["daily", "storage", "waitlist", "combined"]) {
  test(`${kind}: customers retain limits and admin creation automatically confirms and audits`, async t => {
    const dailyFull = kind === "daily" || kind === "combined";
    const storageFull = kind !== "daily";
    const waitlistFull = kind === "waitlist" || kind === "combined";
    const { db, addAppointment, input, snapshot } = fixture(t, {
      dailyCapacity: dailyFull ? 10 : 100,
      areaCapacity: storageFull ? 10 : 100,
      overflow: waitlistFull ? 10 : 100,
    });
    addAppointment("scheduled", 10, 3);
    if (waitlistFull) addAppointment("waitlisted", 10, 3);
    // Client flags have no effect on normal creation, even for an admin actor.
    const customer = await createBooking(db, input(), { isAdmin: true, overrideCapacity: true, actorUserId: 1 });
    if (kind === "storage") {
      assert.equal(customer.ok, true);
      assert.equal(customer.status, "waitlisted");
    } else {
      assert.equal(customer.ok, false);
      assert.match(customer.errors.join(" "), dailyFull ? /daily intake capacity/ : /waitlist is full/);
    }
    const result = await createAdminAppointment(db, input(), { ...admin, overrideMonthlyLimit: kind === "storage" });
    assert.equal(result.ok, true);
    assert.equal(result.status, "scheduled");
    const saved = snapshot(result.appointmentId);
    assert.equal(saved.appointment.status, "scheduled");
    assert.equal(saved.appointment.waitlisted_at, null);
    assert.equal(saved.appointment.waitlist_reason, null);
    const [audit] = await getAppointmentOverrideHistory(db, result.appointmentId);
    assert.equal(audit.appointmentId, result.appointmentId);
    assert.equal(audit.actorUserId, 1);
    assert.equal(audit.actorRole, "admin");
    assert.ok(audit.occurredAt);
    assert.equal(audit.reason, "admin-created appointment");
    assert.equal(audit.requestedValues.userId, 2);
    assert.equal(audit.capacityContext.day.usedPoints, 10);
    assert.equal(audit.capacityContext.day.capacityPoints, dailyFull ? 10 : 100);
    if (dailyFull) assert.ok(audit.violatedRules.some(rule => rule.includes("daily intake capacity")));
    if (storageFull) assert.ok(audit.violatedRules.some(rule => rule.includes("Confirmed capacity exceeded")));
    if (waitlistFull) {
      assert.ok(audit.violatedRules.some(rule => rule.includes("waitlist is full")));
      assert.equal(audit.capacityContext.areas[0].waitlistUsedPoints, 10);
      assert.equal(audit.capacityContext.areas[0].waitlistCapacityPoints, 10);
    }
    const event = await getDropoffEventById(db, 1);
    assert.equal(event.usedPoints, 20);
    assert.equal(event.areas[0].confirmedUsagePoints, 20);
    if (storageFull) {
      assert.equal(event.areas[0].percentUsed, 200);
      assert.ok(event.areas[0].overrideUsageUnits > 0);
    }
  });
}

for (const actorUserId of [2, 4, 5, 999]) {
  test(`non-admin actor ${actorUserId} cannot invoke automatic creation`, async t => {
    const { db, sqlite, input } = fixture(t, { dailyCapacity: 0, areaCapacity: 0, overflow: 0 });
    const result = await createAdminAppointment(db, input(), { actorUserId, isAdmin: true, overrideCapacity: true });
    assert.equal(result.ok, false);
    assert.match(result.errors.join(" "), /Only an active administrator/);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM appointments").get().n, 0);
  });
}

for (const restriction of ["upcoming", "closed-window", "inactive", "closed-date", "private"]) {
  test(`admin bypasses ${restriction} and audits public availability; customer remains blocked`, async t => {
    const { db, sqlite, input } = fixture(t);
    if (restriction === "upcoming") sqlite.exec("UPDATE booking_events SET opens_at='2099-01-01T00:00:00Z', closes_at=NULL");
    if (restriction === "closed-window") sqlite.exec("UPDATE booking_events SET closes_at='2001-01-01T00:00:00Z'");
    if (restriction === "inactive") sqlite.exec("UPDATE booking_events SET active=0");
    if (restriction === "closed-date") sqlite.exec("UPDATE dropoff_days SET is_open=0");
    if (restriction === "private") sqlite.exec("UPDATE dropoff_days SET visibility='private'");
    assert.equal((await createBooking(db, input())).ok, false);
    const result = await createAdminAppointment(db, input(), admin);
    assert.equal(result.ok, true);
    const [audit] = await getAppointmentOverrideHistory(db, result.appointmentId);
    assert.equal(audit.reason, "admin-created appointment");
    assert.ok(audit.violatedRules.includes("public_booking_availability"));
    assert.equal(audit.capacityContext.publicAvailability.eligible, false);
    if (restriction === "closed-date") {
      assert.ok(audit.violatedRules.includes("dropoff_date_closed"));
      assert.equal(audit.capacityContext.day.isOpen, false);
    }
  });
}

// Render the actual capacity summary with usage from the database.
const detailSource = await readFile(new URL("../app/routes/admin.schedule.detail.tsx", import.meta.url), "utf8");
const tree = createSourceFile("detail.tsx", detailSource, ScriptTarget.Latest, true);
const functions = tree.statements.filter(node => isFunctionDeclaration(node) && ["StorageCapacitySummary", "formatStorageAmount", "formatPercent"].includes(node.name?.text)).map(node => node.getText(tree)).join("\n");
const code = transpileModule(`${functions}\nexport { StorageCapacitySummary };`, { compilerOptions: { module: ModuleKind.CommonJS, jsx: JsxEmit.ReactJSX } }).outputText;
const components = {};
new Function("require", "exports", code)(() => jsxRuntime, components);
test("saved over-capacity storage usage renders actual usage, percentage and excess", async t => {
  const { db, addAppointment, input } = fixture(t, { areaCapacity: 10 });
  addAppointment("scheduled", 10, 3);
  assert.equal((await createAdminAppointment(db, input(), admin)).ok, true);
  const event = await getDropoffEventById(db, 1);
  const html = renderToStaticMarkup(createElement(components.StorageCapacitySummary, { areas: event.areas }));
  assert.match(html, /200%/);
  assert.match(html, /Over capacity \/ admin override:/);
  assert.ok(html.includes(`${event.areas[0].confirmedUsageUnits} shelves`));
});
