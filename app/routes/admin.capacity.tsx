import { env } from "cloudflare:workers";
import { data, Form, Link } from "react-router";

import type { Route } from "./+types/admin.capacity";
import {
  getCapacitySettings,
  saveDropoffType,
  saveGeneralSettings,
  saveItemArea,
} from "../services/capacity-settings.server";
import type { CapacitySettingsResult } from "../services/capacity-settings.server";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Capacity Settings | Trice Auctions" },
    { name: "description", content: "Manage auction intake capacity settings." },
  ];
}

export async function loader() {
  return getCapacitySettings(env.trice_auction_db);
}

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");
  const db = env.trice_auction_db;

  let result: CapacitySettingsResult;
  switch (intent) {
    case "save-general":
      result = await saveGeneralSettings(db, {
        defaultDailyIntakeCapacity: numberValue(formData, "defaultDailyIntakeCapacity"),
        monthlyBookingLimit: numberValue(formData, "monthlyBookingLimit"),
      });
      break;
    case "save-load-type":
    case "add-load-type":
      result = await saveDropoffType(db, {
        id: intent === "save-load-type" ? numberValue(formData, "id") : undefined,
        name: textValue(formData, "name"),
        capacityPoints: numberValue(formData, "capacityPoints"),
        active: formData.get("active") === "on",
      });
      break;
    case "save-item-area":
      result = await saveItemArea(db, {
        id: numberValue(formData, "id"),
        name: textValue(formData, "name"),
        measurementType: textValue(formData, "measurementType"),
        physicalCapacity: numberValue(formData, "physicalCapacity"),
        pointsPerUnit: numberValue(formData, "pointsPerUnit"),
        normalCapacityPoints: numberValue(formData, "normalCapacityPoints"),
        overflowAllowancePoints: numberValue(formData, "overflowAllowancePoints"),
        active: formData.get("active") === "on",
        displayOrder: numberValue(formData, "displayOrder"),
      });
      break;
    default:
      return data<CapacitySettingsResult>(
        { ok: false, errors: ["Unknown settings action."] },
        { status: 400 },
      );
  }

  return data(result, { status: result.ok ? 200 : 400 });
}

export default function AdminCapacity({ loaderData, actionData }: Route.ComponentProps) {
  return (
    <main className="min-h-screen bg-stone-50 text-stone-900">
      <div className="mx-auto max-w-6xl px-6 py-12 sm:py-16">
        <header className="mb-10 flex flex-wrap items-end justify-between gap-4 border-b border-stone-200 pb-8">
          <div>
            <p className="mb-3 text-sm font-semibold tracking-[0.18em] text-amber-700 uppercase">
              Trice Auctions · Local administration
            </p>
            <h1 className="text-4xl font-bold tracking-tight text-stone-950">Capacity Settings</h1>
            <p className="mt-3 max-w-2xl text-stone-600">
              Changes are stored in D1 and apply to future booking validation immediately.
            </p>
          </div>
          <Link to="/" className="text-sm font-semibold text-amber-800 hover:text-amber-950">
            View booking page →
          </Link>
        </header>

        {actionData?.ok ? (
          <Notice variant="success">{actionData.message}</Notice>
        ) : null}
        {actionData && !actionData.ok ? (
          <Notice variant="error">
            <ul className="list-disc space-y-1 pl-5">
              {actionData.errors.map((error) => <li key={error}>{error}</li>)}
            </ul>
          </Notice>
        ) : null}

        <div className="space-y-10">
          <section aria-labelledby="general-settings-heading">
            <SectionHeading
              eyebrow="Booking rules"
              heading="General settings"
              description="These defaults are read whenever a new drop-off date or booking is validated."
            />
            <Form method="post" className="grid gap-5 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm sm:grid-cols-2">
              <input type="hidden" name="intent" value="save-general" />
              <NumberField
                label="Default daily intake capacity"
                name="defaultDailyIntakeCapacity"
                value={loaderData.defaultDailyIntakeCapacity}
                min={0}
                step={0.01}
                hint="Capacity points assigned when a new drop-off day is created."
              />
              <NumberField
                label="Monthly booking limit per consignor"
                name="monthlyBookingLimit"
                value={loaderData.monthlyBookingLimit}
                min={1}
                step={1}
                hint="Scheduled bookings allowed for one consignor in a calendar month."
              />
              <div className="sm:col-span-2"><SaveButton label="Save general settings" /></div>
            </Form>
          </section>

          <section aria-labelledby="load-types-heading">
            <SectionHeading
              eyebrow="Intake capacity"
              heading="Drop-off / load types"
              description="Each type contributes its own base capacity points to a booking."
            />
            <div className="space-y-4">
              {loaderData.dropoffTypes.map((loadType) => (
                <Form key={loadType.id} method="post" className="grid gap-4 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm md:grid-cols-[minmax(0,1fr)_11rem_auto_auto] md:items-end">
                  <input type="hidden" name="intent" value="save-load-type" />
                  <input type="hidden" name="id" value={loadType.id} />
                  <TextField label="Load type name" name="name" value={loadType.name} />
                  <NumberField label="Capacity points" name="capacityPoints" value={loadType.capacityPoints} min={1} step={1} />
                  <CheckboxField label="Active" name="active" checked={loadType.active === 1} />
                  <SaveButton label="Save" />
                </Form>
              ))}
            </div>

            <Form method="post" className="mt-5 grid gap-4 rounded-2xl border border-dashed border-amber-300 bg-amber-50/50 p-5 md:grid-cols-[minmax(0,1fr)_11rem_auto_auto] md:items-end">
              <input type="hidden" name="intent" value="add-load-type" />
              <TextField label="New load type name" name="name" placeholder="Example: Box Truck" />
              <NumberField label="Capacity points" name="capacityPoints" min={1} step={1} />
              <CheckboxField label="Active" name="active" checked />
              <SaveButton label="Add load type" />
            </Form>
          </section>

          <section aria-labelledby="storage-areas-heading">
            <SectionHeading
              eyebrow="Storage allocation"
              heading="Storage areas"
              description="Normal capacity remains the booking limit. The calculated physical equivalent is shown for operational reference."
            />
            <div className="space-y-5">
              {loaderData.itemAreas.map((area) => {
                const derivedCapacity = area.physicalCapacity * area.pointsPerUnit;
                return (
                  <Form key={area.id} method="post" className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
                    <input type="hidden" name="intent" value="save-item-area" />
                    <input type="hidden" name="id" value={area.id} />
                    <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
                      <TextField label="Display name" name="name" value={area.name} />
                      <SelectField label="Measurement type" name="measurementType" value={area.measurementType} />
                      <NumberField label="Physical capacity" name="physicalCapacity" value={area.physicalCapacity} min={0} step={0.01} />
                      <NumberField label="Points per physical unit" name="pointsPerUnit" value={area.pointsPerUnit} min={0.0001} step={0.0001} />
                      <NumberField label="Normal capacity (points)" name="normalCapacityPoints" value={area.normalCapacityPoints} min={0} step={0.01} />
                      <NumberField label="Overflow allowance (points)" name="overflowAllowancePoints" value={area.overflowAllowancePoints} min={0} step={0.01} />
                      <NumberField label="Display order" name="displayOrder" value={area.displayOrder} min={0} step={1} />
                      <div className="rounded-xl bg-stone-100 px-4 py-3 text-sm text-stone-700">
                        <span className="block font-semibold text-stone-950">Derived physical capacity</span>
                        <span className="mt-1 block">{formatNumber(derivedCapacity)} points</span>
                        <span className="mt-1 block text-xs text-stone-500">Physical capacity × conversion factor</span>
                      </div>
                    </div>
                    <div className="mt-5 flex flex-wrap items-center justify-between gap-4 border-t border-stone-100 pt-5">
                      <CheckboxField label="Active" name="active" checked={area.active === 1} />
                      <SaveButton label="Save storage area" />
                    </div>
                  </Form>
                );
              })}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}

function SectionHeading({ eyebrow, heading, description }: { eyebrow: string; heading: string; description: string }) {
  return (
    <div className="mb-5">
      <p className="text-sm font-semibold text-amber-700">{eyebrow}</p>
      <h2 className="mt-1 text-2xl font-semibold" id={`${heading.toLowerCase().replaceAll(" ", "-")}-heading`}>{heading}</h2>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-600">{description}</p>
    </div>
  );
}

function Notice({ variant, children }: { variant: "success" | "error"; children: React.ReactNode }) {
  const classes = variant === "success"
    ? "border-emerald-200 bg-emerald-50 text-emerald-950"
    : "border-red-200 bg-red-50 text-red-950";
  return <div className={`mb-8 rounded-2xl border px-5 py-4 text-sm ${classes}`} role={variant === "success" ? "status" : "alert"}>{children}</div>;
}

function TextField({ label, name, value, placeholder }: { label: string; name: string; value?: string; placeholder?: string }) {
  return <label className="block text-sm font-semibold text-stone-800">{label}<input required type="text" name={name} defaultValue={value} placeholder={placeholder} className="mt-2 block w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 font-normal outline-none focus:border-amber-600 focus:ring-2 focus:ring-amber-100" /></label>;
}

function NumberField({ label, name, value, min, step, hint }: { label: string; name: string; value?: number; min: number; step: number; hint?: string }) {
  return <label className="block text-sm font-semibold text-stone-800">{label}<input required type="number" name={name} defaultValue={value} min={min} step={step} className="mt-2 block w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 font-normal outline-none focus:border-amber-600 focus:ring-2 focus:ring-amber-100" />{hint ? <span className="mt-1 block text-xs font-normal leading-5 text-stone-500">{hint}</span> : null}</label>;
}

function CheckboxField({ label, name, checked }: { label: string; name: string; checked: boolean }) {
  return <label className="flex min-h-11 items-center gap-2 text-sm font-semibold text-stone-800"><input type="checkbox" name={name} defaultChecked={checked} className="size-4 rounded border-stone-300 text-amber-700 focus:ring-amber-600" />{label}</label>;
}

function SelectField({ label, name, value }: { label: string; name: string; value: string }) {
  return <label className="block text-sm font-semibold text-stone-800">{label}<select name={name} defaultValue={value} className="mt-2 block w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 font-normal outline-none focus:border-amber-600 focus:ring-2 focus:ring-amber-100"><option value="shelves">Shelves</option><option value="square_feet">Square feet</option><option value="points">Points</option></select></label>;
}

function SaveButton({ label }: { label: string }) {
  return <button type="submit" className="min-h-11 rounded-xl bg-stone-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-amber-700 focus-visible:ring-2 focus-visible:ring-amber-600 focus-visible:ring-offset-2 focus-visible:outline-none">{label}</button>;
}

function textValue(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function numberValue(formData: FormData, key: string) {
  return Number(formData.get(key));
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value);
}
