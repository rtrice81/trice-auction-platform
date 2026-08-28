# Production smoke-test runbook

## Deployment facts

- Workers development URL: `https://trice-auction-platform.auctioneer-80b.workers.dev`
- Custom domain: not configured.
- Production D1 binding: `trice_auction_db` → `trice-auction-db`.
- Required Worker secrets (configured by name only): `AUTH_SECRET`, `BETTER_AUTH_URL`.
- Better Auth base URL: the HTTPS Workers development URL above. Production cookies remain secure because `auth.server.ts` enables secure cookies in production.

## Account preparation

1. Register four normal accounts through the deployed application: one each for customer, employee, manager, and admin testing. Never place credentials in this repository.
2. Choose the account that will become the initial admin and provide its exact email to an authorized Cloudflare operator.
3. After confirming the account has registered, the operator runs:

   ```sh
   npx wrangler d1 execute trice-auction-db --remote --command "UPDATE users SET role = 'admin', active = 1 WHERE email = 'EXACT_EMAIL';"
   npx wrangler d1 execute trice-auction-db --remote --command "SELECT email, role, active FROM users WHERE email = 'EXACT_EMAIL';"
   ```

4. Sign in as the initial admin, then use **Admin users** to assign `employee` and `manager` roles to the remaining existing accounts. Keep at least one active admin.

## Authentication

- Register an account; confirm the new application-user role is `customer`.
- Login and logout; login should establish a secure HTTPS session cookie.
- Deactivate a test account as admin; confirm its next protected request redirects to login or is denied.

## Customer

- Create a booking with all active area percentages totaling exactly 100%.
- Submit non-100% allocations and confirm the validation error is clear.
- Reach the monthly booking limit and confirm further bookings are rejected.
- Use capacity-consuming bookings to confirm daily and area limits are enforced.
- Use **My Appointments** to edit/reschedule and cancel a booking.
- With a second customer session, change appointment IDs in URLs and confirm no private appointment is exposed.
- As admin, close a future date in **Schedule**; customer booking must be rejected while existing appointments remain visible.

## Employee

- Confirm the employee dashboard lists today’s scheduled appointments.
- Save internal notes, then mark an appointment checked in and completed.
- Confirm `/manager` and every `/admin/*` URL is denied for the employee.

## Manager

- Confirm the manager dashboard lists appointments and can edit another customer’s appointment.
- Confirm ordinary edits obey monthly, daily, and area capacity validation.
- Submit an over-capacity edit: normal save must fail; override must require a non-empty reason.
- Submit a valid explicit override and verify the read-only audit history includes the reason, violations, before/after values, and capacity context.
- Confirm `/admin/*` is denied for the manager.

## Admin

- In **Admin users**, change roles and activate/deactivate non-admin users; confirm self-role changes and removal of the final active admin are blocked.
- In **Capacity**, change global daily and item-area settings.
- In **Schedule**, close/open a date, set daily and per-area overrides (including overflow), then reset to defaults.
- Confirm existing date appointments remain visible after closure.

## Direct authorization checks

While signed in as a customer, verify `/employee`, `/manager`, and `/admin/users`, `/admin/capacity`, and `/admin/schedule` return access denied or redirect to login. As employee, verify `/manager` and all admin URLs are denied. Override submissions must remain unavailable and denied unless the server-authenticated role is manager or admin.
