# Waitlist and capacity: current operating procedure

This describes the code in the working checkout as reviewed on 30 October 2026, including uncommitted changes. It is a description of implementation, not a proposal or a statement of live database values. Settings can differ by environment. Points are internal units, not a count of appointments. References below are repository paths.

## 1. Overview

A **Booking Event** controls the public signup window and groups one or more **Drop-Off Dates**. Each date has an operational open/closed switch and capacity. Daily intake limits the total size of confirmed loads on that date; storage limits the portion allocated to each area. Both are measured in points. A date's displayed availability also includes temporary customer holds.

The waitlist represents unconfirmed appointments and has a separate point allowance for each storage area. Waitlisted appointments do not reserve confirmed daily or storage capacity. The underlying booking service can classify a request as waitlisted, but the current public reservation flow does not accept online waitlist requests; admin-created appointments are always confirmed. Existing waitlisted appointments can be manually approved. See `app/services/booking.server.ts`, `app/services/booking-event.server.ts`, and `app/services/booking-holds.server.ts`.

## 2. Capacity types

### Daily intake capacity

Each active load type has a point value. A confirmed appointment consumes its full load type value for its date, regardless of allocation. Scheduled, checked-in and completed appointments count; cancelled and waitlisted appointments do not. Unexpired active scheduled holds also count during public availability and booking validation. The global default and load types are configured at `/admin/capacity`; a date's saved daily value is edited at `/admin/schedule/:id`.

A request fails daily validation when used points plus its load points **exceed** the effective daily limit; equality is allowed. A full daily limit prevents new confirmed holds, although the public date badge has a separate waitlist calculation described below. Admin creation can override this limit.

### Storage capacity: Smalls, Large/Furniture and Outdoor

Each active area has a separately configured normal point limit. For each appointment, the user supplies whole-number area percentages totaling 100%. Area consumption is `load type points × percentage / 100`, rounded to four decimal places, and stored in `appointment_area_allocations`. For example, 30% of a 20-point load is 6 points, not 30 points. Confirmed usage is the sum of stored allocations for scheduled, checked-in and completed appointments for that date. Booking availability also includes active unexpired scheduled holds. Remaining is normal limit minus usage, floored at zero in the storage summary; percentage used is usage divided by the normal limit. The admin detail screen converts points to physical units using points per unit, and its summary excludes holds.

Smalls is initially seeded in shelves, Large/Furniture and Outdoor in square feet. Initial migration values were respectively 500, 400 and 350 normal points, but are editable and must not be assumed to be live values. Physical capacity and conversion factor are independently editable; their product is a displayed reference, **not** the enforced normal limit. Each area's confirmed limit is checked separately. If any of these three named active areas is already at or above its normal limit, the public date is marked Full and new public holds are rejected, even if the request allocates 0% to that area. See `customer-storage-capacity.ts`, `booking-event.server.ts`, `booking.server.ts`, and `schedule-management.server.ts`.

### Overflow capacity

Overflow exists as a separate **waitlist point allowance**, not extra confirmed customer storage. `/admin/capacity` calls it “Overflow allowance (points)”; the date form calls it “Waitlist capacity”. It is configured per area globally and on each date. The service tests waitlisted area allocations against this allowance; it does not add it to the normal confirmed limit. There is no separate count-of-people maximum. The public flow cannot currently consume the allowance, and admin creation bypasses both limits to create a confirmed appointment. Existing waitlisted records consume allowance; admin approval can exceed normal capacity. Overflow can influence the snapshot's Waitlist/Full badge, but cannot overcome the earlier rule that any named storage area already at 100% makes the date Full.

## 3. Global vs date-specific settings

`getEffectiveDateCapacity` resolves daily capacity as date `daily_capacity_override`, then date `capacity_points`, then the global daily setting. Each area's normal and overflow limits resolve independently from a non-null date override, otherwise the current global area value. New date forms are prefilled with globals, but creating or saving a date writes the daily value to both date columns and writes explicit area overrides. Therefore later global edits generally do **not** update those saved dates.

There is no capacity-override reset control in the current schedule forms: enter the desired values explicitly. If a date override is made NULL by some other means, area values fall back to global values; daily capacity falls back first to the saved `capacity_points`, not necessarily the current global setting. Saving the form makes explicit overrides again. Reservation hold duration is different: date override → Booking Event duration → global default, and choosing “Use Booking Event Setting” clears the date hold override (`date-capacity.server.ts`, `schedule-management.server.ts`, `booking-hold-duration.server.ts`).

## 4. Customer booking rules

For the current `/dropoffs/:eventId/book` flow:

1. The date must be public, linked to an active Booking Event and not past, with its operational switch open. Signup is open from the event's opening instant inclusive until its optional closing instant exclusive, in the event timezone (the current form requires America/New_York). Upcoming, closed and inactive events cannot start a booking. Listings have a separate visibility expiry at New York midnight after the close date, or the opening date if no close is set (`booking-event-visibility.js`).
2. The page computes its date badge from current capacity and holds. A Full date normally cannot start; a customer with an unexpired hold for that date can complete even if it has since become Full. A Waitlist badge displays a notice that online waitlist requests are unavailable and disables the reserve button.
3. On reserve, the route checks basic fields and, for anonymous visitors, public-form protection. `validateBooking` then checks input/date format, event eligibility, drop-off ban, active load type and one valid allocation for every active area totaling 100%, date configuration, monthly usage and capacity. A banned user cannot make a new booking; a same-date edit has a specific exception. Inactive users do not resolve as authenticated users (`auth.server.ts`). Anonymous validation uses user ID 0, before the eventual user is known.
4. The monthly limit counts the user's scheduled, waitlisted, checked-in and completed appointments in the calendar month of the requested date, excluding the appointment being edited; cancelled entries do not count. The global initial migration value was 2. A monthly violation and capacity errors can be returned together.
5. Reserve creates a timed confirmed-capacity hold using an atomic capacity predicate. If another customer takes the space first, the request fails and asks the customer to adjust or choose another date. The hold lasts the date override, event setting or global default (initial fallback 15 minutes). The customer must log in or register to complete it. An expired or changed request requires a new availability check.
6. Completion converts an unexpired matching hold into a scheduled appointment and queues a confirmation. It does **not** rerun `validateBooking`; the route rechecks date availability, with the Full exception for the hold. Consequently settings, ban, or monthly eligibility changes after reservation are not all revalidated at completion, and an anonymous hold is not rechecked against the eventual user's monthly count. A hold protects the capacity it reserved; later capacity reductions can leave it over the new limit.

## 5. “Full” rules

For an otherwise publicly eligible date, `getDateAvailability` first marks it **Full if any one** of active Smalls, Large/Furniture or Outdoor has confirmed usage plus active holds at or above its normal capacity, including zero capacity. All three need not be full, and overflow does not change this check. A new hold independently enforces the same all-three-open rule, including areas receiving 0% of the request.

The snapshot then checks whether any active load type fits remaining daily points and can fit wholly into at least one area's remaining normal capacity. If not, it checks whether any load type fits wholly into at least one area's remaining waitlist allowance. If neither fits, the date is Full; if only the latter fits, it is labelled Waitlist. **Daily intake being full alone can thus produce Waitlist rather than Full**, even though actual validation rejects a request exceeding daily capacity and public waitlist submission is disabled. Conversely a request can fail even while a date is Available, because its particular load and allocation do not fit. The snapshot is an estimate, not the exact submitted allocation test. An open Booking Event is labelled full when all its dates are Full (`booking-event.server.ts`).

## 6. Waitlist behavior

The underlying `getCapacityEvaluation` considers a request for the waitlist when any requested area would exceed normal capacity, provided the full load also fits daily capacity and **every** area's existing waitlist allocation plus the request's allocation fits that area's overflow allowance. If an allowance would be exceeded it returns “The waitlist is full” for the affected areas. Equality fits. This is a per-area point limit, not a separate daily waitlist limit or headcount.

The public hold service rejects a waitlisted result, so customers cannot join automatically through the current booking form. Admin creation creates a scheduled appointment even if capacity or the waitlist is full; it does not add a waitlisted entry. The generic booking service contains waitlisted persistence, but the current public and admin creation flows do not expose a way to create a waitlisted entry. Manager paths call that service for edits, which use a separate update path. Waitlist records use the appointment date; the Booking Event is associated indirectly through the date, not stored on the appointment. Waitlisted allocations count toward waitlist allowance and the monthly booking limit, not confirmed daily/storage usage. They do not reserve a confirmed place.

## 7. Waitlist promotion

**Manual promotion is implemented; automatic promotion is not.** An admin opens a waitlisted appointment and approves it at `/admin/appointments/:id`. The action calls `promoteWaitlistedAppointment` with capacity override enabled, revalidates other rules, changes the status to scheduled, records an override audit, and queues a `waitlist_confirmed` customer notification subject to notification settings and preferences. It does not schedule reminders in this action. The appointment's saved allocations become confirmed usage immediately; there is no separate reservation or offer period. The admin can approve despite insufficient capacity. No FIFO enforcement selects the next person: the schedule lists waitlisted records first by waitlisted time, creation time and ID, but the admin chooses which to approve. Cancellation and capacity changes do not trigger promotion (`admin.appointments.detail.tsx`, `booking.server.ts`).

## 8. Cancellation behavior

Customers and admins can cancel scheduled or waitlisted appointments through their appointment detail actions. Status becomes `cancelled`; the record and allocations remain, but usage queries exclude them. Thus confirmed daily/storage points, or waitlist allowance for a cancelled waitlisted entry, are released on the next calculation. Availability is calculated from current records on subsequent reads, not permanently set to open. A cancelled appointment no longer counts toward the monthly limit. No waitlist entry is automatically promoted or otherwise changed.

The system cancels future reminders and queues the appropriate customer cancellation or waitlist-cancellation notification, plus an internal appointment-cancellation activity notification. Delivery depends on configured recipients, channels, preferences and provider operation; a queued job is not proof of delivery (`notification.server.ts`, `internal-appointment-notifications.server.ts`).

## 9. Admin appointment behavior

Admin creation, including the schedule and appointment entry points, requires an active admin and an existing customer. It validates input, active load/area allocations, configured date and drop-off ban, but bypasses public signup eligibility and a closed date. It automatically bypasses daily, normal storage and waitlist capacity failures and always saves status `scheduled`; the saved appointment counts in actual confirmed usage and can exceed the limits. A repeat appointment in the same calendar month prompts for explicit confirmation even if the configured customer monthly limit has not yet been reached; confirmation also permits the monthly-limit violation. Capacity override does not substitute for monthly confirmation.

The creation service records `appointment_override_audits` when monthly confirmation, capacity or public/date availability is overridden, with actor, rules and context; ordinary creation without these conditions does not create that override audit. Creation queues normal customer and internal notifications through its routes. Manual waitlist approval likewise records an audit. Other staff edit/manager paths use different validation and override flows; do not assume all admin edits behave like admin creation (`admin-appointment-creation.server.ts`, `appointment-override-audit.server.ts`).

## 10. Admin settings screens

| Page and field | Current effect and scope |
| --- | --- |
| `/admin/capacity`: Default daily intake capacity | Global template for new dates and last fallback for a date without either saved daily value; initial migration 120 points. |
| Monthly booking limit per consignor | Global calendar-month limit; initial migration 2. |
| Default reservation hold time | Global fallback when no date or event duration applies; fallback 15 minutes if absent. |
| Load type name, Capacity points, Active | Global load options and their daily point cost; inactive types are unavailable for new validation. |
| Storage area Display name, Measurement type, Physical capacity, Points per physical unit, Normal capacity (points), Overflow allowance (points), Display order, Active | Global area metadata, display conversion, normal and waitlist limits, order and availability. Physical capacity × conversion is only a reference. Existing explicit date overrides take precedence. Names also have hard-coded significance. |
| `/admin/schedule/new` and `/admin/schedule/:id`: Daily intake capacity; each area's Normal capacity and Waitlist capacity | Saved date-specific point values, initially prefilled from globals; see reset limitations above. |
| Same date forms: Public/private visibility and open switch; Override Reservation Hold Time | Date eligibility and duration override; blank duration inherits. Open/close buttons also appear on `/admin/schedule` and date detail. |
| `/admin/booking-events/new` and `/admin/booking-events/:id` (also edit route): Signup opens, Signup closes, Timezone, Active for public signup, Reservation Hold Time | Event-wide signup window, eligibility and inherited hold duration. The new event form starts at the built-in 15-minute default, not the editable global setting. The event detail links to creation and management of its dates; it does not set a shared capacity pool. |

See `admin.capacity.tsx`, `dropoff-event-form.tsx`, `admin.booking-events.new.tsx`, and corresponding service files. Date and event settings are distinct even where the UI uses “event” for a Drop-Off Date.

## 11. Worked examples

Assume an otherwise eligible date, valid customer, and no competing holds except where stated:

- **Allocation:** Smalls limit 100 points, usage 80, a 100-point load allocated 30% Smalls requests 30 points there. It exceeds normal capacity (110 > 100). The public hold is rejected; it is not automatically waitlisted. A 20-point load at 30% instead requests 6 points and fits Smalls, subject to every other check.
- **One category full:** Smalls is 100/100, while Furniture and Outdoor have plenty of room. The whole public date is Full even for a 0% Smalls request. An active hold issued earlier may still complete.
- **Daily full:** daily limit 120, usage 120; storage has room. A positive load cannot pass daily validation. Depending on waitlist allowance, the badge may say Waitlist instead of Full; neither permits an online waitlist request.
- **Waitlist allowance available:** underlying service sees normal Smalls 80/100 and a request for 30 Smalls points, with 0/50 waitlist points used, sufficient allowance for all other allocations and enough daily capacity. It classifies the request waitlisted. The customer hold flow rejects that classification; this is not an online join.
- **Waitlist allowance full:** same request with 30/50 Smalls waitlist points used would bring waitlist usage to 60; the underlying service returns a waitlist-full error. Admin creation instead schedules the appointment with an automatic capacity override.
- **Admin while full:** an admin schedules a 20-point load on a date already at 120/120 daily points. After any required monthly confirmation, it is scheduled at 140/120 and the override is audited; it is not waitlisted.
- **Cancellation:** cancelling a scheduled 20-point load on that 140/120 date reduces confirmed daily usage to 120 on the next calculation, plus any active holds. It may still be full; freeing enough points and storage can make it available again. No waitlisted customer is promoted automatically.

## 12. Data model / technical reference

- D1 `settings`: `default_daily_intake_capacity`, `monthly_booking_limit`, `default_booking_hold_duration_minutes`.
- `dropoff_types`: active load names and `capacity_points`; `item_areas`: normal and overflow points, physical units, conversion, name and active flag.
- `dropoff_days`: date, visibility, `is_open`, `capacity_points`, `daily_capacity_override`, hold override; `dropoff_day_area_overrides`: per-area normal and overflow overrides.
- `booking_events` and `booking_event_dropoff_dates`: signup windows, active state, hold duration and date links.
- `appointments`: user, date, load type, status, `waitlisted_at`, `waitlist_reason`, `booking_hold_id`; `appointment_area_allocations`: stored percentages and points. `booking_holds` stores expiry and reserved daily/three-area points. `appointment_override_audits` stores override context; `notification_jobs` stores queued messages.
- Core: `getEffectiveDateCapacity`, `validateBooking`, `getCapacityEvaluation`, `getMonthlyAppointmentUsage`, `promoteWaitlistedAppointment`, `getCustomerBookingEvents`, `reserveBookingHold`, `convertBookingHold`, `createAdminAppointment`, `cancelWaitlistableAppointment`. Routes: `dropoffs.book.tsx`, `admin.capacity.tsx`, `admin.schedule*.tsx`, `admin.booking-events*.tsx`, `admin.appointments*.tsx`, `my-appointments.detail.tsx`, and `manager.detail.tsx`. Schema and seeds include migrations 0002, 0006, 0016, 0025 and 0033–0035.

## 13. Known ambiguities and risks

- **Current behavior / potential issue:** capacity logic is duplicated across the event snapshot, validation, hold SQL and admin summary. The snapshot's waitlist calculation ignores daily fit and uses a whole-load-to-one-area approximation; its badge can differ from actual request validation.
- **Current behavior / potential issue:** the public UI says online waitlist is unavailable, despite underlying waitlist classification and date-form copy implying appointments may be waitlisted. Admin creation bypasses the queue entirely.
- **Current behavior / potential issue:** public Full checks exact area names, and hold SQL specifically requires those three named active areas. Renaming or disabling one can produce inconsistent or failed public reservations. Other active areas are validated, but hold reservation stores only the three named areas.
- **Current behavior / potential issue:** admin schedule summaries omit holds while customer availability includes them. Booking Event detail counts only scheduled appointments in its displayed usage, unlike the main capacity calculation's inclusion of checked-in and completed.
- **Current behavior / potential issue:** daily usage uses the load type's current point value; area allocations are saved points. Editing a load type later can change historical daily usage without changing saved storage usage. Physical capacity and normal points can also disagree.
- **Current behavior / potential issue:** hold acquisition has an atomic capacity guard, but other validation and admin creation/promotion read capacity before writing; simultaneous operations or configuration changes can cause overbooking. Hold conversion does not revalidate customer-specific eligibility, and promotion has an optimistic status update rather than an atomic capacity predicate.
- **Current behavior / potential issue:** a no-close Booking Event may remain technically open but disappear from the customer listing after its opening calendar day. Saved date overrides are snapshots, so changing a global setting may not change existing dates.

## 14. Recommended questions for business review

These are decisions for a future change, not current behavior:

1. Should any one full storage category close the entire date, including requests that allocate nothing to it?
2. Should daily intake and storage independently close a date, and what should the badge say when daily intake is full?
3. Should customers be able to join a waitlist, and should limits be points, people, or both? Should admins be able to add waitlisted entries?
4. Should overflow be reserved for waitlist demand, or be bookable confirmed capacity? Should waitlisted users reserve confirmed capacity?
5. Should promotion be automatic or admin-driven, in what order, and with what notifications and reservation period?
6. Should existing dates inherit later global changes, and should eligibility and limits be rechecked when a hold is converted?
