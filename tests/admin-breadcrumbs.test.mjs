import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { appointmentDate, fixture, moduleUrl } from "./helpers/booking-fixture.mjs";

const { getDropoffHierarchy } = await import(await moduleUrl(new URL("../app/services/admin-breadcrumbs.server.ts", import.meta.url)));
const { AdminBreadcrumbs, dropoffBreadcrumbs } = await import(await moduleUrl(new URL("../app/components/admin-breadcrumbs.tsx", import.meta.url)));
function render(items) { return renderToStaticMarkup(createElement(MemoryRouter, null, createElement(AdminBreadcrumbs, { items }))); }

test("linked date and its appointment use database parent links on direct lookup", async t => {
  const { db, sqlite } = fixture(t);
  sqlite.prepare("UPDATE booking_events SET name=? WHERE id=1").run("November Drop-Off Signup");
  const direct = await getDropoffHierarchy(db, { id: 1 });
  assert.deepEqual({ ...direct }, { id: 1, date: appointmentDate, bookingEventId: 1, bookingEventName: "November Drop-Off Signup" });
  assert.deepEqual(await getDropoffHierarchy(db, { date: appointmentDate }), direct);
  const html = render(dropoffBreadcrumbs(direct));
  assert.match(html, /aria-label="Breadcrumb"/);
  assert.match(html, /href="\/admin\/booking-events"/);
  assert.match(html, /href="\/admin\/booking-events\/1"[^>]*>November Drop-Off Signup/);
  assert.match(html, /aria-current="page"/);
  assert.doesNotMatch(html, /href="\/admin\/schedule"/);
  const appointmentHtml = render(dropoffBreadcrumbs(direct, "Appointment #42"));
  assert.match(appointmentHtml, /href="\/admin\/schedule\/1"/);
  assert.match(appointmentHtml, /Appointment #42/);
});

test("private dates and appointments without a configured date fall back to stable parents", async t => {
  const { db, sqlite } = fixture(t);
  sqlite.exec("DELETE FROM booking_event_dropoff_dates WHERE dropoff_day_id=1; UPDATE dropoff_days SET visibility='private' WHERE id=1");
  const hierarchy = await getDropoffHierarchy(db, { id: 1 });
  assert.equal(hierarchy.bookingEventId, null);
  const html = render(dropoffBreadcrumbs(hierarchy, "Appointment #8"));
  assert.match(html, /href="\/admin\/schedule"/);
  assert.match(html, /href="\/admin\/schedule\/1"/);
  assert.doesNotMatch(html, /booking-events/);
  assert.equal(await getDropoffHierarchy(db, { date: "2000-01-01" }), null);
  assert.match(render(dropoffBreadcrumbs(null, "Appointment #8")), /href="\/admin\/appointments"/);
});

test("routes use database hierarchy and logical parent links", async () => {
  const [schedule, detail, edit, events] = await Promise.all(["admin.schedule.detail", "admin.appointments.detail", "admin.appointments.edit", "admin.booking-events"].map(name => readFile(new URL(`../app/routes/${name}.tsx`, import.meta.url), "utf8")));
  assert.match(schedule, /getDropoffHierarchy\(env\.trice_auction_db, \{ id: Number\(params\.id\) \}\)/);
  assert.match(schedule, /Back to \{loaderData\.hierarchy\?\.bookingEventId \? "Booking Event" : "Schedule"\}/);
  assert.match(detail, /getDropoffHierarchy\(env\.trice_auction_db, \{ date: appointment\.appointmentDate \}\)/);
  assert.match(edit, /getDropoffHierarchy\(env\.trice_auction_db, \{ date: detail\.appointment\.date \}\)/);
  assert.match(events, /\/admin\/schedule\/\$\{date\.id\}#appointments/);
  assert.doesNotMatch(schedule + detail + edit, /window\.history|Back to Drop-Offs/);
});
