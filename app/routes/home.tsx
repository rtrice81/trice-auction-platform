import { env } from "cloudflare:workers";
import { data, redirect } from "react-router";
import type { Route } from "./+types/home";
import { getCurrentUser } from "../services/auth.server";
import { getPendingBooking, getPendingBookingToken } from "../services/pending-booking.server";
import { getCustomerBookingReleases, getCustomerDropoffEventForDate } from "../services/booking-release.server";
import { BookingReleaseCard } from "../components/booking-release-card";
import { PageCard, PageIntro, PageShell } from "../components/design-system";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Schedule a Drop-Off | Trice Auctions" }, { name: "description", content: "Schedule your consignment drop-off with Trice Auctions." }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const runtime = env as unknown as { AUTH_SECRET?: string; BETTER_AUTH_URL?: string };
  const user = await getCurrentUser(request, env.trice_auction_db, runtime);
  const pendingBooking = user ? await getPendingBooking(env.trice_auction_db, getPendingBookingToken(request)) : null;
  if (pendingBooking) {
    const selected = await getCustomerDropoffEventForDate(env.trice_auction_db, pendingBooking.appointmentDate);
    if (selected) return redirect(`/dropoffs/${selected.event.eventId}/book?resume=1`);
  }
  return data({ releases: await getCustomerBookingReleases(env.trice_auction_db) });
}

export default function Home({ loaderData }: Route.ComponentProps) {
  return <PageShell><div className="max-w-6xl"><PageIntro eyebrow="Drop-off appointments" title="Schedule a Consignment Drop-Off">Choose an upcoming drop-off date, then tell us about your load. Availability is confirmed when you submit your request.</PageIntro>
    {loaderData.releases.length ? <section className="space-y-6" aria-label="Drop-off signup periods">{loaderData.releases.map((release) => <BookingReleaseCard key={release.id} release={release}/>)}</section> : <PageCard title="Drop-Off Signup"><p className="text-[#5f6368]">There are no drop-off signup periods currently scheduled.</p></PageCard>}
  </div></PageShell>;
}
