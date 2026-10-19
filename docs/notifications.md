# Transactional notifications

This milestone sends only appointment and operational messages. It does not add marketing email or promotional SMS.

## Cloudflare configuration

Provider selections and non-secret delivery identity settings are managed in **Admin → Notifications** and stored in D1. API credentials are Worker secrets only; they are never stored in D1 or returned by the admin loader.

Set the required Worker secrets (without placing their values in source control):

```sh
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put TELNYX_API_KEY
npx wrangler secret put TELNYX_WEBHOOK_PUBLIC_KEY
```

`TELNYX_WEBHOOK_PUBLIC_KEY` is required by the inbound SMS webhook signature verification. The admin page can show whether it is configured, but never its value. Legacy environment values `RESEND_FROM_EMAIL` and `TELNYX_FROM_NUMBER` are supported as fallbacks; set the sender address and sender number in Admin → Notifications for the managed configuration.

The Worker cron (`*/5 * * * *`) processes the D1 `notification_jobs` outbox. Jobs use unique idempotency keys and are atomically claimed, so duplicate cron invocations cannot send a claimed job twice. Failed jobs retry up to three attempts.

Before running locally or deploying, apply migrations: `npx wrangler d1 migrations apply trice_auction_db --local` for local development, and the same command with `--remote` for the production D1 database.

## Email domain

Add the sending domain/subdomain in Resend and publish the Resend-provided SPF and DKIM DNS records. Publish a DMARC record for the organizational domain, beginning with a monitoring policy and moving to enforcement after aligned traffic is confirmed. Do not send production mail until Resend reports the domain as verified.

## Telnyx

Configure the inbound messaging webhook as `POST /webhooks/telnyx/sms`. The Worker verifies Telnyx's Ed25519 timestamped signature using `TELNYX_WEBHOOK_PUBLIC_KEY` before processing keywords. `STOP` disables SMS and records an opt-out timestamp; `START` records renewed consent; `HELP` is accepted for provider/help handling. Telnyx provider-level opt-outs should also remain enabled in the Telnyx portal.

## Consignment pickup notifications

Admin pickup saves queue `pickup_created`, `pickup_rescheduled`, `pickup_cancelled`, and `pickup_completed` through the existing `notification_jobs` outbox and Resend provider. Date or arrival-time changes generate reschedule events; unrelated edits do not. Cancellation and completion require a status transition. A revision check rejects competing writes and revision-based idempotency keys prevent duplicate queueing. Loaders and revalidation never queue notifications.

Apply migration `0040_add_pickup_notifications.sql` before running the updated app. Existing internal recipients start with pickup subscriptions off. In `/admin/notifications`, enable the desired pickup event types and select subscriptions for each active internal recipient. Recipient creation, activation, and all event subscriptions are also available in `/admin/notification-recipients`. All settings remain admin-only. Global email disable and per-type disable suppress pickup delivery.

Pickup templates are editable in Notifications and use the existing plain-text email style. Supported pickup variables include `customerName`, `consignorNumber`, `pickupTitle`, `pickupDate`, `pickupTime`, `pickupAddress`, `contactName`, `contactPhone`, `estimatedLoad`, `estimatedSmalls`, `estimatedLargeFurniture`, `estimatedOutdoor`, `pickupUrl`, `previousPickupDate`, `previousPickupTime`, `actorName`, and `completedAt`. The date and clock fields represent America/New_York local time, and completion timestamps are formatted in that timezone. `pickupUrl` is a complete internal admin URL using `APP_BASE_URL` or `BETTER_AUTH_URL`.

Pickup writes complete before notification queueing is attempted. Queue failures log only the pickup ID and event types; delivery failures use a generic error and the existing retry mechanism. Failed queue attempts do not roll back pickup changes and require operational follow-up. No customer pickup email or SMS is sent. The event payload and editable templates can support a separate customer audience later without changing the outbox.
