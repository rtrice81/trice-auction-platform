# Isolated Cloudflare staging

The existing application deploys to the default production Worker or `env.staging`.
There is no application copy. Staging targets `https://staging-consign.bidtrice.com`.

## Resources and provisioning status

| Resource | Production | Staging |
| --- | --- | --- |
| Worker | `trice-auction-platform` | `trice-auction-platform-staging` |
| D1 binding | `trice_auction_db` | `trice_auction_db` |
| D1 name | `trice-auction-db` | `trice-auction-db-staging` |
| D1 ID | `6f82d71d-e82b-43ad-a0d4-d0164358764e` | `efa20592-936f-4673-be20-814f7534c3b2` |
| R2 binding | `branding_assets` | `branding_assets` |
| R2 bucket | `trice-auction-branding` | `trice-auction-branding-staging` |
| Auth cookie prefix | Better Auth default | `trice-staging` (secure, host-only) |
| Notification delivery | Existing Resend/Telnyx behavior | Log-only email **and SMS** |
| Turnstile | Existing production widget | Official Cloudflare test widget + Siteverify |

Created on October 20, 2026: staging D1, staging R2, and the staging Worker shell.
All 41 current migrations through `0041` were applied remotely to staging only.
A fresh, random staging `AUTH_SECRET` and Cloudflare's public testing
`TURNSTILE_SECRET_KEY` were installed on the staging Worker. No private values were
printed or committed. The application has **not** been deployed to staging and no
custom domain/DNS change has been performed. Remote seed data has not been loaded.

## Cloudflare Dashboard and domain steps

1. In Workers & Pages, select **trice-auction-platform-staging**. Do not change the
   production Worker's domains, bindings, or secrets.
2. Confirm `bidtrice.com` is an active zone in the same account. For the staging
   Worker, add **Settings → Domains & Routes → Custom Domain →
   staging-consign.bidtrice.com**. Cloudflare manages the DNS record and certificate.
   Check for a conflicting record at that exact hostname before adding it; leave
   `consign.bidtrice.com` untouched. The staging Wrangler route declares this same
   Custom Domain, so deploying can also provision it when permissions allow.
3. Deploy with the command below. Verify the bindings and variables against the
   table above in the staging Worker's settings. Staging disables workers.dev and
   preview URLs and rejects requests arriving on other origins.
4. No Turnstile Dashboard hostname addition is necessary for the official test
   widget. For realistic challenge testing later, create a **separate** widget
   allowing only `staging-consign.bidtrice.com`, set its staging site key and secret,
   and change staging `TURNSTILE_MODE` to `live`. The provided load-test config
   checker intentionally requires test mode; review/update that assertion when
   deliberately changing strategy. Never change the production widget for load tests.
5. Do not install Resend/Telnyx API keys, production sender credentials, or a
   production SMS webhook in staging. No provider credentials are required.

The resources already exist; **do not recreate them**. For disaster recovery or
another account, create dedicated resources, replace only the staging database ID,
and update the expected staging identity in `scripts/staging-config.mjs` after
review:

```sh
npx wrangler d1 create trice-auction-db-staging
npx wrangler r2 bucket create trice-auction-branding-staging
```

## Secrets and local development

Secrets are scoped to each Worker environment. Production auth secrets and
`BETTER_AUTH_URL` remain unchanged. Staging's auth/link URLs are nonsecret vars in
Wrangler. To rotate/reinstall staging secrets manually:

```sh
npx wrangler secret put AUTH_SECRET --env staging --config wrangler.jsonc
npx wrangler secret put TURNSTILE_SECRET_KEY --env staging --config wrangler.jsonc
npx wrangler secret list --env staging --config wrangler.jsonc
```

Use a newly generated high-entropy auth secret, different from production. For
test mode, use the always-passes **public dummy secret** in
[Cloudflare's testing documentation](https://developers.cloudflare.com/turnstile/troubleshooting/testing/).
Do not print private secrets, put them in CLI arguments, or store them in tracked
files. `secret list` lists names only.

For local staging development, create an ignored `.dev.vars.staging` with separate
local secrets. Without this file the Vite plugin can fall back to `.dev.vars`.
The deployed staging Worker does not inherit production secrets. Staging is
configured for its HTTPS hostname; use the regular local development environment
for localhost browsing rather than weakening the staging origin guard.

## Deploy and migrations

```sh
npm run staging:check
npm run db:migrate:staging
npm run deploy:staging
```

The migration command runs exactly:

```sh
npx wrangler d1 migrations apply trice-auction-db-staging --env staging --remote --config wrangler.jsonc
```

It is explicit and separate from deployment; production migrations are never
applied by these commands. `deploy:staging` validates isolation, builds with
`CLOUDFLARE_ENV=staging`, verifies the generated deployment config's Worker name,
database ID, vars, R2 and domain, then deploys `build/server/wrangler.json`.
[Cloudflare selects Vite bindings at build time](https://developers.cloudflare.com/workers/vite-plugin/reference/cloudflare-environments/).
Do not deploy a leftover build with an arbitrary `--env` flag. Both environments
use the same build directory and code, so run the corresponding build each time.

Existing `npm run deploy` still builds and deploys production. Do not export
`CLOUDFLARE_ENV=staging` globally when using production commands.

## Explicit seed process

After staging migrations, run the command below in your terminal. It prompts for
a unique staging-only test password of at least 16 characters with input hidden:

```sh
npm run db:seed:staging
```

For unattended runs, supply `STAGING_SEED_PASSWORD` securely through the process
environment. An exported value takes precedence over the prompt; unset a stale
value to prompt again. Missing or short passwords produce specific diagnostics
before Wrangler runs. The script also identifies isolation, hashing, temporary
file, and Wrangler import failures without printing passwords or hashes.

The seed script refuses production or extra CLI arguments and checks the actual
Wrangler database ID/name, R2, origin, and notification configuration before
executing any SQL. It passes an explicit absolute source config and `--env staging`
to Wrangler. SQL containing password hashes is temporarily stored with mode 0600
and removed afterward. For an isolated local smoke test:

```sh
npx wrangler d1 migrations apply trice-auction-db-staging --env staging --local --config wrangler.jsonc
node scripts/seed-staging.mjs --env staging --local
```

Seed creates:

- An open `[STAGING] Load test` booking event, closing 60 days after initial seeding.
- Five public drop-off dates 7–11 days ahead, with 1200 daily capacity points and
  1200 points in each existing item area; overflow is zero for those dates.
- 100 active consignor customers and Better Auth credential accounts:
  `staging-loadtest-001@example.invalid` through `staging-loadtest-100@example.invalid`.
  All use the password supplied above. Names contain `[STAGING]` and no real phone
  numbers are generated. These customers have no admin privileges.
- An `environment.marker=staging` setting for verification.

Re-running refreshes synthetic account passwords and adds future dates without
clearing existing bookings. Existing conflicting dates are left untouched. Review
the booking window if reusing a seed older than 60 days. Use the staging app's
registration flow and the staging database to grant an administrator role when
needed; existing `admin:*` scripts target production/default local data and must
**not** be used to administer staging remotely.

## Load-test behavior and safety checks

Email and SMS providers suppress external requests whenever `APP_ENV=staging`,
even if credentials are accidentally added or `NOTIFICATION_MODE` changes. Normal
log mode is explicit in config; invalid staging notification configuration stops
the Worker. Queue processing still renders messages and updates jobs to `sent`
with `provider_message_id=suppressed:email` or `suppressed:sms`. Logs identify
suppressed delivery without recording message bodies, recipients, or credentials.
Admin test sends are also suppressed; the admin provider status displays log-only
delivery and its real-send controls remain disabled. The five-minute staging cron
processes only its own queue. Production delivery behavior is unchanged.

Better Auth trusts only the staging origin in staging, uses its own secure cookie
prefix, disables cross-subdomain cookies, signs sessions with a separate secret,
and stores sessions in staging D1. The Worker rejects staging requests served on
the production origin. Production's existing trusted origins/cookies stay intact.

Turnstile still calls Cloudflare Siteverify. Official test credentials require
`APP_ENV=staging`, `TURNSTILE_MODE=test`, the staging auth URL and the staging
request origin. Known dummy secrets/test mode fail closed on production, including
on `consign.bidtrice.com` even if staging variables are accidentally installed
there. No request header, query parameter, cookie, or form flag enables test mode.
Local test-key development remains supported on localhost.

For k6, use the official dummy response token `XXXX.DUMMY.TOKEN.XXXX` with the
configured testing secret, or use browser-generated test-widget responses. Public
forms still require a fresh signed `formStartToken`, its matching cookie, an empty
`companyWebsite`, and at least two seconds between form loading and submission.
IP-based limits (including 15 login attempts per ten minutes) remain enabled;
plan login setup at low concurrency, reuse authenticated sessions, or distribute
public-form test traffic across real source IPs. Authenticated booking is the
appropriate path for capacity/concurrency tests. No load test is automatically run.

Verify isolation before testing:

```sh
npm run staging:check
npm run build:staging
node scripts/staging-config.mjs --built
npx wrangler deploy --dry-run --config build/server/wrangler.json
npx wrangler d1 migrations list trice-auction-db-staging --env staging --remote --config wrangler.jsonc
npx wrangler d1 execute trice-auction-db-staging --env staging --remote --config wrangler.jsonc --command "SELECT value FROM settings WHERE key='environment.marker'"
```

The marker appears after seeding. Confirm dry-run output lists only the staging
D1 and staging R2 resources; compare the actual IDs in source/generated Wrangler
configs with the table. In Dashboard, inspect staging bindings and D1 tables.
After seeding, register/log in, book a staging date, inspect the staging record and
suppressed notification jobs, and inspect cookies for the staging-only prefix and
absence of a Domain attribute. Do not perform production writes as an isolation
test. To validate production config safely, rebuild with `npm run build` then run
the same dry-run command; it must list the production D1/R2 resources.
