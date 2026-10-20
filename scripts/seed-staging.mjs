import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";
import { hashPassword } from "better-auth/crypto";
import { projectRoot, readConfig, validateStagingConfig } from "./staging-config.mjs";

const quote = value => `'${String(value).replaceAll("'", "''")}'`;

class SeedSetupError extends Error {}

export function validateSeedPassword(password) {
  if (!password) throw new SeedSetupError("No staging password was provided. Run npm run db:seed:staging in an interactive terminal to enter one, or export STAGING_SEED_PASSWORD.");
  if (password.length < 16) throw new SeedSetupError("Staging password must contain at least 16 characters. Run the seed command again and enter a longer staging-only password.");
  return password;
}

async function readSeedPassword() {
  if (process.env.STAGING_SEED_PASSWORD !== undefined) return validateSeedPassword(process.env.STAGING_SEED_PASSWORD);
  if (!process.stdin.isTTY || !process.stderr.isTTY) return validateSeedPassword(undefined);
  const mutedOutput = new Writable({ write(_chunk, _encoding, callback) { callback(); } });
  const prompt = createInterface({ input: process.stdin, output: mutedOutput, terminal: true });
  process.stderr.write("Staging-only password (16+ characters; input hidden): ");
  try { return validateSeedPassword(await prompt.question("")); }
  finally { prompt.close(); process.stderr.write("\n"); }
}

export function seedErrorMessage(error) {
  // Only display messages created here; arbitrary dependency/child-process errors
  // can contain SQL, password hashes, or environment values.
  return error instanceof SeedSetupError ? error.message : "Unexpected staging seed failure. No production target is supported.";
}

export function validateSeedArguments(args) {
  if (args.length !== 3 || args[0] !== "--env" || args[1] !== "staging" || !["--remote", "--local"].includes(args[2])) {
    throw new Error("Refusing seed: use --env staging --remote (or --local). No production target or extra arguments are accepted.");
  }
}

export function stagingSeedSql(passwordHash) {
  const statements = [
    `INSERT INTO settings(key,value) VALUES ('environment.marker','staging') ON CONFLICT(key) DO NOTHING;`,
    `INSERT INTO booking_events(name,opens_at,closes_at,active,description,admin_notes,timestamp_storage_version)
     SELECT '[STAGING] Load test',datetime('now','-1 day'),datetime('now','+60 days'),1,'Synthetic load-test event','STAGING synthetic data',2
     WHERE NOT EXISTS (SELECT 1 FROM booking_events WHERE name='[STAGING] Load test');`,
  ];
  for (const offset of [7, 8, 9, 10, 11]) {
    statements.push(`INSERT INTO dropoff_days(dropoff_date,capacity_points,is_open,notes,event_name,visibility,daily_capacity_override)
      VALUES(date('now','+${offset} days'),1200,1,'STAGING synthetic data','[STAGING] Load test','public',1200)
      ON CONFLICT(dropoff_date) DO NOTHING;`);
    statements.push(`INSERT OR IGNORE INTO booking_event_dropoff_dates(booking_event_id,dropoff_day_id)
      SELECT e.id,d.id FROM booking_events e,dropoff_days d WHERE e.name='[STAGING] Load test' AND d.dropoff_date=date('now','+${offset} days') AND d.notes='STAGING synthetic data';`);
    statements.push(`INSERT INTO dropoff_day_area_overrides(dropoff_day_id,item_area_id,capacity_points_override,overflow_allowance_points_override)
      SELECT d.id,a.id,1200,0 FROM dropoff_days d,item_areas a WHERE d.dropoff_date=date('now','+${offset} days') AND d.notes='STAGING synthetic data'
      ON CONFLICT(dropoff_day_id,item_area_id) DO NOTHING;`);
  }
  for (let i = 1; i <= 100; i++) {
    const id = `staging-loadtest-${String(i).padStart(3, "0")}`;
    const email = `${id}@example.invalid`;
    statements.push(`INSERT OR IGNORE INTO "user"(id,name,email,emailVerified,createdAt,updatedAt) VALUES(${quote(id)},'[STAGING] Test Customer ${i}',${quote(email)},1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);`);
    statements.push(`INSERT INTO account(id,accountId,providerId,issuer,userId,password,createdAt,updatedAt) VALUES(${quote(id)},${quote(id)},'credential','local:credential',${quote(id)},${quote(passwordHash)},CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
      ON CONFLICT(id) DO UPDATE SET issuer=excluded.issuer,password=excluded.password,updatedAt=CURRENT_TIMESTAMP;`);
    statements.push(`INSERT OR IGNORE INTO users(email,first_name,last_name,role,auth_user_id,active) VALUES(${quote(email)},'[STAGING]','Customer ${i}','customer',${quote(id)},1);`);
    statements.push(`INSERT OR IGNORE INTO user_roles(user_id,role) SELECT id,'consignor' FROM users WHERE email=${quote(email)};`);
  }
  return statements.join("\n");
}

async function main() {
  const args = process.argv.slice(2);
  try { validateSeedArguments(args); }
  catch { throw new SeedSetupError("Refusing seed: use --env staging --remote (or --local); production targets and extra arguments are forbidden."); }
  try { validateStagingConfig(readConfig()); }
  catch { throw new SeedSetupError("Staging isolation validation failed. Run npm run staging:check for the configuration diagnostic; no seed SQL was executed."); }
  const password = await readSeedPassword();
  let passwordHash;
  try { passwordHash = await hashPassword(password); }
  catch { throw new SeedSetupError("Could not hash the staging password. Check your Node installation and installed Better Auth dependencies; no seed SQL was executed."); }
  let directory;
  try { directory = mkdtempSync(join(tmpdir(), "trice-staging-seed-")); }
  catch { throw new SeedSetupError("Cannot create a private seed directory. Check temporary-directory permissions; no seed SQL was executed."); }
  try {
    const file = join(directory, "seed.sql");
    try { writeFileSync(file, stagingSeedSql(passwordHash), { mode: 0o600 }); }
    catch { throw new SeedSetupError("Cannot write the private seed SQL file. Check temporary-directory permissions; no seed SQL was executed."); }
    console.log(`Staging isolation verified. Seeding ${args[2] === "--remote" ? "remote" : "local"} trice-auction-db-staging.`);
    try {
      execFileSync(process.execPath, [new URL("node_modules/wrangler/bin/wrangler.js", projectRoot).pathname,
        "d1", "execute", "trice-auction-db-staging", "--env", "staging", args[2], "--config", new URL("wrangler.jsonc", projectRoot).pathname, "--file", file, "--yes"],
      { cwd: projectRoot, stdio: "inherit" });
    } catch { throw new SeedSetupError("Wrangler staging import failed. Review the Wrangler diagnostic above; check Cloudflare login and staging migrations. Re-running can complete a partial seed."); }
    console.log("Seeded staging: [STAGING] Load test event, five future drop-off dates, date capacities, and 100 synthetic consignor logins at example.invalid. Re-running refreshes their password and adds future dates; it does not clear appointments.");
  } finally { rmSync(directory, { recursive: true, force: true }); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(`Staging seed failed: ${seedErrorMessage(error)}`); process.exitCode = 1; });
}
