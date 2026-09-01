import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const navigationSource = await readFile(
  new URL("../app/config/admin-navigation.ts", import.meta.url),
  "utf8",
);
const layoutSource = await readFile(
  new URL("../app/routes/admin.layout.tsx", import.meta.url),
  "utf8",
);
const recipientsRouteSource = await readFile(
  new URL("../app/routes/admin.notification-recipients.tsx", import.meta.url),
  "utf8",
);

test("notifications is a shared admin navigation module with overview and internal recipients", () => {
  const notificationsModule = navigationSource.match(
    /label: "Notifications",\s*displayOrder: 30,\s*items: \[([\s\S]*?)\n    \],\n  \},\n  \{\n    label: "System"/,
  );

  assert.ok(notificationsModule, "Notifications should be a top-level module");
  assert.match(notificationsModule[1], /label: "Notifications \/ Overview"/);
  assert.match(notificationsModule[1], /path: "\/admin\/notifications"/);
  assert.match(notificationsModule[1], /label: "Internal Recipients"/);
  assert.match(notificationsModule[1], /path: "\/admin\/notification-recipients"/);
});

test("shared admin layout marks the parent module and matching child as active", () => {
  assert.match(
    layoutSource,
    /module\.items\.some\(\(item\) => isActive\(item, pathname\)\)/,
  );
  assert.match(layoutSource, /aria-current=\{active \? "page" : undefined\}/);
  assert.match(layoutSource, /<AdminMenu navigation=\{loaderData\.navigation\} pathname=\{pathname\}/);
});

test("internal recipient management remains admin-only", () => {
  assert.match(
    recipientsRouteSource,
    /requireRole\(request, env\.trice_auction_db, runtime, "admin"\)/,
  );
});
