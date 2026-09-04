export const APPOINTMENT_STATUS_FILTERS = [
  "all",
  "scheduled",
  "checked_in",
  "completed",
  "no_show",
  "cancelled",
  "last_minute_cancelled",
  "waitlisted",
] as const;

const APPOINTMENT_STATUS_LABELS: Record<string, string> = {
  all: "All",
  scheduled: "Scheduled",
  checked_in: "Checked In",
  completed: "Completed",
  no_show: "No Show",
  cancelled: "Cancelled",
  last_minute_cancelled: "Last-Minute Cancelled",
  waitlisted: "Waitlisted",
};

export function formatAppointmentStatusLabel(status: string) {
  return APPOINTMENT_STATUS_LABELS[status] ?? status.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
