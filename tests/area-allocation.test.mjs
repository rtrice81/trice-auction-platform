import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const bookingService = await readFile(new URL("../app/services/booking.server.ts", import.meta.url), "utf8");
const allocationFields = await readFile(new URL("../app/components/area-allocation-fields.tsx", import.meta.url), "utf8");
const customerForm = await readFile(new URL("../app/components/customer-booking-form.tsx", import.meta.url), "utf8");
const appointmentEdit = await readFile(new URL("../app/routes/my-appointments.detail.tsx", import.meta.url), "utf8");
const adminForm = await readFile(new URL("../app/routes/admin.appointments.new.tsx", import.meta.url), "utf8");
const adminAppointmentFields = await readFile(new URL("../app/components/admin-appointment-fields.tsx", import.meta.url), "utf8");
const managerForm = await readFile(new URL("../app/routes/manager.detail.tsx", import.meta.url), "utf8");

test("Large/Furniture is derived server-side and submitted Large values are ignored", () => {
  assert.match(bookingService, /export function deriveLargeFurnitureAllocation/);
  assert.match(bookingService, /100 - smallsPercentage - outdoorPercentage/);
  assert.match(bookingService, /Never use a submitted Large\/Furniture value/);
  assert.match(bookingService, /Smalls and Outdoor percentages cannot exceed 100% combined/);
});

test("all appointment allocation editors use the shared derived allocation fields", () => {
  for (const source of [customerForm, appointmentEdit, adminAppointmentFields, managerForm]) {
    assert.match(source, /AreaAllocationFields/);
  }
  assert.match(adminForm, /AdminAppointmentFields/);
  assert.match(allocationFields, /readOnly=\{isLarge\}/);
  assert.match(allocationFields, /name=\{isLarge \? undefined : `allocation-\$\{area\.id\}`\}/);
});
