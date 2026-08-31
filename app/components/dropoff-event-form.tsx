type EventFormValues = {
  date: string;
  eventName: string | null;
  visibility: "public" | "private";
  isOpen: boolean;
  note: string | null;
  dailyCapacityPoints: number;
  areas: Array<{
    itemAreaId: number;
    name: string;
    capacityPoints: number;
    overflowAllowancePoints: number;
  }>;
};

export function DropoffEventForm({
  event,
  submitLabel,
  includeDate = true,
}: {
  event: EventFormValues;
  submitLabel: string;
  includeDate?: boolean;
}) {
  return (
    <div className="grid gap-5 md:grid-cols-2">
      {includeDate ? <label className="block text-sm font-semibold">Drop-off date<input required type="date" name="date" min={today()} defaultValue={event.date} className="mt-1 block w-full rounded border border-stone-300 bg-white p-2" /></label> : <input type="hidden" name="date" value={event.date} />}
      <label className="block text-sm font-semibold">Event / display name <span className="font-normal text-stone-500">(optional)</span><input name="eventName" defaultValue={event.eventName ?? ""} className="mt-1 block w-full rounded border border-stone-300 bg-white p-2" /></label>
      <label className="block text-sm font-semibold">Visibility<select name="visibility" defaultValue={event.visibility} className="mt-1 block w-full rounded border border-stone-300 bg-white p-2"><option value="private">Private / Internal</option><option value="public">Public</option></select></label>
      <label className="block text-sm font-semibold">Booking status<select name="isOpen" defaultValue={String(event.isOpen)} className="mt-1 block w-full rounded border border-stone-300 bg-white p-2"><option value="true">Open for bookings</option><option value="false">Closed for bookings</option></select></label>
      <label className="block text-sm font-semibold">Daily intake capacity<input required name="dailyCapacityPoints" type="number" min="0" step="0.01" defaultValue={event.dailyCapacityPoints} className="mt-1 block w-full rounded border border-stone-300 bg-white p-2" /></label>
      <label className="block text-sm font-semibold md:col-span-2">Admin note <span className="font-normal text-stone-500">(optional)</span><textarea name="note" defaultValue={event.note ?? ""} className="mt-1 block min-h-24 w-full rounded border border-stone-300 bg-white p-2" /></label>
      <section className="md:col-span-2"><h2 className="text-xl font-bold">Saved storage capacities</h2><p className="mt-1 text-sm text-stone-600">These values are saved with this event and are used for bookings on this date.</p><div className="mt-3 grid gap-4 lg:grid-cols-3">{event.areas.map((area) => <fieldset key={area.itemAreaId} className="rounded border border-stone-200 p-4"><legend className="px-1 font-semibold">{area.name}</legend><label className="mt-2 block text-sm">Capacity<input required name={`area-${area.itemAreaId}-capacity`} type="number" min="0" step="0.01" defaultValue={area.capacityPoints} className="mt-1 block w-full rounded border border-stone-300 p-2" /></label><label className="mt-3 block text-sm">Overflow allowance<input required name={`area-${area.itemAreaId}-overflow`} type="number" min="0" step="0.01" defaultValue={area.overflowAllowancePoints} className="mt-1 block w-full rounded border border-stone-300 p-2" /></label></fieldset>)}</div></section>
      <div className="md:col-span-2"><button className="rounded bg-stone-900 px-4 py-2 font-semibold text-white">{submitLabel}</button></div>
    </div>
  );
}

function today() {
  return new Date().toISOString().slice(0, 10);
}
