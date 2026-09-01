import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const scheduleDetail = await readFile(new URL("../app/routes/admin.schedule.detail.tsx", import.meta.url), "utf8");
const appointmentRoute = await readFile(new URL("../app/routes/admin.appointments.new.tsx", import.meta.url), "utf8");
const appointmentModal = await readFile(new URL("../app/components/add-appointment-modal.tsx", import.meta.url), "utf8");

test("schedule detail opens a schedule-bound Add Appointment modal", () => {
  assert.match(scheduleDetail, /<AddAppointmentModal scheduleId=\{event\.id\} appointmentDate=\{event\.date\}/);
  assert.match(appointmentModal, /Add Appointment/);
  assert.match(appointmentModal, /role="dialog"/);
  assert.match(appointmentModal, /aria-modal="true"/);
  assert.match(appointmentModal, /Close Add Appointment dialog/);
});

test("schedule-bound appointments require admin access and lock the submitted date server-side", () => {
  assert.match(appointmentRoute, /requireRole\(request, env\.trice_auction_db, runtime, "admin"\)/);
  assert.match(appointmentRoute, /getDropoffEventById\(env\.trice_auction_db, scheduleId\)/);
  assert.match(appointmentRoute, /if \(schedule\) input\.appointmentDate = schedule\.date/);
  assert.match(appointmentRoute, /allowAdminScheduling: true/);
});

test("modal validation stays in the dialog and successful creation revalidates without navigation", () => {
  assert.match(appointmentModal, /<appointmentFetcher\.Form method="post" action="\/admin\/appointments\/new"/);
  assert.match(appointmentModal, /role="alert"/);
  assert.match(appointmentModal, /onCreated\(appointmentFetcher\.data\.message/);
  assert.match(appointmentRoute, /form\.get\("responseMode"\) === "modal"/);
  assert.match(appointmentRoute, /data\(\{ ok: true as const, appointmentId: result\.appointmentId/);
});

test("modal keeps capacity overrides audited", () => {
  assert.match(appointmentRoute, /createAppointmentOverrideAuditStatement/);
  assert.match(appointmentModal, /name="intent" value="override"/);
  assert.match(appointmentModal, /Record override and create appointment/);
  assert.match(appointmentRoute, /data\(\{ ok: true as const, appointmentId, message: "Appointment created with capacity override\." \}\)/);
});

test("modal customer searches and creates remain protected by the existing admin action", () => {
  assert.match(appointmentModal, /Search customers/);
  assert.match(appointmentModal, /name="customerId"/);
  assert.match(appointmentRoute, /requireRole\(request, env\.trice_auction_db, runtime, "admin"\)/);
});
