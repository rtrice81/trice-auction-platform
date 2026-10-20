# Five-customer staging concurrency smoke test

Run after the manual smoke test, staging deployment, and seed have passed:

```sh
npm run smoke:staging -- --preflight
npm run smoke:staging
```

The runner uses Node's HTTP client and the installed Wrangler/Better Auth
dependencies. It does not require k6 or any new packages. This is a small
correctness test with five customers, not a throughput benchmark.

## What happens

1. Validate the actual Wrangler staging config, fixed database ID, separate R2,
   auth origin, Turnstile test mode, and log-only notification settings.
2. GET the staging login form. Stop immediately if Cloudflare challenges the
   runner, the app is unavailable, or a redirect points outside staging. The
   `--preflight` option stops here and creates no fixtures.
3. Read staging's database marker and select the latest future seeded drop-off
   date belonging to `[STAGING] Load test`. Confirm spare daily/Smalls capacity
   for five loads. Keep other booking activity off that date during the test.
4. Create five **new** `[STAGING SMOKE]` consignors with unique `example.invalid`
   addresses and valid Better Auth credential issuers. A random shared password
   exists only in process memory; it is never printed, written in plaintext, or
   applied to the original 100 seed customers. Hash SQL uses a private temporary
   file that is removed afterward.
5. Log in those five customers sequentially, with separate cookie jars. Load the
   real booking forms to obtain separate booking-attempt cookies.
6. Submit five reservation requests concurrently through the application's
   `/dropoffs/:id/book` action; verify five active holds and their total points.
7. Submit five completion requests concurrently. Replay one completion using its
   original booking-attempt cookie to check duplicate replay protection. This
   replay is sequential; a simultaneous duplicate-submit race is a later test.
8. Query staging D1 to verify exactly one scheduled booking per customer, five
   distinct converted holds, 100% allocations, the expected capacity-point
   increase, and zero remaining active holds for this run.
9. Verify all five bookings have suppressed email confirmations, and every sent
   notification for these bookings has a `suppressed:email` or `suppressed:sms`
   provider marker. Future pending reminders and cancelled jobs are allowed.

The selected load is the cheapest active load type, allocated 100% to Smalls.
With the current seed configuration, five Car Loads consume 50 daily and 50
Smalls capacity points. This checks accounting under spare capacity; testing the
last-slot boundary and over-capacity rejection requires a separate scenario.

The runner never follows HTTP redirects automatically. Its origin is hardcoded to
`https://staging-consign.bidtrice.com`; environment/hostname overrides and local or
production database targets are refused. The database target is explicit and
validated before use. Production is never used for comparison writes.

## Results and retained data

Exit code zero means all checks passed. A private local JSON report is saved in
`test-results/staging-smoke/staging-smoke-<run-id>.json` (ignored by Git), with
appointment IDs, capacity snapshots, notification summaries and request status/
time-to-headers measurements. Passwords, hashes, cookies, tokens and response
bodies are excluded. Failures after provisioning also produce a report.

The five accounts and bookings remain in staging for inspection, labeled with the
unique run ID and `[STAGING SMOKE]`. Re-running creates a new set and consumes
additional staging capacity. No existing bookings are deleted or cancelled. A
partial failure can leave active holds until their configured expiry. Review the
report and staging records before repeating a failing run. Five login API calls
precede the booking traffic; repeatedly starting runs can trigger Better Auth's
own login rate limiting. No application rate limits are disabled by the runner.

If the run reaches booking completion but fails notification checks, inspect the
staging notification settings and any due-job backlog. The runner requires five
suppressed confirmation emails; it does not silently pass an empty queue.

## Cloudflare challenge prerequisite

On October 20, 2026, the runner received HTTP 403 with `cf-mitigated: challenge`
from the edge, before the Worker. The runner's observed public IPv4 was
`199.255.187.181`; preflight Ray ID was `a4dbb353297ccbc5-IAD`. These are diagnostic
observations, not permanent configuration. Recheck the actual IP for each runner
and inspect **bidtrice.com → Security → Events** to identify the issuing service
and rule. Wrangler's current OAuth permissions do not allow reading WAF rulesets.

When the issuing service supports an exception, limit it to **both** the staging
hostname and the current runner IP, for example:

```text
(http.host eq "staging-consign.bidtrice.com" and ip.src eq 199.255.187.181)
```

For a custom rule issuing a challenge, exclude only this condition from that
rule, or place a suitable scoped Skip rule before it. For a managed security
product, skip only the identified product. Keep exception logging enabled and
remove the temporary exception after testing. Do not add an account-wide IP
allowlist, disable production protections, or trust a client header as the only
condition.

[Cloudflare's Skip-rule documentation](https://developers.cloudflare.com/waf/custom-rules/skip/)
explains the supported features. In particular, Free-plan Bot Fight Mode cannot
be skipped by a custom rule. If that is the issuing service, do not disable it
zone-wide just to run this test; choose an approach that retains production
protection. Application Turnstile test keys do not bypass an edge challenge.

After the scoped access change, rerun preflight. Only proceed to the full test
when it returns the application's actual login form with HTTP 200.
