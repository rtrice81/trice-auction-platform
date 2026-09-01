import assert from "node:assert/strict";
import test from "node:test";
import { ADMIN_USER_EDIT_INTENT, getAdminUserEditOperation } from "../app/lib/admin-user-edit-intents.js";

test("Save role change routes only to save", () => {
  assert.equal(getAdminUserEditOperation(ADMIN_USER_EDIT_INTENT.save), "save");
});

test("Save profile/settings change routes only to save", () => {
  assert.equal(getAdminUserEditOperation("save_user"), "save");
});

test("Deactivate action routes only to deactivate", () => {
  assert.equal(getAdminUserEditOperation(ADMIN_USER_EDIT_INTENT.deactivate), "deactivate");
});

test("Activate action routes only to activate", () => {
  assert.equal(getAdminUserEditOperation(ADMIN_USER_EDIT_INTENT.activate), "activate");
});

test("Save does not trigger deactivate", () => {
  assert.notEqual(getAdminUserEditOperation(ADMIN_USER_EDIT_INTENT.save), "deactivate");
});
