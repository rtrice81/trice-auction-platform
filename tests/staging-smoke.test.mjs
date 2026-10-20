import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { assertAccessible, CUSTOMERS, parseWranglerOutput, smokeFixtureSql, stagingUrl, STAGING_ORIGIN, StagingClient, validateSmokeArguments, verifyRunBookings } from "../scripts/smoke-staging.mjs";

test("Wrangler JSON parser accepts import progress without exposing raw diagnostics", () => {
  const results = [{ results: [{ "Total queries executed": 20 }], success: true }];
  const json = JSON.stringify(results, null, 2);
  assert.deepEqual(parseWranglerOutput(json), results);
  assert.deepEqual(parseWranglerOutput(`├ Checking if file needs uploading\n│\n├ 🌀 Uploading staging.sql\n│ 🌀 Uploading complete.\n│\n${json}\n`), results);
  assert.deepEqual(parseWranglerOutput(`\u001b[32mUpload complete\u001b[0m\n${json}`), results);
  assert.throws(() => parseWranglerOutput("sensitive raw diagnostic"), error => !error.message.includes("sensitive raw diagnostic"));
});

test("smoke runner accepts only the fixed remote staging target", () => {
  validateSmokeArguments(["--env", "staging", "--remote"]);
  validateSmokeArguments(["--env", "staging", "--remote", "--preflight"]);
  for (const args of [[], ["--env", "production", "--remote"], ["--env", "staging", "--local"], ["--env", "staging", "--remote", "https://consign.bidtrice.com"]]) assert.throws(() => validateSmokeArguments(args));
  assert.equal(stagingUrl("/login").origin, STAGING_ORIGIN);
  for (const path of ["https://consign.bidtrice.com/login", "//consign.bidtrice.com/login", "http://staging-consign.bidtrice.com", "https://user:pass@staging-consign.bidtrice.com"]) assert.throws(() => stagingUrl(path));
});

test("edge challenges stop the runner with actionable diagnostics", () => {
  assert.throws(() => assertAccessible(new Response("challenge", { status: 403, headers: { "cf-mitigated": "challenge", "cf-ray": "test-ray" } })), /Cloudflare challenged.*test-ray/);
  assert.throws(() => assertAccessible(new Response("access", { status: 302 })), /expected HTTP 200/);
  assertAccessible(new Response("ok"));
});

test("HTTP client isolates customer cookies and refuses production redirects", async () => {
  const calls = [];
  const fetcher = async (url, options) => {
    calls.push({ url, options });
    const headers = new Headers();
    headers.append("set-cookie", "__Secure-trice-staging.session_token=synthetic-cookie; Secure; HttpOnly; Path=/");
    headers.append("set-cookie", "trice_booking_attempt=synthetic-attempt; Path=/");
    return new Response("ok", { headers });
  };
  const first = new StagingClient(fetcher);
  const second = new StagingClient(fetcher);
  await first.request("/login");
  assert.equal(first.cookies.size, 2);
  assert.equal(second.cookies.size, 0);
  await first.request("/my-appointments");
  assert.match(calls[1].options.headers.get("cookie"), /synthetic-cookie/);
  assert.equal(calls[1].options.redirect, "manual");
  assert.equal(calls[1].options.headers.get("origin"), STAGING_ORIGIN);
  assert.ok(!JSON.stringify(first.timings).includes("synthetic-cookie"));
  const redirecting = new StagingClient(async () => new Response(null, { status: 302, headers: { location: "https://consign.bidtrice.com" } }));
  await assert.rejects(() => redirecting.request("/login"), /outside the staging origin/);
});

test("booking verifier catches duplicates, unconverted holds, and capacity mistakes", () => {
  const rows = Array.from({ length: CUSTOMERS }, (_, index) => ({ id: index + 1, userId: index + 1, holdId: `hold-${index}`, holdStatus: "converted", status: "scheduled", percent: 100, points: 10 }));
  verifyRunBookings(rows, 10);
  assert.throws(() => verifyRunBookings([...rows, rows[0]], 10), /exactly 5/);
  for (const modification of [{ userId: 2 }, { holdId: "hold-1" }, { holdStatus: "active" }, { percent: 99 }, { points: 20 }]) {
    assert.throws(() => verifyRunBookings([{ ...rows[0], ...modification }, ...rows.slice(1)], 10));
  }
});

test("smoke fixtures create only five new synthetic consignors with credential issuers", async () => {
  const db = new DatabaseSync(":memory:");
  try {
    for (const file of (await readdir(new URL("../migrations/", import.meta.url))).filter(file => file.endsWith(".sql")).sort()) db.exec(await readFile(new URL(`../migrations/${file}`, import.meta.url), "utf8"));
    const run = "staging-smoke-1234567890123-abcdef12";
    db.exec(smokeFixtureSql(run, "synthetic-hash"));
    assert.equal(db.prepare("SELECT COUNT(*) AS total FROM users").get().total, 5);
    assert.equal(db.prepare("SELECT COUNT(*) AS total FROM account WHERE issuer='local:credential'").get().total, 5);
    assert.equal(db.prepare("SELECT COUNT(*) AS total FROM user_roles WHERE role='consignor'").get().total, 5);
    assert.equal(db.prepare("SELECT COUNT(*) AS total FROM users WHERE email LIKE '%@example.invalid' AND first_name='[STAGING SMOKE]'").get().total, 5);
    assert.throws(() => smokeFixtureSql("production", "synthetic-hash"));
  } finally { db.close(); }
});
