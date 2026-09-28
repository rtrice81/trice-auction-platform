import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const auth = await readFile(new URL("../app/services/auth.server.ts", import.meta.url), "utf8");

test("Better Auth accepts browser requests from the public custom domain", () => {
  assert.match(auth, /PUBLIC_AUTH_ORIGINS/);
  assert.match(auth, /https:\/\/bidtrice\.com/);
  assert.match(auth, /https:\/\/www\.bidtrice\.com/);
  assert.match(auth, /https:\/\/consign\.bidtrice\.com/);
  assert.match(auth, /trustedOrigins: PUBLIC_AUTH_ORIGINS/);
});
