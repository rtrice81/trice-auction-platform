import { env } from "cloudflare:workers";

import type { Route } from "./+types/home";

type DropoffType = {
  id: number;
  name: string;
  capacityPoints: number;
};

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Schedule a Drop-Off | Trice Auctions" },
    {
      name: "description",
      content: "Schedule your consignment drop-off with Trice Auctions.",
    },
  ];
}

export async function loader() {
  const { results } = await env.trice_auction_db
    .prepare(
      `SELECT id, name, capacity_points AS capacityPoints
       FROM dropoff_types
       WHERE active = 1
       ORDER BY capacity_points ASC, name ASC`,
    )
    .all<DropoffType>();

  return { dropoffTypes: results };
}

export default function Home({ loaderData }: Route.ComponentProps) {
  return (
    <main className="min-h-screen bg-stone-50 text-stone-900">
      <div className="mx-auto max-w-5xl px-6 py-12 sm:py-20">
        <header className="mb-12 border-b border-stone-200 pb-8">
          <p className="mb-3 text-sm font-semibold tracking-[0.18em] text-amber-700 uppercase">
            Trice Auctions
          </p>
          <h1 className="max-w-3xl text-4xl font-bold tracking-tight text-stone-950 sm:text-5xl">
            Schedule a Consignment Drop-Off
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-stone-600">
            Tell us what you are bringing and we will reserve the right amount
            of space for your drop-off.
          </p>
        </header>

        <section aria-labelledby="load-type-heading">
          <div className="mb-6 flex items-end justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-amber-700">Step 1 of 3</p>
              <h2 id="load-type-heading" className="mt-1 text-2xl font-semibold">
                Choose your load type
              </h2>
            </div>
            <p className="hidden text-sm text-stone-500 sm:block">You can change this later.</p>
          </div>

          {loaderData.dropoffTypes.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {loaderData.dropoffTypes.map((dropoffType) => (
                <article
                  key={dropoffType.id}
                  className="group rounded-2xl border border-stone-200 bg-white p-6 shadow-sm transition hover:border-amber-500 hover:shadow-md"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-xl font-semibold text-stone-950">
                        {dropoffType.name}
                      </h3>
                      <p className="mt-2 text-sm leading-6 text-stone-600">
                        {dropoffType.capacityPoints} capacity point
                        {dropoffType.capacityPoints === 1 ? "" : "s"} reserved
                        for this appointment.
                      </p>
                    </div>
                    <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">
                      Available
                    </span>
                  </div>
                  <button
                    type="button"
                    className="mt-6 w-full rounded-xl bg-stone-900 px-4 py-3 text-sm font-semibold text-white transition group-hover:bg-amber-700 focus-visible:ring-2 focus-visible:ring-amber-600 focus-visible:ring-offset-2 focus-visible:outline-none"
                  >
                    Select {dropoffType.name}
                  </button>
                </article>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-stone-300 bg-white p-8 text-stone-600">
              No drop-off types are available right now. Please check back soon.
            </div>
          )}
        </section>

        <aside className="mt-12 rounded-2xl bg-stone-900 px-6 py-5 text-sm leading-6 text-stone-200">
          <span className="font-semibold text-white">Need a hand?</span> Call us before
          booking if you are unsure which load type best fits your items.
        </aside>
      </div>
    </main>
  );
}
