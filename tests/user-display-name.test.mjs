import assert from "node:assert/strict";
import test from "node:test";
import { displayUserName } from "../app/lib/user-display-name.js";

test("existing legacy user still displays correctly", () => {
  assert.equal(displayUserName({ firstName: null, lastName: null, legacyName: "Legacy Customer", email: "legacy@example.com" }), "Legacy Customer");
});
