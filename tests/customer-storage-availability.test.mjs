import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { appointmentDate, fixture, moduleUrl } from "./helpers/booking-fixture.mjs";

const booking = await import(await moduleUrl(new URL("../app/services/booking.server.ts", import.meta.url)));
const holds = await import(await moduleUrl(new URL("../app/services/booking-holds.server.ts", import.meta.url)));
const fields = await readFile(new URL("../app/components/area-allocation-fields.tsx", import.meta.url), "utf8");
const form = await readFile(new URL("../app/components/customer-booking-form.tsx", import.meta.url), "utf8");

for (const full of [[], [1], [2], [3], [1, 3], [1, 2, 3]]) {
  test(`customer storage availability reflects full areas ${full.join(",") || "none"}`, async t => {
    const { db, sqlite, addAppointment } = fixture(t, { areaCapacity: 10, dailyCapacity: 100 });
    for (const area of full) {
      const id = addAppointment("scheduled", 10, 3);
      sqlite.prepare("UPDATE appointment_area_allocations SET allocation_percent=CASE WHEN item_area_id=? THEN 100 ELSE 0 END, capacity_points=CASE WHEN item_area_id=? THEN 10 ELSE 0 END WHERE appointment_id=?").run(area, area, id);
    }
    const availability = await booking.getCustomerAreaAvailability(db, appointmentDate);
    assert.deepEqual(availability.filter(area => area.full).map(area => area.id), full);
    assert.ok(availability.every(area => Object.keys(area).sort().join(",") === "full,id,name"));
  });
}

test("date overrides, cancelled appointments and active holds affect the same capacity calculation", async t => {
  const { db, sqlite, addAppointment, input } = fixture(t, { areaCapacity: 20, dailyCapacity: 100 });
  const cancelled = addAppointment("cancelled", 10, 3);
  sqlite.prepare("INSERT INTO dropoff_day_area_overrides (dropoff_day_id, item_area_id, capacity_points_override) VALUES (1, 1, 10)").run();
  assert.equal((await booking.getCustomerAreaAvailability(db, appointmentDate))[0].full, false);
  const hold = await holds.reserveBookingHold(db, input(), "test-attempt", 2);
  assert.equal(hold.ok, true);
  assert.equal((await booking.getCustomerAreaAvailability(db, appointmentDate))[0].full, true);
  assert.equal((await booking.getCustomerAreaAvailability(db, appointmentDate, hold.hold.id))[0].full, false);
  assert.equal(sqlite.prepare("SELECT status FROM appointments WHERE id=?").get(cancelled).status, "cancelled");
});

test("a forged allocation and capacity filling after the page loads are rejected", async t => {
  const { db, sqlite, addAppointment, input } = fixture(t, { areaCapacity: 10, dailyCapacity: 100 });
  assert.equal((await booking.getCustomerAreaAvailability(db, appointmentDate))[0].full, false);
  addAppointment("scheduled", 10, 3);
  const rejected = await holds.reserveBookingHold(db, input(), "stale-attempt", 2);
  assert.equal(rejected.ok, false);
  assert.match(rejected.errors.join(" "), /Smalls capacity filled/);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM booking_holds").get().count, 0);
  const allowed = { ...input(), allocations: [{ itemAreaId: 1, percentage: 0 }, { itemAreaId: 2, percentage: 75 }, { itemAreaId: 3, percentage: 25 }] };
  assert.equal((await holds.reserveBookingHold(db, allowed, "valid-attempt", 2)).ok, true);
});

test("allocation UI shows status, disables full inputs and submits zero", () => {
  assert.match(fields, /disabled=\{full\}/);
  assert.match(fields, /type="hidden" name=\{`allocation-\$\{area\.id\}`\} value="0"/);
  assert.match(fields, /Full.*Available/);
  assert.match(form, /total !== 100/);
});
