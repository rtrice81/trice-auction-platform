import type { Route } from "./+types/admin.appointments.detail";
import { requireRole } from "../services/auth.server";
import { env } from "cloudflare:workers";
import {
  action as updateAppointment,
  AppointmentManagementDetail,
  loader as loadAppointment,
} from "./manager.detail";

const runtime = env as unknown as { AUTH_SECRET?: string; BETTER_AUTH_URL?: string };

// Keep the admin URL and its authorization boundary while sharing the
// appointment edit, cancellation, and override workflow with managers.
export async function loader(args: Route.LoaderArgs) {
  await requireRole(args.request, env.trice_auction_db, runtime, "admin");
  return loadAppointment(args);
}

export async function action(args: Route.ActionArgs) {
  await requireRole(args.request, env.trice_auction_db, runtime, "admin");
  return updateAppointment(args);
}

export default function AdminAppointmentDetail({ loaderData, actionData }: Route.ComponentProps) {
  return (
    <AppointmentManagementDetail
      loaderData={loaderData}
      actionData={actionData}
      backTo="/admin/appointments"
      backLabel="← Appointments"
    />
  );
}
