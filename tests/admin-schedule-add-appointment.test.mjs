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

test("schedule detail prioritizes appointments before drop-off day settings", () => {
  assert.ok(scheduleDetail.indexOf('id="appointments"') < scheduleDetail.indexOf('id="dropoff-day-settings"'));
  assert.ok(scheduleDetail.indexOf("Print Daily Schedule") < scheduleDetail.indexOf('id="dropoff-day-settings"'));
  assert.match(scheduleDetail, /preventScrollReset/);
});

test("appointment actions share the appointments header row", () => {
  assert.match(scheduleDetail, /items-center justify-between gap-4.*<h2 className="text-2xl font-bold">Appointments<\/h2>.*AddAppointmentModal.*Print Daily Schedule/s);
  assert.ok(scheduleDetail.indexOf("Print Daily Schedule") < scheduleDetail.indexOf("APPOINTMENT_STATUS_FILTERS.map"));
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

test("modal supports searching, selecting, and creating customers without leaving the appointment flow", () => {
  assert.match(appointmentModal, /Search customers/);
  assert.match(appointmentModal, /name="customerId"/);
  assert.match(appointmentModal, /Add New Customer/);
  assert.match(appointmentModal, /name="intent" value="create-customer"/);
  assert.match(appointmentModal, /First Name/);
  assert.match(appointmentModal, /Last Name/);
  assert.match(appointmentModal, /Temporary Password/);
  assert.match(appointmentModal, /Consignor Number/);
  assert.match(appointmentModal, /Cancel New Customer/);
  assert.match(appointmentModal, /<fetcher\.Form method="post" action="\/admin\/appointments\/new"/);
  assert.doesNotMatch(appointmentModal, /\/admin\/users/);
});

test("new inline customer is selected automatically and appointment fields remain mounted", () => {
  assert.match(appointmentModal, /setSelectedCustomer\(customer\)/);
  assert.match(appointmentModal, /setShowNewCustomer\(false\)/);
  assert.match(appointmentModal, /<CustomerSummary customer=\{selectedCustomer\}/);
  assert.match(appointmentModal, /Consignor Number: \$\{customer\.consignorNumber\}/);
  assert.ok(appointmentModal.indexOf("showNewCustomer ? <InlineCustomerForm") < appointmentModal.indexOf("selectedCustomer ? <appointmentFetcher.Form"));
});

test("inline customer creation is admin-only, validates server-side, and safely handles duplicates", () => {
  assert.match(appointmentRoute, /requireRole\(request, env\.trice_auction_db, runtime, "admin"\)/);
  assert.match(appointmentRoute, /form\.get\("intent"\) === "create-customer"/);
  assert.match(appointmentRoute, /customerInputFromForm\(form\)/);
  assert.match(appointmentRoute, /validateNewCustomer\(input\)/);
  assert.match(appointmentRoute, /getCustomerByEmail\(env\.trice_auction_db, input\.email\)/);
  assert.match(appointmentRoute, /getAuth\(env\.trice_auction_db, runtime\)\.handler/);
  assert.match(appointmentRoute, /createCustomerApplicationUser\(env\.trice_auction_db, input, payload\.user\.id\)/);
  assert.match(appointmentModal, /An account already exists for this email/);
  assert.match(appointmentModal, /Select existing customer/);
});
