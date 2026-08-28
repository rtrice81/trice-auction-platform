import { env } from "cloudflare:workers";
import { data, Form, Link } from "react-router";
import type { Route } from "./+types/admin.schedule";
import { requireRole } from "../services/auth.server";
import {
  getScheduleOverview,
  resetDateCapacityOverrides,
  saveDateCapacityOverrides,
  type ScheduleResult,
} from "../services/schedule-management.server";

const runtime = env as unknown as { AUTH_SECRET?: string; BETTER_AUTH_URL?: string };

export function meta({}: Route.MetaArgs) {
  return [{ title: "Scheduling Calendar | Trice Auctions" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireRole(request, env.trice_auction_db, runtime, "admin");
  const requestedDate = new URL(request.url).searchParams.get("date") ?? "";
  return getScheduleOverview(env.trice_auction_db, isIsoDate(requestedDate) ? requestedDate : today());
}

export async function action({ request }: Route.ActionArgs) {
  await requireRole(request, env.trice_auction_db, runtime, "admin");
  const form = await request.formData();
  const date = String(form.get("date") ?? "");
  const intent = String(form.get("intent") ?? "");
  let result: ScheduleResult;
  if (intent === "save-date") {
    const areaIds = Array.from(form.keys())
      .filter((key) => key.startsWith("area-") && key.endsWith("-capacity"))
      .map((key) => Number(key.slice("area-".length, -"-capacity".length)));
    result = await saveDateCapacityOverrides(env.trice_auction_db, {
      date,
      isOpen: form.get("isOpen") === "true",
      dailyCapacityOverride: optionalNumber(form, "dailyCapacityOverride"),
      note: String(form.get("note") ?? ""),
      areas: areaIds.map((itemAreaId) => ({
        itemAreaId,
        capacityOverride: optionalNumber(form, `area-${itemAreaId}-capacity`),
        overflowOverride: optionalNumber(form, `area-${itemAreaId}-overflow`),
      })),
    });
  } else if (intent === "reset-date") {
    result = await resetDateCapacityOverrides(env.trice_auction_db, date);
  } else {
    result = { ok: false, errors: ["Unknown scheduling action."] };
  }
  return data(result, { status: result.ok ? 200 : 400 });
}

export default function AdminSchedule({ loaderData, actionData }: Route.ComponentProps) {
  const selected = loaderData.selected;
  return (
    <main className="min-h-screen bg-stone-50 text-stone-900">
      <div className="mx-auto max-w-7xl px-6 py-12">
        <header className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-stone-200 pb-8">
          <div>
            <p className="text-sm font-semibold tracking-[0.18em] text-amber-700 uppercase">Trice Auctions · Administration</p>
            <h1 className="mt-2 text-4xl font-bold">Scheduling calendar</h1>
            <p className="mt-2 text-stone-600">Operational capacity, bookings, and date-specific overrides.</p>
          </div>
          <div className="flex gap-4 text-sm font-semibold text-amber-800"><Link to="/admin/users">Users</Link><Link to="/admin/capacity">Capacity settings</Link></div>
        </header>

        {actionData?.ok ? <Notice kind="success">{actionData.message}</Notice> : null}
        {actionData && !actionData.ok ? <Notice kind="error">{actionData.errors.join(" ")}</Notice> : null}

        <Form method="get" className="mb-6 flex gap-3"><input name="date" type="date" defaultValue={loaderData.selectedDate} className="rounded border border-stone-300 bg-white px-3 py-2" /><button className="rounded bg-stone-900 px-4 py-2 font-semibold text-white">View date</button></Form>

        <section aria-labelledby="date-overrides-heading" className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
          <h2 id="date-overrides-heading" className="text-2xl font-bold">{selected.date} capacity controls</h2>
          <p className="mt-2 text-sm text-stone-700">Effective values are shown below. Leave a capacity field blank to use its global default; save an explanation for any override or closure.</p>
          <Form method="post" className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <input type="hidden" name="intent" value="save-date" />
            <input type="hidden" name="date" value={selected.date} />
            <label className="block text-sm font-semibold">Booking status<select name="isOpen" defaultValue={String(selected.isOpen)} className="mt-1 block w-full rounded border border-stone-300 bg-white p-2"><option value="true">Open for bookings</option><option value="false">Closed for bookings</option></select></label>
            <label className="block text-sm font-semibold">Daily capacity override<input name="dailyCapacityOverride" type="number" min="0" step="0.01" defaultValue={selected.dailyCapacityOverridden ? selected.dailyCapacityPoints : ""} placeholder={`Default: ${selected.dailyCapacityPoints}`} className="mt-1 block w-full rounded border border-stone-300 bg-white p-2" /></label>
            <label className="block text-sm font-semibold md:col-span-2">Admin note / reason<textarea name="note" defaultValue={selected.note ?? ""} className="mt-1 block w-full rounded border border-stone-300 bg-white p-2" /></label>
            {selected.areas.map((area) => <fieldset key={area.id} className="rounded border border-amber-200 bg-white p-3"><legend className="px-1 text-sm font-bold">{area.name} {area.overridden ? "(override active)" : "(global default)"}</legend><label className="mt-2 block text-xs font-semibold">Capacity override<input name={`area-${area.id}-capacity`} type="number" min="0" step="0.01" defaultValue={area.capacityOverridden ? area.capacityPoints : ""} placeholder={`Default/effective: ${area.capacityPoints}`} className="mt-1 block w-full rounded border border-stone-300 p-2" /></label><label className="mt-2 block text-xs font-semibold">Overflow override<input name={`area-${area.id}-overflow`} type="number" min="0" step="0.01" defaultValue={area.overflowOverridden ? area.overflowAllowancePoints : ""} placeholder={`Default/effective: ${area.overflowAllowancePoints}`} className="mt-1 block w-full rounded border border-stone-300 p-2" /></label></fieldset>)}
            <div className="flex gap-3 md:col-span-2 xl:col-span-4"><button className="rounded bg-stone-900 px-4 py-2 font-semibold text-white">Save date settings</button></div>
          </Form>
          <Form method="post" className="mt-3"><input type="hidden" name="intent" value="reset-date" /><input type="hidden" name="date" value={selected.date} /><button className="text-sm font-semibold text-amber-900 underline">Reset this date to global defaults</button></Form>
        </section>

        <section className="mt-8" aria-labelledby="selected-appointments-heading"><h2 id="selected-appointments-heading" className="text-2xl font-bold">Appointments on {selected.date}</h2>{loaderData.selectedAppointments.length === 0 ? <p className="mt-3 text-stone-600">No appointments are scheduled for this date.</p> : <ul className="mt-3 divide-y rounded border bg-white">{loaderData.selectedAppointments.map((appointment) => <li key={appointment.id} className="flex flex-wrap justify-between gap-2 p-3"><span>{appointment.time || "Time TBD"} · {appointment.customer}</span><span>{appointment.loadType} · {appointment.capacityPoints} points · {appointment.status}</span></li>)}</ul>}</section>

        <section className="mt-10" aria-labelledby="schedule-days-heading"><h2 id="schedule-days-heading" className="text-2xl font-bold">Upcoming date operations</h2><div className="mt-4 grid gap-4 lg:grid-cols-2">{loaderData.days.map((day) => <article key={day.date} className="rounded-xl border bg-white p-5"><div className="flex justify-between gap-3"><Link to={`/admin/schedule?date=${day.date}`} className="font-bold text-amber-800">{day.date}</Link><span className={day.isOpen ? "font-semibold text-emerald-700" : "font-semibold text-red-700"}>{day.isOpen ? "Open" : "Closed"}</span></div><p className="mt-2 text-sm">{day.scheduledAppointments} scheduled · Daily: {day.usedPoints} / {day.dailyCapacityPoints} used · {day.remainingPoints} remaining {day.dailyCapacityOverridden ? "(override)" : "(global default)"}</p>{day.note ? <p className="mt-2 text-xs text-stone-600">Note: {day.note}</p> : null}<ul className="mt-3 space-y-1 text-sm">{day.areas.map((area) => <li key={area.id}>{area.name}: {area.usedPoints} / {area.capacityPoints} available, {area.remainingPoints} remaining{area.overflowAllowancePoints > 0 ? ` · overflow ${area.overflowUsagePoints} / ${area.overflowAllowancePoints}` : ""}{area.overridden ? " (override)" : ""}</li>)}</ul></article>)}</div></section>
      </div>
    </main>
  );
}

function optionalNumber(form: FormData, key: string) { const value = String(form.get(key) ?? "").trim(); return value === "" ? null : Number(value); }
function today() { return new Date().toISOString().slice(0, 10); }
function isIsoDate(value: string) { return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime()); }
function Notice({ kind, children }: { kind: "success" | "error"; children: React.ReactNode }) { return <p className={`mb-5 rounded border p-3 ${kind === "success" ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50"}`} role={kind === "success" ? "status" : "alert"}>{children}</p>; }
