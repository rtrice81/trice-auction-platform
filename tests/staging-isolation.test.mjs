import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { execFileSync, spawnSync } from "node:child_process";
import test from "node:test";
import { ModuleKind, ScriptTarget, transpileModule } from "typescript";
import { readConfig, validateStagingConfig, productionDatabaseId } from "../scripts/staging-config.mjs";
import { stagingSeedSql, validateSeedArguments, validateSeedPassword, seedErrorMessage } from "../scripts/seed-staging.mjs";

async function moduleUrl(url) {
  let code = transpileModule(await readFile(url, "utf8"), { compilerOptions: { module: ModuleKind.ESNext, target: ScriptTarget.ES2022 } }).outputText;
  for (const match of [...code.matchAll(/from "(\.[^"]+)"/g)]) {
    const dependency = new URL(`${match[1]}.ts`, url);
    code = code.replace(match[0], `from "${await moduleUrl(dependency)}"`);
  }
  return `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`;
}
const load = async file => import(await moduleUrl(new URL(`../app/${file}.ts`, import.meta.url)));
const policy = await load("lib/environment-policy");
const { verifyTurnstile } = await load("services/public-form-protection.server");
const { createResendEmailProvider } = await load("services/email-provider.server");
const { createTelnyxSmsProvider } = await load("services/sms-provider.server");
const staging = readConfig().env.staging.vars;

test("seed password failures explain the remedy without exposing input", () => {
  for (const [password, expected] of [[undefined, /No staging password/], ["sensitive-short", /at least 16 characters/]]) {
    let error;
    try { validateSeedPassword(password); } catch (caught) { error = caught; }
    assert.ok(error);
    assert.match(seedErrorMessage(error), expected);
    if (password) assert.ok(!seedErrorMessage(error).includes(password));
  }
  assert.ok(!seedErrorMessage(new Error("sensitive-dependency-error")).includes("sensitive-dependency-error"));
  const env = { ...process.env };
  delete env.STAGING_SEED_PASSWORD;
  for (const password of [undefined, "sensitive-short"]) {
    const result = spawnSync(process.execPath, ["scripts/seed-staging.mjs", "--env", "staging", "--remote"], {
      cwd: new URL("../", import.meta.url), env: password === undefined ? env : { ...env, STAGING_SEED_PASSWORD: password }, encoding: "utf8",
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, password === undefined ? /No staging password/ : /at least 16 characters/);
    assert.doesNotMatch(result.stdout, /Seeding|wrangler/i);
    if (password) assert.ok(!result.stderr.includes(password));
  }
});

test("staging config and seed refuse production resources and target overrides", () => {
  validateStagingConfig(readConfig());
  for (const mutate of [
    c => c.env.staging.d1_databases[0].database_id = productionDatabaseId,
    c => c.env.staging.d1_databases[0].database_name = "trice-auction-db",
    c => c.env.staging.r2_buckets = c.r2_buckets,
    c => c.env.staging.vars.BETTER_AUTH_URL = "https://consign.bidtrice.com",
    c => c.env.staging.vars.NOTIFICATION_MODE = "live",
  ]) { const config = readConfig(); mutate(config); assert.throws(() => validateStagingConfig(config)); }
  validateSeedArguments(["--env", "staging", "--remote"]);
  for (const args of [[], ["--env", "production", "--remote"], ["--env", "staging", "--remote", "--config", "production.json"]]) assert.throws(() => validateSeedArguments(args));
});

test("staging accepts only staging origin/config and has isolated secure host-only auth cookies", () => {
  policy.assertStagingConfiguration(staging, new Request(policy.STAGING_ORIGIN));
  assert.throws(() => policy.assertStagingConfiguration(staging, new Request("https://consign.bidtrice.com")));
  assert.throws(() => policy.assertStagingConfiguration({ ...staging, NOTIFICATION_MODE: "live" }));
  const auth = policy.stagingAuthOptions(staging);
  assert.deepEqual(auth.trustedOrigins, [policy.STAGING_ORIGIN]);
  assert.equal(auth.advanced.cookiePrefix, "trice-staging");
  assert.equal(auth.advanced.useSecureCookies, true);
  assert.equal(auth.advanced.crossSubDomainCookies.enabled, false);
  assert.equal(policy.stagingAuthOptions({ APP_ENV: "production" }), undefined);
});

test("email and SMS cannot leave staging even with live credentials or a misconfigured mode", async t => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => { calls++; return Response.json({ id: "live", data: { id: "live" } }); });
  for (const create of [createResendEmailProvider, createTelnyxSmsProvider]) {
    for (const mode of [undefined, "live", "log"]) {
      const result = await create({ apiKey: "would-be-live-key", from: "sender", environment: { APP_ENV: "staging", NOTIFICATION_MODE: mode } }).send({ to: "real-recipient", subject: "Test", text: "Test" });
      assert.match(result.providerMessageId, /^suppressed:/);
    }
    assert.equal(calls, create === createResendEmailProvider ? 0 : 1);
    await create({ apiKey: "test", from: "sender", environment: { APP_ENV: "production" } }).send({ to: "recipient", subject: "Test", text: "Test" });
  }
  assert.equal(calls, 2);
});

test("official Turnstile test keys require explicit staging config and never validate production", async t => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => { calls++; return Response.json({ success: true }); });
  const key = "1x0000000000000000000000000000000AA"; // Cloudflare public dummy key, not a private secret.
  const env = { ...staging, TURNSTILE_SECRET_KEY: key };
  assert.equal(await verifyTurnstile("dummy", new Request(policy.STAGING_ORIGIN), env), true);
  assert.equal(calls, 1);
  for (const [url, runtime] of [
    ["https://consign.bidtrice.com", env],
    [policy.STAGING_ORIGIN, { ...env, APP_ENV: "production" }],
    [policy.STAGING_ORIGIN, { ...env, TURNSTILE_MODE: undefined }],
    ["https://consign.bidtrice.com", { TURNSTILE_SECRET_KEY: key }],
  ]) assert.equal(await verifyTurnstile("dummy", new Request(url, { headers: { "x-staging": "true", cookie: "staging=true" } }), runtime), false);
  assert.equal(calls, 1);
  assert.equal(await verifyTurnstile("real", new Request("https://consign.bidtrice.com"), { APP_ENV: "production", TURNSTILE_SECRET_KEY: "real-key" }), true);
  assert.equal(calls, 2);
});

test("all current migrations and staging seed execute against fresh SQLite and seed is repeatable", () => {
  const sql = stagingSeedSql("synthetic-test-hash");
  const result = execFileSync("python3", ["-c", `
import sqlite3, pathlib, sys
db = sqlite3.connect(':memory:')
db.execute('PRAGMA foreign_keys=ON')
for migration in sorted(pathlib.Path('migrations').glob('*.sql')):
    db.executescript(migration.read_text())
sql = sys.stdin.read()
db.executescript(sql)
db.executescript(sql)
assert db.execute('SELECT count(*) FROM users').fetchone()[0] == 100
assert db.execute('SELECT count(*) FROM account').fetchone()[0] == 100
assert db.execute('SELECT count(*) FROM user_roles').fetchone()[0] == 100
assert db.execute('SELECT count(*) FROM booking_events').fetchone()[0] == 1
assert db.execute('SELECT count(*) FROM booking_event_dropoff_dates').fetchone()[0] == 5
assert db.execute('SELECT count(*) FROM dropoff_day_area_overrides').fetchone()[0] == 15
assert not db.execute('PRAGMA foreign_key_check').fetchall()
print('migrations and seed verified')
`], { input: sql, encoding: "utf8", cwd: new URL("../", import.meta.url) });
  assert.match(result, /verified/);
});
