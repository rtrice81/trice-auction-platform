import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { ModuleKind, ScriptTarget, transpileModule } from "typescript";

const modules = new Map();
async function moduleUrl(url) {
  if (modules.has(url.href)) return modules.get(url.href);
  let code = transpileModule(await readFile(url, "utf8"), { compilerOptions: { module: ModuleKind.ESNext, target: ScriptTarget.ES2022 } }).outputText;
  for (const match of [...code.matchAll(/from "(\.[^"]+)"/g)]) {
    const dependency = new URL(match[1].endsWith(".js") ? match[1] : `${match[1]}.ts`, url);
    code = code.replace(match[0], `from "${dependency.pathname.endsWith(".ts") ? await moduleUrl(dependency) : dependency.href}"`);
  }
  const result = `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`;
  modules.set(url.href, result);
  return result;
}
const pickup = await import(await moduleUrl(new URL("../app/services/consignment-pickups.server.ts", import.meta.url)));
const notifications = await import(await moduleUrl(new URL("../app/services/notification.server.ts", import.meta.url)));
const internal = await import(await moduleUrl(new URL("../app/services/internal-pickup-notifications.server.ts", import.meta.url)));
const roles = await import(await moduleUrl(new URL("../app/lib/roles.ts", import.meta.url)));
const recipients = await import(await moduleUrl(new URL("../app/services/internal-appointment-notifications.server.ts", import.meta.url)));
const migrations = await Promise.all((await readdir(new URL("../migrations/", import.meta.url))).filter(name => name.endsWith(".sql")).sort().map(name => readFile(new URL(`../migrations/${name}`, import.meta.url), "utf8")));

function database(t) {
  const sql = new DatabaseSync(":memory:");
  t.after(() => sql.close());
  for (const migration of migrations) sql.exec(migration);
  sql.exec("INSERT INTO users(id,email,first_name,last_name,consignor_id) VALUES(1,'customer@example.test','Alex','Customer','C123'),(2,'admin@example.test','Pat','Admin','');");
  const db = {
    sql,
    prepare(query) {
      let values = [];
      return {
        bind(...args) { values = args; return this; },
        async first() { return sql.prepare(query).get(...values) ?? null; },
        async all() { return { results: sql.prepare(query).all(...values) }; },
        async run() { const result = sql.prepare(query).run(...values); return { meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) } }; },
      };
    },
    async batch(statements) {
      sql.exec("BEGIN");
      try { const results = []; for (const statement of statements) results.push(await statement.run()); sql.exec("COMMIT"); return results; }
      catch (error) { sql.exec("ROLLBACK"); throw error; }
    },
  };
  sql.exec("INSERT INTO appointment_notification_recipients(label,email,receive_pickup_created,receive_pickup_rescheduled,receive_pickup_cancelled,receive_pickup_completed) VALUES('Office','office@example.test',1,1,1,1);");
  return db;
}
const input = {
  customerId: 1, title: "Estate pickup", pickupDate: "2026-11-04", arrivalTime: "09:30", estimatedDurationMinutes: "60", status: "scheduled",
  contactName: "Alex", contactPhone: "5555550123", addressLine1: "123 Estate Lane", addressLine2: "", city: "Denton", state: "MD", postalCode: "21629",
  accessInstructions: "", estateDescription: "", estimatedLoadSize: "Box truck", estimatedSmallsPercent: "40", estimatedLargePercent: "50", estimatedOutdoorPercent: "10", internalNotes: "", assignedUserIds: [],
};
const jobs = db => db.sql.prepare("SELECT * FROM notification_jobs WHERE notification_type LIKE 'pickup_%' ORDER BY id").all();
const environment = { APP_BASE_URL: "https://consign.bidtrice.com", RESEND_API_KEY: "test-secret", RESEND_FROM_EMAIL: "test@example.test" };

test("create queues exactly one configured internal email and worker uses editable templates", async t => {
  const db = database(t);
  const id = await pickup.savePickup(db, input, 2);
  assert.equal(jobs(db).length, 1);
  assert.equal(jobs(db)[0].notification_type, "pickup_created");
  assert.equal(jobs(db)[0].recipient, "office@example.test");
  assert.equal(jobs(db)[0].user_id, null);
  const sent = [];
  t.mock.method(globalThis, "fetch", async (_url, options) => { const message = JSON.parse(options.body); if (message.to === "office@example.test") sent.push(message); return Response.json({ id: "message-1" }); });
  await notifications.processDueNotificationJobs(db, environment);
  await notifications.processDueNotificationJobs(db, environment);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].subject, "New Consignment Pickup Scheduled – Alex Customer");
  for (const text of ["C123", "Estate pickup", "November 4, 2026", "9:30 AM", "123 Estate Lane", "5555550123", "Box truck", "40%", "50%", "10%", `/admin/pickups/${id}`]) assert.ok(sent[0].text.includes(text), text);
  assert.equal(jobs(db)[0].status, "sent");
  assert.equal((await notifications.saveNotificationTemplate(db, { notificationType: "pickup_rescheduled", channel: "email", subject: "Custom {{customerName}}", body: "{{previousPickupDate}} to {{pickupDate}}: {{pickupUrl}}" })).ok, true);
  await pickup.savePickup(db, { ...input, pickupDate: "2026-11-05" }, 2, id);
  await notifications.processDueNotificationJobs(db, environment);
  assert.equal(sent.at(-1).subject, "Custom Alex Customer");
  assert.match(sent.at(-1).text, /November 4, 2026 to November 5, 2026/);
});

test("date and time changes each queue once, unrelated edits and repeated saves do not", async t => {
  const db = database(t), id = await pickup.savePickup(db, input, 2);
  let updated = { ...input, pickupDate: "2026-11-05", arrivalTime: "14:00" };
  await pickup.savePickup(db, updated, 2, id);
  await pickup.savePickup(db, updated, 2, id);
  await pickup.savePickup(db, { ...updated, internalNotes: "Corrected note", title: "Corrected title" }, 2, id);
  assert.deepEqual(jobs(db).map(job => job.notification_type), ["pickup_created", "pickup_rescheduled"]);
  const payload = JSON.parse(jobs(db)[1].payload_json);
  assert.equal(payload.previous.pickupDate, input.pickupDate);
  assert.equal(payload.previous.arrivalTime, input.arrivalTime);
  await pickup.savePickup(db, { ...updated, arrivalTime: "" }, 2, id);
  await pickup.savePickup(db, { ...updated, arrivalTime: "" }, 2, id);
  assert.equal(jobs(db).filter(job => job.notification_type === "pickup_rescheduled").length, 2);
  // A later return to the original schedule is a new event, even within one second.
  await pickup.savePickup(db, input, 2, id);
  assert.equal(jobs(db).filter(job => job.notification_type === "pickup_rescheduled").length, 3);
});

for (const status of ["cancelled", "completed"]) test(`${status} transition sends exactly once and preserves event details`, async t => {
  const db = database(t), id = await pickup.savePickup(db, input, 2);
  await pickup.savePickup(db, { ...input, status }, 2, id);
  await pickup.savePickup(db, { ...input, status, internalNotes: "Another edit" }, 2, id);
  const matching = jobs(db).filter(job => job.notification_type === `pickup_${status}`);
  assert.equal(matching.length, 1);
  const payload = JSON.parse(matching[0].payload_json);
  assert.equal(payload.actorName, "Pat Admin");
  assert.ok(payload.occurredAt);
  const context = internal.pickupTemplateContext(payload, environment.APP_BASE_URL);
  assert.match(context.completedAt, /E[DS]T/);
  assert.match(context.pickupUrl, /\/admin\/pickups\/1$/);
});

test("active recipients and per-event subscriptions are persisted and respected", async t => {
  const db = database(t);
  await recipients.saveInternalAppointmentRecipient(db, { label: "Warehouse", email: "warehouse@example.test", active: 1, receiveCreated: 0, receiveUpdated: 0, receiveCancelled: 0, receiveRegistration: 0, receivePickupCreated: 0, receivePickupRescheduled: 1, receivePickupCancelled: 0, receivePickupCompleted: 1 });
  const configured = await recipients.listInternalAppointmentRecipients(db);
  assert.equal(configured.find(row => row.label === "Warehouse").receivePickupRescheduled, 1);
  db.sql.exec("UPDATE appointment_notification_recipients SET active=0 WHERE label='Office'");
  const id = await pickup.savePickup(db, input, 2);
  assert.equal(jobs(db).length, 0);
  await pickup.savePickup(db, { ...input, arrivalTime: "10:00" }, 2, id);
  assert.deepEqual(jobs(db).map(job => job.recipient), ["warehouse@example.test"]);
  assert.equal((await recipients.deleteInternalAppointmentRecipient(db, configured.find(row => row.label === "Warehouse").id)).ok, false);
});

for (const setting of ["notifications.pickup_created_enabled", "notifications.email_enabled"]) test(`${setting}=0 suppresses queueing`, async t => {
  const db = database(t);
  db.sql.prepare("UPDATE settings SET value='0' WHERE key=?").run(setting);
  await pickup.savePickup(db, input, 2);
  assert.equal(jobs(db).length, 0);
});

test("disabled type also suppresses a previously queued email", async t => {
  const db = database(t);
  await pickup.savePickup(db, input, 2);
  db.sql.exec("UPDATE settings SET value='0' WHERE key='notifications.pickup_created_enabled'");
  t.mock.method(globalThis, "fetch", () => { assert.fail("Email must not be sent"); });
  await notifications.processDueNotificationJobs(db, environment);
  assert.equal(jobs(db)[0].status, "cancelled");
});

test("queue failure never rolls back creation or later pickup changes and logs no secrets", async t => {
  const db = database(t), original = db.prepare;
  const errors = [];
  t.mock.method(console, "error", (...args) => errors.push(args));
  db.prepare = query => {
    if (query.includes("FROM settings")) throw new Error("Bearer test-secret");
    return original(query);
  };
  const id = await pickup.savePickup(db, input, 2);
  await pickup.savePickup(db, { ...input, status: "cancelled" }, 2, id);
  assert.equal(db.sql.prepare("SELECT status FROM consignment_pickups WHERE id=?").get(id).status, "cancelled");
  assert.equal(errors.length, 4);
  assert.doesNotMatch(JSON.stringify(errors), /test-secret/);
});

test("provider failure cannot roll back completed pickup and uses existing retry status safely", async t => {
  const db = database(t), id = await pickup.savePickup(db, input, 2);
  await pickup.savePickup(db, { ...input, status: "completed" }, 2, id);
  const errors = [];
  t.mock.method(console, "error", (...args) => errors.push(args));
  t.mock.method(globalThis, "fetch", async () => Response.json({ message: "Bearer test-secret" }, { status: 500 }));
  await notifications.processDueNotificationJobs(db, environment);
  assert.equal(db.sql.prepare("SELECT status FROM consignment_pickups WHERE id=?").get(id).status, "completed");
  assert.equal(jobs(db)[1].status, "pending");
  assert.equal(jobs(db)[1].attempts, 1);
  assert.doesNotMatch(JSON.stringify(errors) + jobs(db)[1].last_error, /test-secret/);
});


test("competing pickup writes cannot queue duplicate transition notifications", async t => {
  const db = database(t), id = await pickup.savePickup(db, input, 2);
  const results = await Promise.allSettled([
    pickup.savePickup(db, { ...input, status: "completed" }, 2, id),
    pickup.savePickup(db, { ...input, status: "completed" }, 2, id),
  ]);
  assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
  assert.equal(results.find(result => result.status === "rejected").reason.status, 409);
  assert.equal(jobs(db).filter(job => job.notification_type === "pickup_completed").length, 1);
});

test("idempotency key prevents duplicate queue calls for the same pickup revision", async t => {
  const db = database(t), id = await pickup.savePickup(db, input, 2);
  await internal.safelyQueuePickupNotifications(db, id, input, null, 2);
  assert.equal(jobs(db).length, 1);
});

test("pickup template variables validate, dates keep their local day, and SMS is rejected", async t => {
  const db = database(t);
  assert.equal(notifications.validateNotificationTemplate("{{customerName}} {{pickupUrl}} {{completedAt}}"), null);
  const payload = { pickupId: 1, current: { ...input, pickupDate: "2026-03-08", arrivalTime: "00:30" }, previous: null, customerName: "Alex", consignorNumber: null, actorName: "Pat", occurredAt: "2026-03-08T07:30:00Z" };
  const context = internal.pickupTemplateContext(payload, environment.APP_BASE_URL);
  assert.equal(context.pickupDate, "March 8, 2026");
  assert.match(context.pickupTime, /12:30 AM/);
  assert.match(context.completedAt, /EDT/);
  assert.equal((await notifications.saveNotificationTemplate(db, { notificationType: "pickup_created", channel: "sms", body: "{{customerName}}" })).ok, false);
});

test("notification settings actions reject unauthorized users before any database access", async () => {
  const authSource = await readFile(new URL("../app/services/auth.server.ts", import.meta.url), "utf8");
  const guards = authSource.slice(authSource.indexOf("export async function requireAnyRole"), authSource.indexOf("export function hasPermission")).replaceAll("export ", "");
  const guardSource = transpileModule(guards, { compilerOptions: { target: ScriptTarget.ES2022 } }).outputText;
  for (const filename of ["admin.notifications.tsx", "admin.notification-recipients.tsx"]) {
    const source = await readFile(new URL(`../app/routes/${filename}`, import.meta.url), "utf8");
    // Execute actual route actions and role guards, stubbing only session lookup.
    const start = source.indexOf("export async function action(");
    const end = source.indexOf("\n}", start) + 2;
    const actionSource = transpileModule(source.slice(start, end).replace("export ", ""), { compilerOptions: { target: ScriptTarget.ES2022 } }).outputText;
    for (const role of ["consignor", "employee", "manager", "bidder"]) {
      let checked = false;
      const requireUser = async () => { checked = true; return { roles: [role] }; };
      const requireRole = new Function("requireUser", "hasAnyRole", `${guardSource}; return requireRole;`)(requireUser, roles.hasAnyRole);
      const action = new Function("requireRole", "env", "runtime", `${actionSource}; return action;`)(requireRole, { trice_auction_db: new Proxy({}, { get() { assert.fail(`${role} accessed database`); } }) }, {});
      await assert.rejects(action({ request: new Request("https://example.test/admin/notifications", { method: "POST", body: "intent=save-pickup-recipient&id=1" }) }), error => error.status === 403);
      assert.ok(checked);
    }
  }
});
