import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { ModuleKind, ScriptTarget, transpileModule } from "typescript";
import { renderTemplateText } from "../app/lib/notification-template.js";

// Load the actual server service with its TypeScript dependencies, without the
// Cloudflare runtime. Only the database and outbound provider request are faked.
async function moduleUrl(url) {
  let code = transpileModule(await readFile(url, "utf8"), {
    compilerOptions: { module: ModuleKind.ESNext, target: ScriptTarget.ES2022 },
  }).outputText;
  for (const match of [...code.matchAll(/from "(\.[^"]+)"/g)]) {
    const dependency = new URL(match[1].endsWith(".js") ? match[1] : `${match[1]}.ts`, url);
    const resolved = dependency.pathname.endsWith(".ts") ? await moduleUrl(dependency) : dependency.href;
    code = code.replace(match[0], `from "${resolved}"`);
  }
  return `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`;
}

const service = await import(await moduleUrl(new URL("../app/services/notification.server.ts", import.meta.url)));
const expectedUrl = "https://consign.bidtrice.com/my-appointments/123";
const env = {
  APP_BASE_URL: "https://consign.bidtrice.com",
  BETTER_AUTH_URL: "https://trice-auction-platform.auctioneer-80b.workers.dev",
  RESEND_API_KEY: "test-key", RESEND_FROM_EMAIL: "test@example.test",
  TELNYX_API_KEY: "test-key", TELNYX_FROM_NUMBER: "+15555550123",
};

function fakeDb(channel, body = "Custom reminder: https://consign.bidtrice.com/{{appointment_link}}") {
  const writes = [];
  const template = { notificationType: "reminder_1", channel, subject: "View https://consign.bidtrice.com/{{appointment_link}}", body };
  return {
    writes, template,
    prepare(sql) {
      let values = [];
      return {
        bind(...args) { values = args; return this; },
        async all() {
          if (sql.includes("FROM settings")) return { results: [] };
          if (sql.includes("FROM notification_templates")) return { results: [template] };
          if (sql.includes("FROM notification_jobs")) return { results: [{ id: 1, user_id: 5, appointment_id: 123, notification_type: "reminder_1", channel, recipient: channel === "email" ? "customer@example.test" : "+15555550124", payload_json: "{}" }] };
          throw new Error(`Unexpected query: ${sql}`);
        },
        async first() {
          if (sql.includes("FROM notification_templates")) return template;
          if (sql.includes("FROM appointments")) return { id: 123, userId: 5, firstName: "Alex", lastName: "Customer", name: "Alex Customer", email: "customer@example.test", date: "2026-11-04", loadType: "Car Load", eventName: "Fall Drop-Off Event" };
          if (sql.includes("FROM user_notification_preferences")) return { appointmentEmailEnabled: 1, appointmentSmsEnabled: 1, smsOptedOutAt: null };
          throw new Error(`Unexpected query: ${sql}`);
        },
        async run() { writes.push({ sql, values }); return { meta: { changes: 1 } }; },
      };
    },
  };
}

test("preview sample uses the configured origin or local request fallback", () => {
  assert.equal(service.sampleTemplateContext(env, "https://trice-auction-platform.auctioneer-80b.workers.dev/admin/notifications").appointment_link, expectedUrl);
  assert.equal(service.sampleTemplateContext({}, "http://localhost:5173/admin/notifications").appointment_link, "http://localhost:5173/my-appointments/123");
});

for (const channel of ["email", "sms"]) {
  test(`${channel} delivery and preview render the same full URL from legacy and bare templates`, async t => {
    const messages = [];
    t.mock.method(globalThis, "fetch", async (_url, options) => {
      messages.push(JSON.parse(options.body));
      return Response.json({ id: "test-message", data: { id: "test-message" } });
    });
    for (const body of ["Custom reminder: https://consign.bidtrice.com/{{appointment_link}}", "Custom reminder: {{appointment_link}}", "Custom reminder: https://example.com/{{appointment_link}}"]) {
      const db = fakeDb(channel, body);
      await service.processDueNotificationJobs(db, env);
      const sent = messages.at(-1);
      const text = sent.text;
      assert.equal(text, `Custom reminder: ${expectedUrl}`);
      assert.equal(text, renderTemplateText(body, service.sampleTemplateContext(env)));
      if (channel === "email") assert.equal(sent.subject, `View ${expectedUrl}`);
      assert.ok(db.writes.some(write => write.sql.includes("status='sent'")));
    }
    await service.sendTestNotification(fakeDb(channel), env, { channel, destination: channel === "email" ? "test@example.test" : "+15555550124", notificationType: "reminder_1" });
    assert.equal(messages.at(-1).text, `Custom reminder: ${expectedUrl}`);
  });
}

test("saved template normalization preserves custom content and persists only on save", async () => {
  const db = fakeDb("email");
  const [loaded] = await service.getNotificationTemplates(db);
  assert.equal(loaded.body, "Custom reminder: {{appointment_link}}");
  assert.equal(loaded.subject, "View {{appointment_link}}");
  assert.equal(db.writes.length, 0);
  assert.equal(db.template.body, "Custom reminder: https://consign.bidtrice.com/{{appointment_link}}");
  assert.deepEqual(await service.saveNotificationTemplate(db, db.template), { ok: true });
  assert.deepEqual(db.writes[0].values, ["reminder_1", "email", "View {{appointment_link}}", "Custom reminder: {{appointment_link}}"]);
});

test("deployed default templates already use unprefixed appointment links", async () => {
  for (const migration of ["0022_add_notification_templates.sql", "0026_add_waitlist_notification_templates.sql"]) {
    const source = await readFile(new URL(`../migrations/${migration}`, import.meta.url), "utf8");
    assert.match(source, /{{appointment_link}}/);
    assert.doesNotMatch(source, /https?:\/\/[^\s]+\/{{appointment_link}}/);
  }
});

test("admin preview uses server sample data and the same renderer as delivery", async () => {
  const route = await readFile(new URL("../app/routes/admin.notifications.tsx", import.meta.url), "utf8");
  assert.match(route, /sampleContext: sampleTemplateContext\(providerEnvironment, request\.url\)/);
  assert.match(route, /renderTemplateText\(value, sampleContext\)/);
  assert.match(route, /APP_BASE_URL: getNotificationBaseUrl\(providerEnvironment, request\.url\)/);
  assert.doesNotMatch(route, /https:\/\/example\.com/);
});
