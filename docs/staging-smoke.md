# Staging concurrency smoke tests

Run after the manual smoke test, staging deployment, and seed have passed:

```sh
npm run smoke:staging -- --preflight
npm run smoke:staging
npm run smoke:staging -- --customers 20
npm run smoke:staging -- --customers 100
```

The runner uses Node's HTTP client and the installed Wrangler/Better Auth
dependencies. It does not require k6 or any new packages. This is a small
correctness test with five customers by default, or 20 or 100 when explicitly
selected. Other load sizes are refused. This is not a sustained throughput benchmark.

## What happens

1. Validate the actual Wrangler staging config, fixed database ID, separate R2,
   auth origin, Turnstile test mode, and log-only notification settings.
2. GET the staging login form. Stop immediately if Cloudflare challenges the
   runner, the app is unavailable, or a redirect points outside staging. The
   `--preflight` option stops here and creates no fixtures.
3. Read staging's database marker and check future seeded drop-off dates belonging
   to `[STAGING] Load test`, latest first. Select the first date with enough spare
   daily **and** Smalls capacity for the selected load, counting existing bookings
   and active holds. Stop before creating customers if none has sufficient space.
   Keep other booking activity off the selected date during the test. Existing
   bookings and capacity settings are not changed to make room.
4. Create the selected number of **new** `[STAGING SMOKE]` consignors with unique `example.invalid`
   addresses and valid Better Auth credential issuers. A random shared password
   exists only in process memory; it is never printed, written in plaintext, or
   applied to the original 100 seed customers. Hash SQL uses a private temporary
   file that is removed afterward.
5. Log in customers sequentially, with separate cookie jars and at least four
   seconds between login starts. The installed Better Auth version limits
   sensitive endpoints to three requests per ten seconds. Twenty logins take
   at least 76 seconds; 100 take at least 396 seconds (6 minutes 36 seconds).
   Booking concurrency begins only after all have logged in.
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
Smalls capacity points; twenty consume 200 points each and 100 consume 1000.
This checks accounting under spare capacity; testing the
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

### Verified twenty-customer run after Workers Paid upgrade — October 20, 2026

After the operator upgraded the Workers subscription, run
`staging-smoke-1792539250263-9566e0ba` passed against the October 31 seeded
drop-off date:

- All 20 paced logins and booking-page loads succeeded. Twenty reservation POSTs
  were then issued concurrently, followed by twenty concurrent completion POSTs.
- Twenty scheduled appointments (IDs 7–26) were created with distinct converted
  holds, correct allocations and no leftover active holds.
- A completion replay returned HTTP 400 and created no extra appointment.
- Daily and Smalls booked capacity each increased by exactly 200 points, from
  50 to 250. These bookings remain in staging with their run marker.
- All 20 confirmation emails were suppressed. Forty future email reminders
  remain pending, as expected; no external email delivery occurred.
- Across 87 observed Worker invocations during monitoring, all outcomes were
  `ok`. Maximum observed CPU time was 200 ms; no CPU-limit failures recurred.

Time to response headers for this small sample:

| Phase | Median | p95 | Maximum |
| --- | --- | --- | --- |
| Reservation (20 concurrent) | 2266 ms | 2540 ms | 2685 ms |
| Completion (20 concurrent) | 3242.5 ms | 3290 ms | 3313 ms |

The private local report is
`test-results/staging-smoke/staging-smoke-1792539250263-9566e0ba.json`.
This validates correctness under spare capacity with 20 customers. It does not
establish maximum throughput or verify a race for the final available slot.

### Hundred-customer preparation and CPU configuration — October 20, 2026

The first 100-customer attempt, `staging-smoke-1792539518394-ebcc4192`, selected
October 30 because October 31 already consumed 250 of its 1200 points and could
not accommodate another 1000. It provisioned 100 synthetic customers, then
stopped at customer 93's login with HTTP 503 / Error 1102. Worker tail reported
`exceededCpu` at 116 ms. No reservation or completion requests had started, so
the attempt created no bookings or holds.

The account had already been upgraded to Workers Paid, but the active staging
version advertised no explicit CPU limit. Staging was then configured and
deployed with `limits.cpu_ms=1000`. The API confirmed this exact limit on version
`45fc4da9-4ade-4f7d-b390-d29d6fb732a2`, along with the dedicated staging D1 and
R2 bindings. Production CPU configuration, authentication security and rate limits
were left unchanged. Both source and generated-build validation now enforce the
explicit staging allowance. This is one second of CPU, separate from elapsed
time waiting on D1/network I/O; it requires Workers Paid.

### Hundred-customer booking result — failed end-to-end check

With the explicit CPU allowance, run `staging-smoke-1792540070649-6894df03`
authenticated all 100 customers and reached both concurrent booking phases:

- All 100 reservation requests returned HTTP 200.
- Completion returned HTTP 302 for 99 customers and HTTP 500 for customer 99.
  The failure occurred after 2073 ms and was not an edge CPU/resource-limit page.
- A read-only audit found **100 scheduled bookings**, IDs 27–126, for 100 distinct
  customers, with 100 distinct converted holds. Every appointment had allocations
  totaling 100% and 10 capacity points. No active holds remained for this run.
- October 30's daily and Smalls usage each increased from 0 to 1000 points,
  within the date's 1200-point capacities. There was no observed overbooking.
- Customer 99's booking **61** committed despite the HTTP 500. That booking has
  no confirmation or reminder jobs. The other 99 bookings each have a suppressed
  confirmation and two pending future email reminders. No external email was sent.
- The duplicate-completion replay was **not run**, because the scenario stopped
  after the completion error. No booking request was blindly retried.
- All 423 observed Worker invocation outcomes were `ok`, with maximum CPU time
  262 ms. A handled application HTTP 500 can still have Worker outcome `ok`;
  this is not evidence that every request succeeded.

| Phase | Successful responses | Median time to headers | p95 | Maximum |
| --- | --- | --- | --- | --- |
| Reservation | 100/100 | 8936.5 ms | 10327 ms | 10743 ms |
| Completion | 99/100 | 15323 ms | 16140 ms | 17145 ms |

The report remains `passed=false`:
`test-results/staging-smoke/staging-smoke-1792540070649-6894df03.json`.
It includes the original HTTP results and a separately labeled `postFailureAudit`
with the database findings. The audit does not turn the failed HTTP scenario into
a pass.

Investigate the saved Worker logs for Ray **a4dbf2fbccb7c207-IAD**, staging
version `45fc4da9-4ade-4f7d-b390-d29d6fb732a2`, request
`POST /dropoffs/4/book`. The current Wrangler OAuth token can live-tail but cannot
query persisted Workers Observability logs; that API returned HTTP 403. The exact
server exception has not been retrieved, so a specific database or code cause
has not been established. The confirmed defect is a committed booking presented
as a failure, with its notification jobs missing. Address that post-commit failure
and notification reliability before increasing concurrency or calling 100 users
supported. All records remain in staging for inspection; production was untouched.

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
