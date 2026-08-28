import { redirect } from "react-router";
import type { Route } from "./+types/admin.appointments.detail";
import { requireRole } from "../services/auth.server";
import { env } from "cloudflare:workers";
const runtime = env as unknown as { AUTH_SECRET?: string; BETTER_AUTH_URL?: string };
export async function loader({ request, params }: Route.LoaderArgs) { await requireRole(request, env.trice_auction_db, runtime, "admin"); throw redirect(`/manager/${params.id}`); }
export default function AdminAppointmentDetail() { return null; }
