import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import ts from "typescript";

export const projectRoot = new URL("../", import.meta.url);
export const productionDatabaseId = "6f82d71d-e82b-43ad-a0d4-d0164358764e";
export const stagingDatabaseId = "efa20592-936f-4673-be20-814f7534c3b2";

export function readConfig() {
  const parsed = ts.parseConfigFileTextToJson("wrangler.jsonc", readFileSync(new URL("wrangler.jsonc", projectRoot), "utf8"));
  if (parsed.error) throw new Error("Cannot parse wrangler.jsonc");
  return parsed.config;
}

export function validateStagingConfig(config) {
  const staging = config.env?.staging;
  const production = config.d1_databases?.find(db => db.binding === "trice_auction_db");
  assert.equal(production?.database_id, productionDatabaseId, "Production database identity changed; review isolation before proceeding.");
  assert.equal(production.database_name, "trice-auction-db");
  assert.equal(staging?.name, "trice-auction-platform-staging");
  assert.deepEqual(staging.limits, { cpu_ms: 1000 }, "Staging must have its explicit, bounded CPU allowance.");
  assert.deepEqual(staging.d1_databases, [{ binding: "trice_auction_db", database_name: "trice-auction-db-staging", database_id: stagingDatabaseId, migrations_dir: "migrations" }], "Staging D1 must be the dedicated staging database.");
  assert.deepEqual(staging.r2_buckets, [{ binding: "branding_assets", bucket_name: "trice-auction-branding-staging" }]);
  assert.ok(!config.r2_buckets.some(bucket => bucket.bucket_name === staging.r2_buckets[0].bucket_name));
  assert.equal(staging.vars.APP_ENV, "staging");
  assert.equal(staging.vars.BETTER_AUTH_URL, "https://staging-consign.bidtrice.com");
  assert.equal(staging.vars.APP_BASE_URL, staging.vars.BETTER_AUTH_URL);
  assert.equal(staging.vars.NOTIFICATION_MODE, "log");
  assert.equal(staging.vars.TURNSTILE_MODE, "test");
  assert.equal(staging.vars.TURNSTILE_SITE_KEY, "1x00000000000000000000AA");
  assert.equal(config.vars.APP_ENV, "production");
  assert.equal(config.vars.TURNSTILE_SITE_KEY, "0x4AAAAAAEjhsjITMtiykQdg");
  assert.deepEqual(staging.routes, [{ pattern: "staging-consign.bidtrice.com", custom_domain: true }]);
  assert.equal(staging.workers_dev, false);
  assert.equal(staging.preview_urls, false);
  return staging;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const staging = validateStagingConfig(readConfig());
  if (process.argv.includes("--built")) {
    const built = JSON.parse(readFileSync(new URL("build/server/wrangler.json", projectRoot), "utf8"));
    assert.equal(built.name, staging.name, "Build selected the wrong Worker.");
    assert.deepEqual(built.vars, staging.vars);
    assert.deepEqual(built.r2_buckets, staging.r2_buckets);
    assert.deepEqual(built.routes, staging.routes);
    assert.deepEqual(built.limits, staging.limits);
    assert.equal(built.d1_databases.length, 1);
    assert.equal(built.d1_databases[0].database_id, stagingDatabaseId, "Build selected the wrong D1 database.");
    assert.equal(built.d1_databases[0].binding, "trice_auction_db");
  }
  console.log(`Isolation verified: production D1 ${productionDatabaseId}; staging D1 ${stagingDatabaseId}; separate R2, auth origin, log-only notifications.`);
}
