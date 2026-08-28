import { execFileSync } from "node:child_process";

const email = process.argv[2]?.trim().toLowerCase();
if (!email || !email.includes("@")) {
  console.error("Usage: npm run admin:promote-local -- person@example.com");
  process.exit(1);
}

const escapedEmail = email.replaceAll("'", "''");
const sql = `UPDATE users SET role = 'admin', active = 1 WHERE email = '${escapedEmail}'; SELECT changes() AS changed;`;
const output = execFileSync("npx", ["wrangler", "d1", "execute", "trice-auction-db", "--local", "--json", "--command", sql], { encoding: "utf8", stdio: ["inherit", "pipe", "inherit"] });
if (!/"changed"\s*:\s*1/.test(output)) {
  console.error(`No local application user was found for ${email}; no role was changed.`);
  process.exit(1);
}
console.log(`Promoted ${email} to an active admin in local D1.`);
