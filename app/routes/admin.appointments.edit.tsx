import { env } from "cloudflare:workers";
import type { Route } from "./+types/admin.appointments.edit";
import { AdminBreadcrumbs, dropoffBreadcrumbs } from "../components/admin-breadcrumbs";
import { getDropoffHierarchy } from "../services/admin-breadcrumbs.server";
import { requireRole } from "../services/auth.server";
import { action as updateAppointment, AppointmentManagementDetail, loader as loadAppointment } from "./manager.detail";

const runtime = env as unknown as { AUTH_SECRET?: string; BETTER_AUTH_URL?: string };

export async function loader(args: Route.LoaderArgs) {
  await requireRole(args.request, env.trice_auction_db, runtime, "admin");
  const detail = await loadAppointment(args);
  const hierarchy = await getDropoffHierarchy(env.trice_auction_db, { date: detail.appointment.date });
  return { ...detail, hierarchy };
}

export async function action(args: Route.ActionArgs) {
  await requireRole(args.request, env.trice_auction_db, runtime, "admin");
  return updateAppointment(args);
}

export default function AdminAppointmentEdit({ loaderData, actionData }: Route.ComponentProps) {
  const detailPath = `/admin/appointments/${loaderData.appointment.id}`;
  const items = dropoffBreadcrumbs(loaderData.hierarchy, `Appointment #${loaderData.appointment.id}`);
  items[items.length - 1].to = detailPath;
  return <><div className="ta-page pb-0"><AdminBreadcrumbs items={[...items, { label: "Edit" }]} /></div><AppointmentManagementDetail loaderData={loaderData} actionData={actionData} backTo={detailPath} backLabel="← Back to Appointment" returnTo={detailPath}/></>;
}
