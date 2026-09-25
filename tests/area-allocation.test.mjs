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

test("all item-area allocations are deliberate and must total exactly 100%", () => {
  assert.doesNotMatch(bookingService, /deriveLargeFurnitureAllocation/);
  assert.match(bookingService, /Item-area allocations must total exactly 100%/);
  assert.match(allocationFields, /\?\.percentage \?\? 0/);
  assert.match(allocationFields, /name=\{`allocation-\$\{area\.id\}`\}/);
  assert.match(allocationFields, /Total allocated:/);
});

test("all appointment allocation editors use editable shared allocation fields", () => {
  for (const source of [customerForm, appointmentEdit, adminAppointmentFields, managerForm]) {
    assert.match(source, /AreaAllocationFields/);
  }
  assert.match(adminForm, /AdminAppointmentFields/);
  assert.doesNotMatch(allocationFields, /readOnly=/);
  assert.match(customerForm, /Reserve My Space/);
  assert.match(customerForm, /total !== 100/);
});
