import { execFileSync } from "node:child_process";
import { Writable } from "node:stream";
import { createInterface } from "node:readline/promises";
import { hashPassword } from "better-auth/crypto";

const MINIMUM_PASSWORD_LENGTH = 12;
const args = process.argv.slice(2);
const remote = args.includes("--remote");
const emailArguments = args.filter((argument) => argument !== "--remote");
const email = emailArguments[0]?.trim().toLowerCase();

if (!email || emailArguments.length !== 1 || !email.includes("@")) {
  console.error("Usage: npm run admin:reset-password -- admin@example.com [--remote]");
  process.exit(1);
}

function quoteSql(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

function executeD1(sql) {
  const command = ["wrangler", "d1", "execute", "trice-auction-db", remote ? "--remote" : "--local", "--json", "--command", sql];
  try {
    return JSON.parse(execFileSync("npx", command, { encoding: "utf8", stdio: ["inherit", "pipe", "pipe"] }));
  } catch (error) {
    const stdout = error?.stdout?.toString?.() ?? "";
    const stderr = error?.stderr?.toString?.() ?? "";
    if (stdout) process.stderr.write(stdout);
    if (stderr) process.stderr.write(stderr);
    if (error instanceof Error) process.stderr.write(`${error.message}\n`);
    throw new Error(`Wrangler could not query the ${remote ? "remote production" : "local"} D1 database; no password was changed.`, { cause: error });
  }
}

function resultRows(payload) {
  if (!Array.isArray(payload)) return [];
  return payload.flatMap((entry) => Array.isArray(entry?.results) ? entry.results : []);
}

async function promptForPassword(label) {
  if (!process.stdin.isTTY || !process.stderr.isTTY) {
    throw new Error("Password reset must be run from an interactive terminal.");
  }
  const mutedOutput = new Writable({ write(_chunk, _encoding, callback) { callback(); } });
  const prompt = createInterface({ input: process.stdin, output: mutedOutput, terminal: true });
  process.stderr.write(label);
  try {
    return await prompt.question("");
  } finally {
    prompt.close();
    process.stderr.write("\n");
  }
}

const lookupSql = `
  SELECT
    application_user.id AS applicationUserId,
    application_user.email AS applicationEmail,
    application_user.role AS role,
    application_user.active AS active,
    application_user.auth_user_id AS authUserId,
    auth_user.id AS betterAuthUserId,
    auth_user.email AS betterAuthEmail,
    credential_account.id AS credentialAccountId,
    credential_account.password IS NOT NULL AS hasCredentialPassword
  FROM users AS application_user
  LEFT JOIN "user" AS auth_user
    ON auth_user.id = application_user.auth_user_id
   AND LOWER(auth_user.email) = LOWER(application_user.email)
  LEFT JOIN account AS credential_account
    ON credential_account.userId = auth_user.id
   AND credential_account.providerId = 'credential'
  WHERE LOWER(application_user.email) = LOWER(${quoteSql(email)})
`;

let matches;
try {
  matches = resultRows(executeD1(lookupSql));
} catch (error) {
  console.error(error instanceof Error ? error.message : "D1 lookup failed; no password was changed.");
  process.exit(1);
}
if (matches.length !== 1) {
  console.error(`No application user was found for ${email}; no password was changed.`);
  process.exit(1);
}

const user = matches[0];
if (user.active !== 1) {
  console.error(`The application user for ${email} is inactive; no password was changed.`);
  process.exit(1);
}
if (user.role !== "admin") {
  console.error(`The application user for ${email} is not an admin; no password was changed.`);
  process.exit(1);
}
if (!user.betterAuthUserId || !user.authUserId || user.betterAuthUserId !== user.authUserId) {
  console.error(`The application user for ${email} has no linked Better Auth identity; no password was changed.`);
  process.exit(1);
}
if (!user.credentialAccountId || user.hasCredentialPassword !== 1) {
  console.error(`The Better Auth identity for ${email} has no password credential; no password was changed.`);
  process.exit(1);
}

let password;
let confirmation;
try {
  password = await promptForPassword("New password: ");
  confirmation = await promptForPassword("Confirm new password: ");
} catch (error) {
  console.error(error instanceof Error ? error.message : "Password reset could not read the password.");
  process.exit(1);
}

if (password !== confirmation) {
  console.error("Passwords do not match; no password was changed.");
  process.exit(1);
}
if (password.length < MINIMUM_PASSWORD_LENGTH) {
  console.error(`Password must be at least ${MINIMUM_PASSWORD_LENGTH} characters; no password was changed.`);
  process.exit(1);
}

const passwordHash = await hashPassword(password);
password = undefined;
confirmation = undefined;

const now = new Date().toISOString();
const updateSql = `
  UPDATE account
  SET password = ${quoteSql(passwordHash)}, updatedAt = ${quoteSql(now)}
  WHERE id = ${quoteSql(user.credentialAccountId)}
    AND userId = ${quoteSql(user.betterAuthUserId)}
    AND providerId = 'credential'
    AND password IS NOT NULL;
  SELECT changes() AS changed;
`;
let changes;
try {
  changes = resultRows(executeD1(updateSql)).find((row) => Object.hasOwn(row, "changed"))?.changed;
} catch (error) {
  console.error(error instanceof Error ? error.message : "D1 update failed; no password was changed.");
  process.exit(1);
}
if (changes !== 1) {
  console.error("Better Auth password credential was not updated; no password reset was completed.");
  process.exit(1);
}

console.log(`Password reset for active admin ${email} in ${remote ? "remote production" : "local"} D1.`);
console.log("Existing sessions were preserved.");
