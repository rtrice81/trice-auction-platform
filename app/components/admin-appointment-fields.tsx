import { AreaAllocationFields } from "./area-allocation-fields";
import type { BookingInput, ItemArea } from "../services/booking.server";

type AppointmentFieldsProps = {
  dropoffTypes: Array<{ id: number; name: string }>;
  itemAreas: ItemArea[];
  submitted?: BookingInput | null;
  scheduleId?: number | null;
  selectedDate?: string;
};

/** Shared appointment inputs for the standalone page and schedule modal. */
export function AdminAppointmentFields({ dropoffTypes, itemAreas, submitted, scheduleId, selectedDate }: AppointmentFieldsProps) {
  return <>
    {scheduleId ? <><input type="hidden" name="scheduleId" value={scheduleId}/><p className="font-semibold">Drop-Off Date: {selectedDate}</p></> : null}
    <label>Load type<select required name="dropoffTypeId" defaultValue={submitted?.dropoffTypeId} className="mt-1 block w-full border p-2"><option value="">Choose load</option>{dropoffTypes.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}</select></label>
    <AreaAllocationFields itemAreas={itemAreas} allocations={submitted?.allocations}/>
    <label>Description<textarea name="description" defaultValue={submitted?.description || ""} className="mt-1 block w-full border p-2"/></label>
  </>;
}
