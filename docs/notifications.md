# Transactional notifications

This milestone sends only appointment and operational messages. It does not add marketing email or promotional SMS.

## Cloudflare configuration

Set these as Worker secrets (never D1 values or browser variables): `RESEND_API_KEY`, `TELNYX_API_KEY`, and `TELNYX_WEBHOOK_PUBLIC_KEY`. Configure `RESEND_FROM_EMAIL` (for example `Trice Auctions <appointments@notify.bidtrice.com>`), `TELNYX_FROM_NUMBER` (a verified toll-free or registered 10DLC business number), and `APP_BASE_URL` as Worker environment variables/secrets.

The Worker cron (`*/5 * * * *`) processes the D1 `notification_jobs` outbox. Jobs use unique idempotency keys and are atomically claimed, so duplicate cron invocations cannot send a claimed job twice. Failed jobs retry up to three attempts.

Before running locally or deploying, apply migrations: `npx wrangler d1 migrations apply trice_auction_db --local` for local development, and the same command with `--remote` for the production D1 database.

## Email domain

Add the sending domain/subdomain in Resend and publish the Resend-provided SPF and DKIM DNS records. Publish a DMARC record for the organizational domain, beginning with a monitoring policy and moving to enforcement after aligned traffic is confirmed. Do not send production mail until Resend reports the domain as verified.

## Telnyx

Configure the inbound messaging webhook as `POST /webhooks/telnyx/sms`. The Worker verifies Telnyx's Ed25519 timestamped signature using `TELNYX_WEBHOOK_PUBLIC_KEY` before processing keywords. `STOP` disables SMS and records an opt-out timestamp; `START` records renewed consent; `HELP` is accepted for provider/help handling. Telnyx provider-level opt-outs should also remain enabled in the Telnyx portal.
