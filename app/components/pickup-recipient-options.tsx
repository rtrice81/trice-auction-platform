import type { InternalRecipient } from "../services/internal-appointment-notifications.server";

export const pickupRecipientFields = [
  ["receivePickupCreated", "Pickup Created"],
  ["receivePickupRescheduled", "Pickup Rescheduled"],
  ["receivePickupCancelled", "Pickup Cancelled"],
  ["receivePickupCompleted", "Pickup Completed"],
] as const;

export function PickupRecipientOptions({ recipient }: { recipient?: InternalRecipient }) {
  return <div className="flex flex-wrap gap-5 text-sm">{pickupRecipientFields.map(([field, label]) => <label key={field}><input className="mr-2" type="checkbox" name={field} defaultChecked={recipient?.[field] === 1}/>{label}</label>)}</div>;
}
