import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { assertAccessible, CUSTOMERS, LOGIN_INTERVAL_MS, parseWranglerOutput, smokeFixtureSql, smokeUserIds, stagingUrl, STAGING_ORIGIN, StagingClient, validateSmokeArguments, verifyRunBookings } from "../scripts/smoke-staging.mjs";

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
  assert.deepEqual(validateSmokeArguments(["--env", "staging", "--remote", "--customers", "20"]), { customers: 20, preflight: false });
  assert.deepEqual(validateSmokeArguments(["--env", "staging", "--remote", "--preflight", "--customers", "20"]), { customers: 20, preflight: true });
  for (const extra of [["--customers", "100"], ["--customers", "-1"], ["--customers", "20", "--customers", "5"], ["--preflight", "--preflight"]]) assert.throws(() => validateSmokeArguments(["--env", "staging", "--remote", ...extra]));
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

test("Worker resource errors retain diagnostic codes without storing response content", async () => {
  const client = new StagingClient(async () => new Response("<h1>Error <span>1102</span></h1>Worker exceeded resource limits. private-response-content", {
    status: 503, headers: { "cf-ray": "resource-ray" },
  }));
  assert.equal((await client.request("/login")).status, 503);
  assert.equal(client.timings[0].edgeErrorCode, "1102");
  assert.equal(client.timings[0].workerResourceLimit, true);
  assert.equal(client.timings[0].ray, "resource-ray");
  assert.ok(!JSON.stringify(client.timings).includes("private-response-content"));
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

test("twenty-customer fixtures and verification include multi-digit customer IDs", async () => {
  const db = new DatabaseSync(":memory:");
  try {
    for (const file of (await readdir(new URL("../migrations/", import.meta.url))).filter(file => file.endsWith(".sql")).sort()) db.exec(await readFile(new URL(`../migrations/${file}`, import.meta.url), "utf8"));
    const run = "staging-smoke-1234567890123-abcdef12";
    db.exec(smokeFixtureSql(run, "synthetic-hash", 20));
    const ids = smokeUserIds(run, 20);
    const rows = db.prepare(`SELECT id FROM "user" WHERE id IN (${ids.map(() => "?").join(",")})`).all(...ids);
    assert.equal(rows.length, 20);
    assert.ok(rows.some(row => row.id === `${run}-10`));
    assert.ok(rows.some(row => row.id === `${run}-20`));
    assert.equal(db.prepare("SELECT COUNT(*) AS total FROM account WHERE issuer='local:credential'").get().total, 20);
    const bookings = ids.map((id, index) => ({ userId: index + 1, holdId: id, holdStatus: "converted", status: "scheduled", percent: 100, points: 10 }));
    verifyRunBookings(bookings, 10, 20);
    assert.throws(() => verifyRunBookings(bookings.slice(0, 19), 10, 20), /exactly 20/);
    assert.throws(() => smokeFixtureSql(run, "synthetic-hash", 100));
    // In any ten-second window, this cadence starts at most three logins.
    assert.ok(3 * LOGIN_INTERVAL_MS > 10_000);
  } finally { db.close(); }
});
