# Turnstile and public-form protection

Public registration and logged-out drop-off requests use several server-side checks: a hidden decoy field, a signed form-start token with a two-second minimum completion time, a D1-backed rate limit, and Cloudflare Turnstile Siteverify. Authenticated booking and internal staff forms are not challenged.

## Local development and automated tests

Copy `.dev.vars.example` to `.dev.vars`. It contains Cloudflare's official always-pass Turnstile test site key and secret, which are safe only for development and automated testing.

## Production

1. Create a Turnstile widget in the Cloudflare dashboard for the production hostname.
2. Set `TURNSTILE_SITE_KEY` as a Worker environment variable.
3. Store `TURNSTILE_SECRET_KEY` as a Worker secret, for example:

   ```sh
   npx wrangler secret put TURNSTILE_SECRET_KEY
   ```

4. Ensure `AUTH_SECRET` remains configured as a Worker secret. It signs the short-lived form-start tokens.

Never commit production Turnstile secrets or `.dev.vars`. The server validates the Turnstile token with Cloudflare Siteverify before creating accounts or pending booking records.
