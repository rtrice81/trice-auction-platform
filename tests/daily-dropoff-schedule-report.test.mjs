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
  assert.match(routes, /layout\("routes\/admin\.layout\.tsx", \[[\s\S]*admin\/reports\/dropoff-schedule/s);
  assert.match(route, /report-controls print-hide/);
  assert.match(adminLayout, /<aside className="print-hide/);
});

test("report query orders by stored time and includes operational appointment details", () => {
  assert.match(service, /appointment\.appointment_time ASC, appointment\.created_at ASC/);
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
