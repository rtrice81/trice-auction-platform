import { env } from "cloudflare:workers";
import { data, Form } from "react-router";

import type { Route } from "./+types/home";
import { createBooking, getBookingOptions } from "../services/booking.server";

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
  return getBookingOptions(env.trice_auction_db);
}

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const allocations = Array.from(formData.entries())
    .filter(([name]) => name.startsWith("allocation-"))
    .map(([name, value]) => ({
      itemAreaId: Number(name.replace("allocation-", "")),
      percentage: Number(value),
    }));

  const result = await createBooking(env.trice_auction_db, {
    email: String(formData.get("email") ?? "").trim().toLowerCase(),
    appointmentDate: String(formData.get("appointmentDate") ?? ""),
    dropoffTypeId: Number(formData.get("dropoffTypeId")),
    description: String(formData.get("description") ?? "").trim(),
    allocations,
  });

  return data(result, { status: result.ok ? 201 : 400 });
}

export default function Home({ loaderData, actionData }: Route.ComponentProps) {
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
            Choose your load and tell us how it is divided between our intake areas.
            Current capacity is confirmed when you submit your request.
          </p>
        </header>

        {actionData?.ok ? (
          <div className="mb-8 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-emerald-950" role="status">
            {actionData.message}
          </div>
        ) : null}

        {actionData && !actionData.ok ? (
          <div className="mb-8 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-red-950" role="alert">
            <p className="font-semibold">We could not schedule this drop-off.</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
              {actionData.errors.map((error) => <li key={error}>{error}</li>)}
            </ul>
          </div>
        ) : null}

        <Form method="post" action="?index" className="space-y-10">
          <section aria-labelledby="consignor-heading">
            <div className="mb-5">
              <p className="text-sm font-semibold text-amber-700">Step 1 of 3</p>
              <h2 id="consignor-heading" className="mt-1 text-2xl font-semibold">Your drop-off</h2>
            </div>
            <div className="grid gap-5 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm sm:grid-cols-2">
              <label className="text-sm font-semibold text-stone-800">
                Email address
                <input
                  required
                  type="email"
                  name="email"
                  className="mt-2 block w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 font-normal outline-none focus:border-amber-600 focus:ring-2 focus:ring-amber-100"
                />
              </label>
              <label className="text-sm font-semibold text-stone-800">
                Preferred drop-off date
                <input
                  required
                  type="date"
                  name="appointmentDate"
                  className="mt-2 block w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 font-normal outline-none focus:border-amber-600 focus:ring-2 focus:ring-amber-100"
                />
              </label>
            </div>
          </section>

          <fieldset>
            <legend className="mb-5">
              <span className="block text-sm font-semibold text-amber-700">Step 2 of 3</span>
              <span className="mt-1 block text-2xl font-semibold">Choose your load type</span>
            </legend>
            <div className="grid gap-4 sm:grid-cols-2">
              {loaderData.dropoffTypes.map((dropoffType) => (
                <label key={dropoffType.id} className="cursor-pointer rounded-2xl border border-stone-200 bg-white p-6 shadow-sm transition hover:border-amber-500 hover:shadow-md has-[:checked]:border-amber-600 has-[:checked]:ring-2 has-[:checked]:ring-amber-100">
                  <input
                    required
                    type="radio"
                    name="dropoffTypeId"
                    value={dropoffType.id}
                    className="sr-only"
                  />
                  <span className="block text-xl font-semibold text-stone-950">{dropoffType.name}</span>
                  <span className="mt-2 block text-sm leading-6 text-stone-600">
                    {dropoffType.capacityPoints} intake points will be allocated across your item areas.
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="mb-2">
              <span className="block text-sm font-semibold text-amber-700">Step 3 of 3</span>
              <span className="mt-1 block text-2xl font-semibold">Allocate your item areas</span>
            </legend>
            <p className="mb-5 max-w-2xl text-sm leading-6 text-stone-600">
              Enter whole percentages for every active area. They must add up to exactly 100%.
            </p>
            <div className="grid gap-4 sm:grid-cols-3">
              {loaderData.itemAreas.map((area, index) => (
                <label key={area.id} className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
                  <span className="block font-semibold text-stone-950">{area.name}</span>
                  <span className="mt-1 block text-sm text-stone-600">Percentage of this load</span>
                  <span className="mt-4 flex items-center gap-2">
                    <input
                      required
                      type="number"
                      name={`allocation-${area.id}`}
                      min="0"
                      max="100"
                      step="1"
                      defaultValue={index === 0 ? 100 : 0}
                      className="block w-20 rounded-lg border border-stone-300 bg-white px-3 py-2 font-semibold outline-none focus:border-amber-600 focus:ring-2 focus:ring-amber-100"
                    />
                    <span className="text-sm text-stone-500">%</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <label className="block max-w-2xl text-sm font-semibold text-stone-800">
            Notes about your items <span className="font-normal text-stone-500">(optional)</span>
            <textarea
              name="description"
              rows={4}
              className="mt-2 block w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 font-normal outline-none focus:border-amber-600 focus:ring-2 focus:ring-amber-100"
            />
          </label>

          <button type="submit" className="rounded-xl bg-stone-900 px-6 py-3 text-sm font-semibold text-white transition hover:bg-amber-700 focus-visible:ring-2 focus-visible:ring-amber-600 focus-visible:ring-offset-2 focus-visible:outline-none">
            Request drop-off appointment
          </button>
        </Form>
      </div>
    </main>
  );
}
