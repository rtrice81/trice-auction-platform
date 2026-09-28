import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const service = await readFile(new URL("../app/services/site-announcement.server.ts", import.meta.url), "utf8");
const route = await readFile(new URL("../app/routes/admin.announcement.tsx", import.meta.url), "utf8");
const root = await readFile(new URL("../app/root.tsx", import.meta.url), "utf8");
const banner = await readFile(new URL("../app/components/site-announcement.tsx", import.meta.url), "utf8");
const navigation = await readFile(new URL("../app/config/admin-navigation.ts", import.meta.url), "utf8");

test("announcement settings are stored in the existing settings table and become visible only when enabled with a message", () => {
  assert.match(service, /site_announcement_enabled/);
  assert.match(service, /site_announcement_title/);
  assert.match(service, /site_announcement_message/);
  assert.match(service, /INSERT INTO settings \(key, value\)/);
  assert.match(service, /!announcement\.enabled \|\| !announcement\.message/);
});

test("the public banner is root-rendered below the shared header and has no hidden placeholder", () => {
  assert.match(root, /<AppHeader user=\{user\} logo=\{logo\} \/><SiteAnnouncement announcement=\{loaderData\.announcement\}/);
  assert.match(root, /pathname\.startsWith\("\/admin"\)/);
  assert.match(banner, /if \(!announcement\) return null/);
  assert.match(banner, /announcement\.message/);
  assert.doesNotMatch(banner, /dangerouslySetInnerHTML|innerHTML/);
});

test("only admins can update the announcement settings", () => {
  assert.match(route, /requireRole\(request, env\.trice_auction_db, runtime, "admin"\)/);
  assert.match(route, /form\.get\("intent"\) !== "save"/);
  assert.match(route, /saveSiteAnnouncement/);
  assert.match(navigation, /label: "Site Announcement"/);
  assert.match(navigation, /path: "\/admin\/settings\/announcement"/);
});

test("the admin form supports an optional title, enabled toggle, and plain-text message", () => {
  assert.match(route, /name="enabled"/);
  assert.match(route, /name="title"/);
  assert.match(route, /name="message"/);
  assert.match(route, /Save Announcement/);
  assert.match(service, /Site announcement saved\./);
});
