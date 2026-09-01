# Public beta operations

## Required configuration

Keep `.dev.vars` local and untracked. Copy `.dev.vars.example` for local development:

```sh
cp .dev.vars.example .dev.vars
```

- `AUTH_SECRET` — a high-entropy Better Auth signing secret; required in local and production environments.
- `BETTER_AUTH_URL` — the public application URL used by Better Auth. Use `http://127.0.0.1:5173` locally and the deployed Workers URL in production.
- `trice_auction_db` — the D1 binding declared in `wrangler.jsonc`; it is not a browser-visible variable.
- `branding_assets` — the private R2 binding used for the uploaded site logo. Create the bucket once before local or production use; the Worker serves the logo and no R2 credentials are sent to the browser.

Create the configured R2 bucket (change the name in `wrangler.jsonc` first if your environment needs a different name):

```sh
npx wrangler r2 bucket create trice-auction-branding
```

For local development, Wrangler provides the binding when `npm run dev` runs. Use `npx wrangler r2 object put trice-auction-branding/.keep --local --file public/favicon.ico` once if you need to initialize a local R2 data directory manually. Do not add R2 access keys, account credentials, or public bucket URLs to `.dev.vars` or client code.

For production, configure secrets before deploy:

```sh
npx wrangler secret put AUTH_SECRET
npx wrangler secret put BETTER_AUTH_URL
```

Do not put either value in `wrangler.jsonc`, client code, or Git.

## Bootstrap the first admin

Public registration deliberately creates only `customer` accounts. For local development, register or log in once, then promote that existing local D1 user:

```sh
npm run admin:promote-local -- person@example.com
```

The command always targets local D1, never the production database, and exits without changing anything when the email is absent.

### Reset an existing admin password

Use this only for an existing, active application user whose role is already `admin`. The command verifies the linked Better Auth identity and existing password credential before it prompts twice for a new password. It does not create users, alter roles, or revoke sessions. Password input is not printed or logged.

Local D1 is the default:

```bash
npm run admin:reset-password -- admin@example.com
```

Production D1 requires the explicit `--remote` flag:

```bash
npm run admin:reset-password -- admin@example.com --remote
```

The command uses Better Auth's password hashing implementation before updating the existing credential record; it never stores plaintext passwords.

For the first production admin, use an authenticated Cloudflare operator session after the user has registered normally. Verify the email carefully, run a one-off remote D1 update, then confirm the result:

```sh
npx wrangler d1 execute trice-auction-db --remote --command "UPDATE users SET role = 'admin', active = 1 WHERE email = 'person@example.com';"
npx wrangler d1 execute trice-auction-db --remote --command "SELECT email, role, active FROM users WHERE email = 'person@example.com';"
```

This is an operator procedure, not a public route or application feature.

## Fresh database and deployment

Run all migrations against a disposable fresh local D1 directory:

```sh
FRESH_D1_DIR="$(mktemp -d)"
npx wrangler d1 migrations apply trice-auction-db --local --persist-to "$FRESH_D1_DIR"
```

For a production release, apply migrations to the configured D1 database, build, then deploy. Do not deploy until `AUTH_SECRET` and `BETTER_AUTH_URL` are set:

```sh
npx wrangler d1 migrations apply trice-auction-db --remote
npm run build
npx wrangler deploy
```

The production binding is `trice_auction_db`, configured for D1 database `trice-auction-db` in `wrangler.jsonc`. No custom domain action is part of this procedure.

## Security review summary

- Registration writes the `customer` role server-side; no role field is accepted.
- Customer appointment loaders/actions enforce authenticated ownership.
- Employee, manager, and admin routes/actions require server-side RBAC checks; actor identity never comes from forms.
- Admin user, capacity, and schedule routes require `admin`; managers are not included.
- Branding uploads and removals re-check `admin` in their server action. Logos are validated by both declared MIME type and image bytes, limited to 2 MB, stored with generated R2 keys, and only R2 metadata is retained in D1.
- Inactive users resolve to no current user and cannot pass protected route checks.
- Authentication secrets and the D1 binding are used only from server loaders/actions/services; production client bundles do not import `auth.server`.

## Smoke-test checklist

- Register a new account; confirm it is a customer, then login/logout.
- Create a customer booking; verify the monthly limit and item-area capacity errors are clear.
- Close a date in Admin Schedule; confirm a customer booking is rejected and existing appointments remain visible.
- Verify My Appointments only lists the signed-in customer’s records.
- As employee, check in a scheduled appointment; confirm employee cannot open manager/admin pages.
- As manager, edit an appointment; exceed capacity, then confirm an override requires a reason and creates history.
- As admin, manage users, global capacity, and date-specific schedule capacity; reset a date to defaults.
- As admin, upload a PNG/JPEG/WebP logo from **System → Branding**, confirm it appears in the header, replace it, then remove it and confirm text branding returns. Confirm an oversized or unsupported upload is rejected and that each non-admin role receives 403 for `/admin/branding` and its POST action.
