import { Link } from "react-router";
import type { DropoffHierarchy } from "../services/admin-breadcrumbs.server";

type BreadcrumbItem = { label: string; to?: string };

export function AdminBreadcrumbs({ items }: { items: BreadcrumbItem[] }) {
  return <nav aria-label="Breadcrumb" className="mb-5 text-sm"><ol className="flex flex-wrap items-center gap-x-2 gap-y-1">{items.map((item, index) => <li key={`${index}-${item.label}`} className="flex min-w-0 items-center gap-2">{index > 0 ? <span aria-hidden="true" className="text-stone-400">/</span> : null}{item.to ? <Link to={item.to} className="font-semibold text-[#9d302f] underline underline-offset-2">{item.label}</Link> : <span aria-current="page" className="font-semibold text-stone-700">{item.label}</span>}</li>)}</ol></nav>;
}

export function dropoffBreadcrumbs(hierarchy: DropoffHierarchy | null, currentLabel?: string): BreadcrumbItem[] {
  if (!hierarchy) return [{ label: "Appointments", to: "/admin/appointments" }, ...(currentLabel ? [{ label: currentLabel }] : [])];
  const date = new Intl.DateTimeFormat("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "UTC" }).format(new Date(`${hierarchy.date}T00:00:00Z`));
  const parents: BreadcrumbItem[] = hierarchy.bookingEventId && hierarchy.bookingEventName
    ? [{ label: "Booking Events", to: "/admin/booking-events" }, { label: hierarchy.bookingEventName, to: `/admin/booking-events/${hierarchy.bookingEventId}` }]
    : [{ label: "Schedule", to: "/admin/schedule" }];
  return [...parents, { label: date, ...(currentLabel ? { to: `/admin/schedule/${hierarchy.id}` } : {}) }, ...(currentLabel ? [{ label: currentLabel }] : [])];
}
