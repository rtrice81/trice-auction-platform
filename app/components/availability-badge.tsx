import type { CustomerAvailability } from "../services/booking-event.server";

const styles: Record<CustomerAvailability, string> = {
  Available: "bg-emerald-100 text-emerald-900",
  "Limited Availability": "bg-amber-100 text-amber-900",
  "Nearly Full": "bg-orange-100 text-orange-900",
  Full: "bg-red-100 text-red-900",
  "Signup Not Open Yet": "bg-blue-100 text-blue-900",
  Closed: "bg-stone-200 text-stone-800",
};

export function AvailabilityBadge({ label }: { label: CustomerAvailability }) {
  return <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${styles[label]}`}>{label}</span>;
}
