import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const route = await readFile(new URL("../app/routes/admin.reports.dropoff-schedule.tsx", import.meta.url), "utf8");
const service = await readFile(new URL("../app/services/dropoff-schedule-report.server.ts", import.meta.url), "utf8");
const routes = await readFile(new URL("../app/routes.ts", import.meta.url), "utf8");
const adminLayout = await readFile(new URL("../app/routes/admin.layout.tsx", import.meta.url), "utf8");

test("daily drop-off report is admin-only and exposes the print route", () => {
  assert.match(routes, /admin\/reports\/dropoff-schedule/);
  assert.match(route, /requireRole\(request, env\.trice_auction_db, runtime, "admin"\)/);
  assert.match(route, /window\.print\(\)/);
  assert.match(route, /SELECT id FROM dropoff_days WHERE dropoff_date = \?/);
  assert.match(route, /scheduleUrl: dropoffDay \? `\/admin\/schedule\/\$\{dropoffDay\.id\}` : "\/admin\/schedule"/);
  assert.match(route, /<Link to=\{scheduleUrl\}[^>]*>← Daily Schedules<\/Link>/);
  assert.match(routes, /layout\("routes\/admin\.layout\.tsx", \[[\s\S]*admin\/reports\/dropoff-schedule/s);
  assert.match(route, /report-controls print-hide/);
  assert.match(adminLayout, /<aside className="print-hide/);
});

test("report preserves stored-time ordering without exposing appointment times", () => {
  assert.match(service, /appointment\.appointment_time ASC, appointment\.created_at ASC/);
  assert.doesNotMatch(service, /appointment_time AS appointmentTime/);
  assert.doesNotMatch(route, /<th>Time<\/th>/);
  assert.doesNotMatch(route, /appointment\.appointmentTime/);
  assert.match(service, /user\.consignor_id AS consignorId/);
  assert.match(service, /appointment\.checked_in_at AS checkedInAt/);
  assert.match(service, /appointment\.admin_notes AS adminNotes/);
  assert.match(service, /last_minute_cancelled/);
});

test("report prints a readable, multi-page table without controls", () => {
  assert.match(route, /No appointments scheduled\./);
  assert.match(route, /report-table thead \{ display: table-header-group/);
  assert.match(route, /page-break-inside: avoid/);
  assert.match(route, /\.print-hide \{ display: none !important/);
  assert.match(route, /description-cell/);
});
