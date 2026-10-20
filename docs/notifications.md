# Transactional notifications

This milestone sends only appointment and operational messages. It does not add marketing email or promotional SMS.

## Cloudflare configuration

Provider selections and non-secret delivery identity settings are managed in **Admin → Notifications** and stored in D1. API credentials are Worker secrets only; they are never stored in D1 or returned by the admin loader.

Set the required Worker secrets (without placing their values in source control):

```sh
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put TELNYX_API_KEY
npx wrangler secret put TELNYX_WEBHOOK_PUBLIC_KEY
npx wrangler secret put APP_BASE_URL
```

`TELNYX_WEBHOOK_PUBLIC_KEY` is required by the inbound SMS webhook signature verification. The admin page can show whether it is configured, but never its value. Legacy environment values `RESEND_FROM_EMAIL` and `TELNYX_FROM_NUMBER` are supported as fallbacks; set the sender address and sender number in Admin → Notifications for the managed configuration.

The Worker cron (`*/5 * * * *`) processes the D1 `notification_jobs` outbox. Jobs use unique idempotency keys and are atomically claimed, so duplicate cron invocations cannot send a claimed job twice. Failed jobs retry up to three attempts.

Before running locally or deploying, apply migrations: `npx wrangler d1 migrations apply trice_auction_db --local` for local development, and the same command with `--remote` for the production D1 database.

## Appointment links in templates

`{{appointment_link}}` represents the complete absolute appointment URL. Use it by itself, without a domain prefix. Preview, test notifications, and customer delivery share the same URL helper and plain-text renderer.

The application origin comes from `APP_BASE_URL`, falling back to `BETTER_AUTH_URL`. Both support production or local HTTP(S) URLs. Request-based previews and test sends fall back to the request origin if neither is configured; scheduled delivery requires one of these settings because cron has no request URL.

Set production `APP_BASE_URL` to `https://consign.bidtrice.com` when prompted by `wrangler secret put APP_BASE_URL`. This makes customer links use the public custom domain even if the authentication URL or request origin uses the Workers hostname. Keep the local `APP_BASE_URL` in `.dev.vars` pointed at the local application, as shown in `.dev.vars.example`.

Existing saved templates such as `https://consign.bidtrice.com/{{appointment_link}}` are normalized when loaded, rendered, and saved. Only the redundant origin immediately preceding a supported `*_link` placeholder is removed; surrounding custom content is preserved. No database migration is needed. The `appointment_link`, `customerAppointmentsUrl`, and `adminPickupUrl` variables contain complete usable URLs; do not add a domain prefix to them.

## Email domain

Add the sending domain/subdomain in Resend and publish the Resend-provided SPF and DKIM DNS records. Publish a DMARC record for the organizational domain, beginning with a monitoring policy and moving to enforcement after aligned traffic is confirmed. Do not send production mail until Resend reports the domain as verified.

## Telnyx

Configure the inbound messaging webhook as `POST /webhooks/telnyx/sms`. The Worker verifies Telnyx's Ed25519 timestamped signature using `TELNYX_WEBHOOK_PUBLIC_KEY` before processing keywords. `STOP` disables SMS and records an opt-out timestamp; `START` records renewed consent; `HELP` is accepted for provider/help handling. Telnyx provider-level opt-outs should also remain enabled in the Telnyx portal.

## Consignment pickup notifications

Admin pickup saves queue `pickup_created`, `pickup_rescheduled`, `pickup_cancelled`, and `pickup_completed` through the existing `notification_jobs` outbox and Resend provider. Date or arrival-time changes generate reschedule events; unrelated edits do not. Cancellation and completion require a status transition. A revision check rejects competing writes and revision-based idempotency keys prevent duplicate queueing. Loaders and revalidation never queue notifications.

Apply migration `0040_add_pickup_notifications.sql` before running the updated app. Existing internal recipients start with pickup subscriptions off. In `/admin/notifications`, enable the desired pickup event types and select subscriptions for each active internal recipient. Recipient creation, activation, and all event subscriptions are also available in `/admin/notification-recipients`. All settings remain admin-only. Global email disable and per-type disable suppress pickup delivery.

Pickup templates are editable in Notifications and use the existing plain-text email style. Supported pickup variables include `customerName`, `consignorNumber`, `pickupTitle`, `pickupDate`, `pickupTime`, `pickupAddress`, `contactName`, `contactPhone`, `estimatedLoad`, `estimatedSmalls`, `estimatedLargeFurniture`, `estimatedOutdoor`, `adminPickupUrl`, `previousPickupDate`, `previousPickupTime`, `actorName`, and `completedAt`. The date and clock fields represent America/New_York local time, and completion timestamps are formatted in that timezone. `adminPickupUrl` is a complete internal admin URL using `APP_BASE_URL` or `BETTER_AUTH_URL`. The legacy `pickupUrl` alias remains supported for saved internal templates only. Migration 0041 renames that placeholder in existing internal templates without changing custom wording.

Pickup writes complete before notification queueing is attempted. Queue failures log only the pickup ID and event types; delivery failures use a generic error and the existing retry mechanism. Failed queue attempts do not roll back pickup changes and require operational follow-up. Customer emails are now automatically queued separately for creation, rescheduling, cancellation, and completion. They respect the assigned customer’s email preference, active account state, global email enablement, and the corresponding pickup event setting. Internal recipient subscriptions remain separate; an assigned customer on the internal recipient list receives only their customer email. There is currently no pickup reminder or pickup SMS notification.

Apply `0041_add_customer_pickup_notification_templates.sql` before deploying. Customer templates are `customer_pickup_created`, `customer_pickup_rescheduled`, `customer_pickup_cancelled`, and `customer_pickup_completed`. They expose only customer name, pickup title/date/time/address/contact, previous date/time, and `{{customerAppointmentsUrl}}`. This URL points to `/my-appointments`, using the same configured application origin; production `APP_BASE_URL=https://consign.bidtrice.com` produces `https://consign.bidtrice.com/my-appointments`. Default wording is “View your appointment”. The customer outbox payload excludes internal notes, access instructions, load estimates, staff assignments, actor identity, and audit metadata.

Customer templates reject admin links and internal placeholders. Customer delivery rechecks ownership, current email, active account state and email preference, and suppresses stale/reassigned messages. Legacy internal pickup jobs addressed to the assigned customer are rendered using the separate customer template. Customer messages always include the My Appointments link. Internal recipients continue to get `/admin/pickups/:id`; unrelated customer accounts configured as internal recipients are suppressed. The customer portal’s ownership checks are unchanged.
