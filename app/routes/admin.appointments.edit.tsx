import { env } from "cloudflare:workers";
import type { Route } from "./+types/admin.appointments.edit";
import { requireRole } from "../services/auth.server";
import { action as updateAppointment, AppointmentManagementDetail, loader as loadAppointment } from "./manager.detail";

const runtime = env as unknown as { AUTH_SECRET?: string; BETTER_AUTH_URL?: string };

export async function loader(args: Route.LoaderArgs) {
  await requireRole(args.request, env.trice_auction_db, runtime, "admin");
  return loadAppointment(args);
}

export async function action(args: Route.ActionArgs) {
  await requireRole(args.request, env.trice_auction_db, runtime, "admin");
  return updateAppointment(args);
}

export default function AdminAppointmentEdit({ loaderData, actionData }: Route.ComponentProps) {
  const detailPath = `/admin/appointments/${loaderData.appointment.id}`;
  return <AppointmentManagementDetail loaderData={loaderData} actionData={actionData} backTo={detailPath} backLabel="Cancel" returnTo={detailPath}/>;
}
