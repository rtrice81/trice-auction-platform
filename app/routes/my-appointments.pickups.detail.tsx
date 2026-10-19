import { env } from "cloudflare:workers";
import { Link } from "react-router";
import type { Route } from "./+types/my-appointments.pickups.detail";
import { requireUser } from "../services/auth.server";
import { getCustomerPickup } from "../services/customer-appointments.server";
import { PageCard, PageIntro, PageShell } from "../components/design-system";

const runtime = env as unknown as { AUTH_SECRET?: string; BETTER_AUTH_URL?: string };

// Read-only route: no action/clientAction. React Router rejects mutation requests.
export async function loader({ request, params }: Route.LoaderArgs) {
  const user = await requireUser(request, env.trice_auction_db, runtime);
  const pickup = await getCustomerPickup(env.trice_auction_db, user.id, Number(params.id));
  if (!pickup) throw new Response("Not Found", { status: 404 });
  return { pickup };
}

export default function CustomerPickupDetail({ loaderData }: Route.ComponentProps) {
  const { pickup } = loaderData;
  return <PageShell><div className="max-w-3xl">
    <Link to="/my-appointments" className="text-sm font-bold text-[#9d302f]">← My Appointments</Link>
    <PageIntro eyebrow="Customer portal" title="Consignment Pickup">{pickup.title}</PageIntro>
    <PageCard title="Appointment details"><dl className="grid gap-5 sm:grid-cols-2">
      <div><dt className="font-semibold">Pickup date</dt><dd>{pickup.appointmentDate}</dd></div>
      <div><dt className="font-semibold">Arrival time</dt><dd>{pickup.arrivalTime ? `${pickup.arrivalTime} (Eastern time)` : "To be arranged"}</dd></div>
      <div><dt className="font-semibold">Status</dt><dd>{pickup.status}</dd></div>
      <div><dt className="font-semibold">Pickup contact</dt><dd>{pickup.contactName}<br/>{pickup.contactPhone}</dd></div>
      <div className="sm:col-span-2"><dt className="font-semibold">Pickup address</dt><dd className="whitespace-pre-line">{[pickup.addressLine1, pickup.addressLine2, `${pickup.city}, ${pickup.state} ${pickup.postalCode}`].filter(Boolean).join("\n")}</dd></div>
      {pickup.description ? <div className="sm:col-span-2"><dt className="font-semibold">Description</dt><dd className="whitespace-pre-wrap">{pickup.description}</dd></div> : null}
    </dl></PageCard>
    <p className="mt-5 text-sm text-[#555960]">Pickup appointments are scheduled and managed by Trice Auctions. Please contact us if changes are needed.</p>
  </div></PageShell>;
}
