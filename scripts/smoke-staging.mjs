import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { performance } from "node:perf_hooks";
import { stripVTControlCharacters } from "node:util";
import { setTimeout as delay } from "node:timers/promises";
import { hashPassword } from "better-auth/crypto";
import { projectRoot, readConfig, validateStagingConfig } from "./staging-config.mjs";

export const STAGING_ORIGIN = "https://staging-consign.bidtrice.com";
export const CUSTOMERS = 5;
export const SUPPORTED_CUSTOMER_COUNTS = Object.freeze([5, 20, 100]);
export const LOGIN_INTERVAL_MS = 4_000;
const quote = value => `'${String(value).replaceAll("'", "''")}'`;
class SmokeError extends Error {}
const requireCheck = (condition, message) => { if (!condition) throw new SmokeError(message); };

export function stagingUrl(path) {
  const url = new URL(path, STAGING_ORIGIN);
  requireCheck(url.origin === STAGING_ORIGIN && !url.username && !url.password, "Refusing an HTTP target outside the staging origin.");
  return url;
}

export function validateSmokeArguments(args) {
  requireCheck(args[0] === "--env" && args[1] === "staging" && args[2] === "--remote", "Only the remote staging environment is supported.");
  let customers = CUSTOMERS;
  let preflight = false;
  let countSpecified = false;
  for (let index = 3; index < args.length; index++) {
    if (args[index] === "--preflight" && !preflight) preflight = true;
    else if (args[index] === "--customers" && !countSpecified && SUPPORTED_CUSTOMER_COUNTS.map(String).includes(args[index + 1])) {
      customers = Number(args[++index]);
      countSpecified = true;
    } else throw new SmokeError("Use --env staging --remote [--customers 5|20|100] [--preflight]; target overrides and other load sizes are forbidden.");
  }
  return { customers, preflight };
}

export function smokeUserIds(runId, customers = CUSTOMERS) {
  requireCheck(/^staging-smoke-\d+-[a-f0-9]{8}$/.test(runId), "Invalid synthetic run identifier.");
  requireCheck(SUPPORTED_CUSTOMER_COUNTS.includes(customers), "Only 5, 20 or 100 smoke-test customers are supported.");
  return Array.from({ length: customers }, (_, index) => `${runId}-${index + 1}`);
}

export function assertAccessible(response) {
  if (response.headers.get("cf-mitigated") === "challenge") {
    throw new SmokeError(`Cloudflare challenged the test runner before it reached the app (HTTP ${response.status}; Ray ${response.headers.get("cf-ray") ?? "unavailable"}). No new fixtures were created by preflight. Inspect Security Events and scope any exception to this runner IP and staging-consign.bidtrice.com.`);
  }
  requireCheck(response.status === 200, `Staging preflight expected HTTP 200, received ${response.status}. Check deployment or Cloudflare Access.`);
}

export class StagingClient {
  constructor(fetcher = fetch) { this.fetcher = fetcher; this.cookies = new Map(); this.timings = []; }
  cookieHeader() { return [...this.cookies].map(([name, value]) => `${name}=${value}`).join("; "); }
  async request(path, options = {}, savedCookie) {
    const url = stagingUrl(path);
    const headers = new Headers(options.headers);
    headers.set("origin", STAGING_ORIGIN);
    headers.set("user-agent", "Trice-Staging-Smoke/1.0");
    const cookie = savedCookie ?? this.cookieHeader();
    if (cookie) headers.set("cookie", cookie);
    const started = performance.now();
    let response;
    try {
      response = await this.fetcher(url, { ...options, headers, redirect: "manual", signal: AbortSignal.timeout(30_000) });
    } catch { throw new SmokeError(`HTTP request to staging ${url.pathname} failed or timed out.`); }
    const timing = { path: url.pathname, method: options.method ?? "GET", status: response.status, durationMs: Math.round(performance.now() - started), ray: response.headers.get("cf-ray") };
    this.timings.push(timing);
    if (response.status >= 500) {
      // Classify edge errors without retaining HTML, customer data or tokens.
      const text = (await response.clone().text()).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");
      timing.edgeErrorCode = text.match(/Error\s*(?:code:?\s*)?(1\d{3})\b/i)?.[1];
      timing.workerResourceLimit = /Worker exceeded resource limits/i.test(text);
      timing.workerException = /Worker threw exception/i.test(text);
    }
    for (const cookie of response.headers.getSetCookie()) {
      const pair = cookie.split(";", 1)[0];
      const separator = pair.indexOf("=");
      if (separator > 0) this.cookies.set(pair.slice(0, separator), pair.slice(separator + 1));
    }
    // Inspect Location without following it. Cookies and form bodies never go to
    // production, even if a deployed route mistakenly redirects there.
    const location = response.headers.get("location");
    if (location) stagingUrl(location);
    if (response.headers.get("cf-mitigated") === "challenge") assertAccessible(response);
    return response;
  }
}

export function parseWranglerOutput(output) {
  const clean = stripVTControlCharacters(output).trim();
  // Wrangler 4 prints file-upload progress on stdout even with --json. The
  // structured result follows that progress; ordinary --command output is JSON.
  for (const match of clean.matchAll(/^[ \t]*(?=[\[{])/gm)) {
    try { return JSON.parse(clean.slice(match.index)); }
    catch { /* Continue to a complete JSON document, never log raw output. */ }
  }
  throw new SmokeError("Wrangler did not return valid JSON for the staging D1 operation.");
}

function d1(sql, privateSql = false) {
  const directory = mkdtempSync(join(tmpdir(), "trice-staging-smoke-"));
  try {
    const file = join(directory, "query.sql");
    writeFileSync(file, sql, { mode: 0o600 });
    let output;
    try {
      output = execFileSync(process.execPath, [fileURLToPath(new URL("node_modules/wrangler/bin/wrangler.js", projectRoot)),
        "d1", "execute", "trice-auction-db-staging", "--env", "staging", "--remote", "--config", fileURLToPath(new URL("wrangler.jsonc", projectRoot)), ...(privateSql ? ["--file", file] : ["--command", sql]), "--json", "--yes"],
      { cwd: projectRoot, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 8 * 1024 * 1024 });
    } catch { throw new SmokeError("Staging D1 query/import failed. Check Wrangler login, migrations, and D1 permissions. Raw SQL diagnostics are withheld to protect generated credential hashes."); }
    let results = parseWranglerOutput(output);
    if (!Array.isArray(results)) results = [results];
    requireCheck(results.length > 0 && results.every(result => result.success), "A staging D1 statement failed.");
    return results.flatMap(result => result.results ?? []);
  } finally { rmSync(directory, { recursive: true, force: true }); }
}

export function smokeFixtureSql(runId, passwordHash, customers = CUSTOMERS) {
  const statements = [];
  for (const [index, id] of smokeUserIds(runId, customers).entries()) {
    const i = index + 1;
    const email = `${id}@example.invalid`;
    statements.push(`INSERT INTO "user"(id,name,email,emailVerified,createdAt,updatedAt) VALUES(${quote(id)},'[STAGING SMOKE] Customer ${i}',${quote(email)},1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);`);
    statements.push(`INSERT INTO account(id,accountId,providerId,issuer,userId,password,createdAt,updatedAt) VALUES(${quote(id)},${quote(id)},'credential','local:credential',${quote(id)},${quote(passwordHash)},CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);`);
    statements.push(`INSERT INTO users(email,first_name,last_name,role,auth_user_id,active) VALUES(${quote(email)},'[STAGING SMOKE]','Customer ${i}','customer',${quote(id)},1);`);
    statements.push(`INSERT INTO user_roles(user_id,role) SELECT id,'consignor' FROM users WHERE auth_user_id=${quote(id)};`);
  }
  return statements.join("\n");
}

function capacitySnapshot(date, areaId) {
  return d1(`SELECT
    COALESCE((SELECT SUM(t.capacity_points) FROM appointments a JOIN dropoff_types t ON t.id=a.dropoff_type_id WHERE a.appointment_date=${quote(date)} AND a.status IN ('scheduled','checked_in','completed')),0) AS bookedDaily,
    COALESCE((SELECT SUM(reserved_daily_intake_points) FROM booking_holds h JOIN dropoff_days d ON d.id=h.dropoff_day_id WHERE d.dropoff_date=${quote(date)} AND h.status='active' AND h.expires_at>CURRENT_TIMESTAMP AND h.appointment_status='scheduled'),0) AS heldDaily,
    COALESCE((SELECT SUM(x.capacity_points) FROM appointment_area_allocations x JOIN appointments a ON a.id=x.appointment_id WHERE a.appointment_date=${quote(date)} AND a.status IN ('scheduled','checked_in','completed') AND x.item_area_id=${Number(areaId)}),0) AS bookedArea,
    COALESCE((SELECT SUM(reserved_smalls_points) FROM booking_holds h JOIN dropoff_days d ON d.id=h.dropoff_day_id WHERE d.dropoff_date=${quote(date)} AND h.status='active' AND h.expires_at>CURRENT_TIMESTAMP AND h.appointment_status='scheduled'),0) AS heldArea;`)[0];
}

export function selectSmokeDate(days, requiredPoints, snapshotForDate) {
  requireCheck(Number.isFinite(requiredPoints) && requiredPoints > 0, "Invalid capacity requirement.");
  for (const day of days) {
    const before = snapshotForDate(day.date);
    if (Number.isFinite(day.dailyCapacity) && Number.isFinite(day.areaCapacity)
      && before.bookedDaily + before.heldDaily + requiredPoints <= day.dailyCapacity
      && before.bookedArea + before.heldArea + requiredPoints <= day.areaCapacity) return { day, before };
  }
  throw new SmokeError(`No seeded staging date has enough spare daily and Smalls capacity for ${requiredPoints} points. No customer fixtures were created.`);
}

export function verifyRunBookings(rows, points, customers = CUSTOMERS) {
  requireCheck(rows.length === customers, `Expected exactly ${customers} bookings; found ${rows.length}.`);
  requireCheck(new Set(rows.map(row => row.userId)).size === customers, "A customer has duplicate bookings or another customer is missing.");
  requireCheck(new Set(rows.map(row => row.holdId)).size === customers && rows.every(row => row.holdId), "Booking holds were reused or missing.");
  for (const row of rows) {
    requireCheck(row.status === "scheduled" && row.holdStatus === "converted", "A booking or hold has the wrong final status.");
    requireCheck(row.percent === 100 && row.points === points, "Booking allocation/capacity accounting is incorrect.");
  }
}

async function concurrentStep(clients, label, step) {
  const results = await Promise.allSettled(clients.map(step));
  const failed = results.filter(result => result.status === "rejected");
  requireCheck(!failed.length, `${failed.length} of ${clients.length} customers failed during concurrent ${label}. Inspect the recorded HTTP statuses; partial fixtures are retained.`);
}

async function main() {
  const { customers, preflight } = validateSmokeArguments(process.argv.slice(2));
  try { validateStagingConfig(readConfig()); }
  catch { throw new SmokeError("Staging configuration validation failed. Run npm run staging:check. No test requests were made."); }
  const probe = new StagingClient();
  const response = await probe.request("/login");
  assertAccessible(response);
  requireCheck((await response.text()).includes('name="password"'), "Staging did not return the application's login form.");
  console.log("Staging HTTP preflight passed.");
  if (preflight) return;
  requireCheck(d1("SELECT value FROM settings WHERE key='environment.marker';")[0]?.value === "staging", "Staging database marker is missing. Seed staging first.");
  const days = d1(`SELECT d.id,d.dropoff_date AS date,d.daily_capacity_override AS dailyCapacity,o.capacity_points_override AS areaCapacity
    FROM dropoff_days d JOIN booking_event_dropoff_dates link ON link.dropoff_day_id=d.id JOIN booking_events e ON e.id=link.booking_event_id
    JOIN item_areas area ON area.name='Smalls' AND area.active=1 JOIN dropoff_day_area_overrides o ON o.dropoff_day_id=d.id AND o.item_area_id=area.id
    WHERE d.notes='STAGING synthetic data' AND e.name='[STAGING] Load test' AND d.is_open=1 AND d.visibility='public' AND e.active=1
      AND d.dropoff_date>date('now') AND datetime(e.opens_at)<=CURRENT_TIMESTAMP AND (e.closes_at IS NULL OR datetime(e.closes_at)>CURRENT_TIMESTAMP)
    ORDER BY d.dropoff_date DESC;`);
  requireCheck(days.length, "No open, future seeded staging date is available.");
  const loadType = d1("SELECT id,capacity_points AS points FROM dropoff_types WHERE active=1 AND capacity_points>0 ORDER BY capacity_points,id LIMIT 1;")[0];
  const areas = d1("SELECT id,name FROM item_areas WHERE active=1 ORDER BY display_order,name;");
  const smalls = areas.find(area => area.name === "Smalls");
  requireCheck(loadType && smalls, "Seeded load types or Smalls area are missing.");
  const expected = customers * loadType.points;
  const { day, before } = selectSmokeDate(days, expected, date => capacitySnapshot(date, smalls.id));
  console.log(`Selected seeded staging date ${day.date}: ${expected} points required; daily ${before.bookedDaily + before.heldDaily}/${day.dailyCapacity}, Smalls ${before.bookedArea + before.heldArea}/${day.areaCapacity} currently used.`);
  const runId = `staging-smoke-${Date.now()}-${randomBytes(4).toString("hex")}`;
  const marker = `[STAGING SMOKE] ${runId}`;
  const userIds = smokeUserIds(runId, customers).map(quote).join(",");
  const report = { runId, origin: STAGING_ORIGIN, customers, date: day.date, pointsPerBooking: loadType.points, before, checks: {}, passed: false };
  const clients = Array.from({ length: customers }, () => new StagingClient());
  const directory = new URL("test-results/staging-smoke/", projectRoot);
  try {
    const password = randomBytes(32).toString("base64url");
    d1(smokeFixtureSql(runId, await hashPassword(password), customers), true);
    console.log(`Created ${customers} isolated synthetic customers for ${runId}. Password remains in memory; existing seeded passwords are unchanged.`);
    // Authenticate sequentially, then synchronize actual reservation/completion
    // work. This keeps login bursts out of the booking concurrency measurement.
    let previousLoginStarted = 0;
    for (let index = 0; index < clients.length; index++) {
      // At least four seconds between login starts stays below the installed
      // Better Auth sensitive-endpoint limit of three requests per ten seconds.
      if (index > 0) await delay(Math.max(0, LOGIN_INTERVAL_MS - (performance.now() - previousLoginStarted)));
      previousLoginStarted = performance.now();
      const client = clients[index];
      const login = await client.request("/api/auth/sign-in/email", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: `${runId}-${index + 1}@example.invalid`, password }) });
      requireCheck(login.status === 200 && /__Secure-trice-staging\.session_token=/.test(client.cookieHeader()), `Customer ${index + 1} login did not establish an isolated staging session (HTTP ${login.status}).`);
      await login.arrayBuffer();
      const page = await client.request(`/dropoffs/${day.id}/book`);
      requireCheck(page.status === 200 && (await page.text()).includes('value="reserve"'), `Customer ${index + 1} could not load the booking form (HTTP ${page.status}).`);
      requireCheck(client.cookies.has("trice_booking_attempt"), "Booking form did not establish a booking attempt cookie.");
      if ((index + 1) % 5 === 0) console.log(`Authenticated ${index + 1}/${customers} customers; booking requests have not started.`);
    }
    const form = intent => new URLSearchParams({ intent, appointmentDate: day.date, dropoffTypeId: String(loadType.id), description: marker,
      ...Object.fromEntries(areas.map(area => [`allocation-${area.id}`, area.id === smalls.id ? "100" : "0"])) });
    const path = `/dropoffs/${day.id}/book`;
    await concurrentStep(clients, "reservation", async client => {
      const reserved = await client.request(path, { method: "POST", body: form("reserve") });
      requireCheck(reserved.status === 200, `Reservation failed (HTTP ${reserved.status}).`);
      await reserved.arrayBuffer();
    });
    const held = d1(`SELECT COUNT(*) AS holds,SUM(h.reserved_daily_intake_points) AS points FROM booking_holds h JOIN users u ON u.id=h.user_id WHERE u.auth_user_id IN (${userIds}) AND h.status='active' AND h.expires_at>CURRENT_TIMESTAMP;`)[0];
    requireCheck(held.holds === customers && held.points === expected, `Concurrent reservations did not produce exactly ${customers} active holds with correct points.`);
    report.checks.reservations = true;
    const originalCookie = clients[0].cookieHeader();
    await concurrentStep(clients, "completion", async client => {
      const completed = await client.request(path, { method: "POST", body: form("complete") });
      requireCheck([302, 303].includes(completed.status) && new URL(completed.headers.get("location"), STAGING_ORIGIN).pathname === "/my-appointments", `Completion failed (HTTP ${completed.status}).`);
      await completed.arrayBuffer();
    });
    const duplicate = await clients[0].request(path, { method: "POST", body: form("complete") }, originalCookie);
    requireCheck([302, 303, 400, 409].includes(duplicate.status), `Duplicate completion returned unexpected HTTP ${duplicate.status}.`);
    await duplicate.arrayBuffer();
    const bookings = d1(`SELECT a.id,a.user_id AS userId,a.status,a.booking_hold_id AS holdId,h.status AS holdStatus,SUM(x.allocation_percent) AS percent,SUM(x.capacity_points) AS points
      FROM appointments a JOIN booking_holds h ON h.id=a.booking_hold_id JOIN appointment_area_allocations x ON x.appointment_id=a.id
      WHERE a.description=${quote(marker)} GROUP BY a.id ORDER BY a.id;`);
    verifyRunBookings(bookings, loadType.points, customers);
    report.appointmentIds = bookings.map(booking => booking.id);
    report.checks.bookingsAndDuplicateReplay = true;
    const after = capacitySnapshot(day.date, smalls.id);
    requireCheck(after.bookedDaily - before.bookedDaily === expected && after.bookedArea - before.bookedArea === expected, `Date capacity did not increase by exactly ${customers} loads; check for other staging traffic during the test.`);
    requireCheck(d1(`SELECT COUNT(*) AS active FROM booking_holds h JOIN users u ON u.id=h.user_id WHERE u.auth_user_id IN (${userIds}) AND h.status='active';`)[0].active === 0, "Converted holds still consume active capacity.");
    report.after = after;
    report.checks.capacityAccounting = true;
    report.notifications = d1(`SELECT notification_type,channel,status,provider_message_id,COUNT(*) AS total FROM notification_jobs WHERE appointment_id IN (${bookings.map(booking => booking.id).join(",")}) GROUP BY notification_type,channel,status,provider_message_id;`);
    requireCheck(report.notifications.every(job => job.status !== "sent" || job.provider_message_id === `suppressed:${job.channel}`), "A sent notification lacks the staging suppression marker.");
    const confirmations = d1(`SELECT COUNT(DISTINCT appointment_id) AS total FROM notification_jobs WHERE appointment_id IN (${bookings.map(booking => booking.id).join(",")}) AND notification_type='confirmation' AND channel='email' AND status='sent' AND provider_message_id='suppressed:email';`)[0].total;
    requireCheck(confirmations === customers, `Not all ${customers} confirmation emails were recorded as suppressed. Inspect staging notification settings and queue backlog.`);
    report.checks.notificationsSuppressed = true;
    report.passed = true;
    console.log(`PASS: ${customers} concurrent reservations, ${customers} completed bookings, duplicate replay created no extra booking, +${expected} daily/Smalls capacity points, ${customers} suppressed email confirmations.`);
  } catch (error) {
    report.error = error instanceof SmokeError ? error.message : "Unexpected smoke-test failure; raw diagnostics withheld to protect generated credentials.";
    throw new SmokeError(report.error);
  } finally {
    report.requests = clients.flatMap((client, index) => client.timings.map(timing => ({ customer: index + 1, ...timing })));
    mkdirSync(directory, { recursive: true });
    const file = new URL(`${runId}.json`, directory);
    writeFileSync(file, JSON.stringify(report, null, 2) + "\n", { mode: 0o600 });
    console.log(`Report: ${fileURLToPath(file)}. Test accounts/bookings are retained with the [STAGING SMOKE] marker; no production resources were used.`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error instanceof SmokeError ? error.message : "Staging smoke test failed. Check configuration and local dependencies."); process.exitCode = 1; });
}
