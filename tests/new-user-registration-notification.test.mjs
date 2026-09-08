import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const registrationRoute = await readFile(new URL("../app/routes/register.tsx", import.meta.url), "utf8");
const recipients = await readFile(new URL("../app/services/internal-appointment-notifications.server.ts", import.meta.url), "utf8");
const delivery = await readFile(new URL("../app/services/notification.server.ts", import.meta.url), "utf8");
const recipientRoute = await readFile(new URL("../app/routes/admin.notification-recipients.tsx", import.meta.url), "utf8");

test("a successful, linked registration queues one idempotent internal notification", () => {
  assert.match(registrationRoute, /const userId = await syncApplicationUser/);
  assert.match(registrationRoute, /await queueInternalUserRegistration\(env\.trice_auction_db, userId\)/);
  assert.ok(registrationRoute.indexOf("syncApplicationUser") < registrationRoute.indexOf("queueInternalUserRegistration"));
  assert.match(recipients, /internal_registration:\$\{user\.id\}:\$\{recipient\.email\}/);
  assert.match(recipients, /ON CONFLICT\(idempotency_key\) DO NOTHING/);
});

test("failed validation, Turnstile, or Better Auth registration cannot queue a notification", () => {
  const queueIndex = registrationRoute.indexOf("await queueInternalUserRegistration");
  assert.ok(registrationRoute.indexOf("if (validationErrors.length) return") < queueIndex);
  assert.ok(registrationRoute.indexOf("if (!protection.ok) return") < queueIndex);
  assert.ok(registrationRoute.indexOf("if (!response.ok) return") < queueIndex);
});

test("registration delivery is recipient-configurable and failure-safe", () => {
  assert.match(recipients, /WHERE active=1 AND receive_registration=1/);
  assert.match(recipientRoute, /name="receiveRegistration"/);
  assert.match(registrationRoute, /try \{[\s\S]*processDueNotificationJobs[\s\S]*\} catch/);
  assert.match(registrationRoute, /APP_BASE_URL: runtime\.APP_BASE_URL \|\| new URL\(request\.url\)\.origin/);
  assert.match(delivery, /job\.notification_type === "internal_registration"/);
});

test("the internal email has the required user details, Eastern time, and admin link", () => {
  assert.match(delivery, /subject: "New User Registration"/);
  assert.match(delivery, /timeZone: "America\/New_York"/);
  assert.match(delivery, /First name:/);
  assert.match(delivery, /Last name:/);
  assert.match(delivery, /Email address:/);
  assert.match(delivery, /Phone number:/);
  assert.match(delivery, /\/admin\/users\/\$\{user\.id\}\/edit/);
});
