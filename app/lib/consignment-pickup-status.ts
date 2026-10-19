export const PICKUP_STATUSES = ["planned", "scheduled", "en_route", "on_site", "completed", "cancelled"] as const;
export type PickupStatus = typeof PICKUP_STATUSES[number];
export const pickupStatusLabel = (status: string) => ({ planned: "Planned", scheduled: "Scheduled", en_route: "En Route", on_site: "On Site", completed: "Completed", cancelled: "Cancelled" }[status] ?? status);

/** Customer wording is separate from the unchanged internal status labels. */
export const customerPickupStatusLabel = (status: string) => ({ planned: "Scheduled", scheduled: "Scheduled", en_route: "On the Way", on_site: "In Progress", completed: "Completed", cancelled: "Cancelled" }[status] ?? "Scheduled");
