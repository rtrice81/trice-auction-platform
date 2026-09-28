import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const edit = await readFile(new URL("../app/routes/admin.users.edit.tsx", import.meta.url), "utf8");
const service = await readFile(new URL("../app/services/user-password-reset.server.ts", import.meta.url), "utf8");
const migration = await readFile(new URL("../migrations/0036_add_user_password_reset_audit.sql", import.meta.url), "utf8");

test("admin password reset is a dedicated, server-authorized action", () => {
  assert.match(edit, /requireRole\(request, env\.trice_auction_db, runtime, "admin"\)/);
  assert.match(edit, /operation === "reset-password"/);
  assert.match(edit, /resetManagedUserPassword/);
  assert.match(edit, /ADMIN_USER_EDIT_INTENT\.resetPassword/);
});

test("password reset validates confirmation and the established password policy", () => {
  assert.match(service, /newPassword !== input\.confirmNewPassword/);
  assert.match(service, /REGISTRATION_PASSWORD_MIN_LENGTH/);
  assert.match(edit, /minLength=\{REGISTRATION_PASSWORD_MIN_LENGTH\}/);
});

test("password reset updates only the linked credential account, revokes target sessions, and audits no credentials", () => {
  assert.match(service, /authContext\.password\.hash/);
  assert.match(service, /internalAdapter\.findCredentialAccount/);
  assert.match(service, /internalAdapter\.updatePassword/);
  assert.match(service, /authContext\.password\.verify/);
  assert.match(service, /internalAdapter\.deleteUserSessions/);
  assert.match(service, /INSERT INTO user_password_reset_audits/);
  assert.doesNotMatch(migration, /\b(?:new|old)_?password\b|password_hash|auth_token/i);
  assert.doesNotMatch(service, /console\.(log|info|error)/);
});
