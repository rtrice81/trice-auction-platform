# Staging concurrency smoke tests

Run after the manual smoke test, staging deployment, and seed have passed:

```sh
npm run smoke:staging -- --preflight
npm run smoke:staging
npm run smoke:staging -- --customers 20
```

The runner uses Node's HTTP client and the installed Wrangler/Better Auth
dependencies. It does not require k6 or any new packages. This is a small
correctness test with five customers by default, or 20 when explicitly selected.
Other load sizes are refused. This is not a throughput benchmark.

## What happens

1. Validate the actual Wrangler staging config, fixed database ID, separate R2,
   auth origin, Turnstile test mode, and log-only notification settings.
2. GET the staging login form. Stop immediately if Cloudflare challenges the
   runner, the app is unavailable, or a redirect points outside staging. The
   `--preflight` option stops here and creates no fixtures.
3. Read staging's database marker and select the latest future seeded drop-off
   date belonging to `[STAGING] Load test`. Confirm spare daily/Smalls capacity
   for the selected number of loads. Keep other booking activity off that date
   during the test.
4. Create the selected number of **new** `[STAGING SMOKE]` consignors with unique `example.invalid`
   addresses and valid Better Auth credential issuers. A random shared password
   exists only in process memory; it is never printed, written in plaintext, or
   applied to the original 100 seed customers. Hash SQL uses a private temporary
   file that is removed afterward.
5. Log in customers sequentially, with separate cookie jars and at least four
   seconds between login starts. The installed Better Auth version limits
   sensitive endpoints to three requests per ten seconds. Twenty logins take
   at least 76 seconds; booking concurrency begins only after all have logged in.
   Load the real booking forms to obtain separate booking-attempt cookies.
6. Submit all reservation requests concurrently through the application's
   `/dropoffs/:id/book` action; verify the expected active holds and total points.
7. Submit all completion requests concurrently. Replay one completion using its
   original booking-attempt cookie to check duplicate replay protection. This
   replay is sequential; a simultaneous duplicate-submit race is a later test.
8. Query staging D1 to verify exactly one scheduled booking per customer,
   distinct converted holds, 100% allocations, the expected capacity-point
   increase, and zero remaining active holds for this run.
9. Verify all bookings have suppressed email confirmations, and every sent
   notification for these bookings has a `suppressed:email` or `suppressed:sms`
   provider marker. Future pending reminders and cancelled jobs are allowed.

The selected load is the cheapest active load type, allocated 100% to Smalls.
With the current seed configuration, five Car Loads consume 50 daily and 50
Smalls capacity points; twenty consume 200 points each. This checks accounting under spare capacity; testing the
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

### Verified live run — October 20, 2026

Run `staging-smoke-1792538507920-3ae656eb` passed against the October 31 seeded
drop-off date after the hostname-and-IP bot exception was deployed:

- Five concurrent reservations returned HTTP 200; five completions returned 302.
- Appointments 2–6 were created, one per synthetic customer, with distinct
  converted holds and no remaining active holds for the run.
- Replaying a completed attempt returned HTTP 400 and created no duplicate.
- Daily and Smalls booked capacity increased from 0 to 50 points each.
- Five confirmation emails were recorded as `sent` with `suppressed:email`.
  Ten future reminder jobs remain pending, as expected.
- Time to response headers was 849–1097 ms for reservations and 1209–1283 ms for
  completions. This single small run establishes correctness, not load capacity.

The first attempt stopped after provisioning five accounts because Wrangler's
file-import command printed progress before its JSON result, despite `--json`.
It created no bookings. The parser now handles that output and has a regression
test. The original 100 seeded account passwords were unchanged throughout.

### Twenty-customer attempt — October 20, 2026

The 20-customer scenario did **not** reach the concurrent booking phase:

- `staging-smoke-1792538811951-89eb51b9`: stopped on customer 10's booking-page
  GET with HTTP 503 after successful logins. No reservation/completion POSTs ran.
- `staging-smoke-1792538950890-a37f381e`: stopped on customer 1's sign-in with
  HTTP 503 / Cloudflare Error 1102. Worker tail confirmed `outcome=exceededCpu`
  and `cpuTime=10` ms for the sign-in request.
- Each attempt provisioned 20 separate synthetic customers. They are retained
  for inspection. Neither attempt created bookings or holds.

This is a failed preparation phase, not a successful 20-customer concurrency
result. The runner does not retry failed booking requests or conceal 503s.
Subsequent availability probes could succeed, but the resource failure recurred
on authentication, so no further load attempts were made.

The 10 ms observed ceiling matches the
[Workers Free CPU limit](https://developers.cloudflare.com/workers/platform/limits/).
The deployed staging Worker has no explicit CPU limit override. Its usage model
is `standard`; that label alone does not establish a paid subscription. The
current API credentials cannot read account subscription information; the
operator confirmed **Workers Free** during this investigation. Manage
the **Workers** subscription in Cloudflare's account settings; the zone's
Free/Pro/Business plan is a separate product. If Workers Paid is already active,
investigate why this Worker is still hitting a 10 ms ceiling before rerunning.
Do not weaken password hashing or production protections to avoid this failure.
Once the runtime limit is resolved, rerun the explicit 20-customer command above.

The test accounts and bookings remain in staging for inspection, labeled with the
unique run ID and `[STAGING SMOKE]`. Re-running creates a new set and consumes
additional staging capacity. No existing bookings are deleted or cancelled. A
partial failure can leave active holds until their configured expiry. Review the
report and staging records before repeating a failing run. Paced login API calls
precede the booking traffic; other simultaneous login traffic can trigger Better Auth's
own login rate limiting. No application rate limits are disabled by the runner.

If the run reaches booking completion but fails notification checks, inspect the
staging notification settings and any due-job backlog. The runner requires the selected number of
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
