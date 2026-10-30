import { isCustomerStorageCategory } from "../lib/customer-storage-capacity";
import { getBookableBookingEventForDate } from "./booking-event.server";
import { createValidatedBooking, validateBooking, type BookingInput, type MonthlyAppointment } from "./booking.server";
import { getCustomerById } from "./customer-management.server";
import type { AppointmentOverrideAuditInput } from "./appointment-override-audit.server";

export type AdminAppointmentCreationOptions = {
  actorUserId: number;
  overrideMonthlyLimit?: boolean;
  goBack?: boolean;
};

export type AdminAppointmentCreationResult =
  | { ok: true; appointmentId: number; status: "scheduled" | "waitlisted"; message: string }
  | {
      ok: false;
      errors: string[];
      submitted: BookingInput;
      overridableViolations: string[];
      monthlyConfirmation?: boolean;
      monthlyConfirmed?: boolean;
      monthlyAppointments?: MonthlyAppointment[];
    };

/** Admin creation only. Neither customer booking nor manager editing uses this consent path. */
export async function createAdminAppointment(
  db: D1Database,
  input: BookingInput,
  options: AdminAppointmentCreationOptions,
): Promise<AdminAppointmentCreationResult> {
  const failure = (errors: string[], extra: Partial<Extract<AdminAppointmentCreationResult, { ok: false }>> = {}): AdminAppointmentCreationResult =>
    ({ ok: false, errors, submitted: input, overridableViolations: [], ...extra });
  try {
    // The route supplies this ID from requireRole, never from submitted form data.
    const admin = await db.prepare(
      `SELECT users.id FROM users JOIN user_roles ON user_roles.user_id = users.id
       WHERE users.id = ? AND users.active = 1 AND user_roles.role = 'admin'`,
    ).bind(options.actorUserId).first<{ id: number }>();
    if (!admin) return failure(["Only an active administrator can create an appointment with these overrides."]);
    if (options.goBack) return failure([]);
    if (input.appointmentId || !Number.isInteger(input.userId) || input.userId < 1 || !await getCustomerById(db, input.userId)) {
      return failure(["Choose an existing customer."]);
    }

    const validation = await validateBooking(db, input, { allowAdminScheduling: true });
    if (!validation.capacityContext || !validation.dropoffType) {
      return failure(validation.ok ? ["Appointment validation could not be completed."] : validation.errors);
    }
    const monthlyAppointments = validation.capacityContext.monthly.appointments;
    const monthlyErrors = validation.ok ? [] : validation.monthlyErrors ?? [];
    const otherErrors = validation.ok ? [] : validation.errors.filter(error => !monthlyErrors.includes(error));
    const monthlyConfirmed = options.overrideMonthlyLimit === true && monthlyAppointments.length > 0;

    // Warn on any qualifying repeat in the month, even below the configurable
    // customer limit. A capacity override cannot supply monthly consent.
    if (monthlyAppointments.length && !monthlyConfirmed) {
      return failure(otherErrors, { monthlyConfirmation: true, monthlyAppointments });
    }
    // Only capacity errors are automatically bypassed. Input validation, bans,
    // missing dates and monthly confirmation retain their existing behavior.
    if (otherErrors.some(error => !(!validation.ok && validation.capacityErrors?.includes(error)))) {
      return failure(otherErrors, { monthlyConfirmed });
    }
    const context = validation.capacityContext;
    const capacityViolations: string[] = [];
    if (context.day && context.day.usedPoints + context.day.requestedPoints > context.day.capacityPoints) {
      capacityViolations.push("This drop-off date has reached its confirmed daily intake capacity.");
    }
    const storageExceeded = context.areas.some(area => area.usedPoints + area.requestedPoints > area.allowedPoints);
    for (const area of context.areas) {
      if (isCustomerStorageCategory(area.name) && area.usedPoints >= area.allowedPoints && area.usedPoints + area.requestedPoints <= area.allowedPoints) {
        capacityViolations.push(`Confirmed capacity already full for ${area.name}.`);
      }
      if (area.usedPoints + area.requestedPoints > area.allowedPoints) {
        capacityViolations.push(`Confirmed capacity exceeded for ${area.name}.`);
      }
      if (storageExceeded && (area.waitlistUsedPoints ?? 0) + area.requestedPoints > (area.waitlistCapacityPoints ?? 0)) {
        capacityViolations.push(`The waitlist is full for ${area.name}.`);
      }
    }
    const publicAvailability = await getBookableBookingEventForDate(db, input.appointmentDate);
    const availabilityViolations = [
      ...(!publicAvailability.eligible ? ["public_booking_availability", `public_booking_status:${publicAvailability.status}`] : []),
      ...(context.day && !context.day.isOpen ? ["dropoff_date_closed"] : []),
    ];
    const capacityOverridden = capacityViolations.length > 0;
    const automaticallyOverridden = capacityOverridden || availabilityViolations.length > 0;
    // Admin creation always confirms the appointment; it never silently joins
    // the public waitlist when storage is full.
    const appointmentStatus = "scheduled" as const;
    const waitlistReason = null;
    const audit: Omit<AppointmentOverrideAuditInput, "appointmentId"> | undefined = monthlyConfirmed || automaticallyOverridden ? {
      actorUserId: options.actorUserId,
      actorRole: "admin",
      reason: automaticallyOverridden ? "admin-created appointment" : "Admin confirmed another appointment in the same calendar month (monthly_appointment_limit_override).",
      violatedRules: [...(monthlyConfirmed ? ["monthly_appointment_limit_override", ...monthlyErrors] : []), ...capacityViolations, ...availabilityViolations],
      previousValues: { monthlyAppointments },
      requestedValues: { ...input, status: appointmentStatus },
      capacityContext: { ...context, publicAvailability },
    } : undefined;
    const result = await createValidatedBooking(db, input, {
      ok: true,
      dropoffType: validation.dropoffType,
      capacityContext: validation.capacityContext,
      allocations: validation.allocations,
      appointmentStatus,
      waitlistReason,
    }, audit);
    return { ...result, message: capacityOverridden ? "Appointment created with capacity override." : "Appointment created." };
  } catch {
    // Persistence batches include the appointment, allocations, role and audit,
    // so a failed write leaves no partial appointment and is safe to retry.
    return failure(["The appointment could not be created. Please try again. If this continues, contact support."]);
  }
}
