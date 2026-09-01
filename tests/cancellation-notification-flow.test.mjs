import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const notificationService = await readFile(new URL("../app/services/notification.server.ts", import.meta.url), "utf8");
const customerRoute = await readFile(new URL("../app/routes/my-appointments.detail.tsx", import.meta.url), "utf8");
const adminRoute = await readFile(new URL("../app/routes/admin.appointments.detail.tsx", import.meta.url), "utf8");
const managerRoute = await readFile(new URL("../app/routes/manager.detail.tsx", import.meta.url), "utf8");

test("cancellation transition is conditional and queues one cancellation notification", () => {
  assert.match(notificationService, /UPDATE appointments SET status='cancelled'.*status='scheduled'/);
  assert.match(notificationService, /cancelFutureAppointmentReminders\(db,appointmentId\)/);
  assert.match(notificationService, /queueAppointmentNotifications\(db,appointmentId,"cancelled"\)/);
});

test("customer, admin, and manager cancellation paths use the shared transition", () => {
  for (const source of [customerRoute, adminRoute, managerRoute]) assert.match(source, /cancelScheduledAppointment/);
});
