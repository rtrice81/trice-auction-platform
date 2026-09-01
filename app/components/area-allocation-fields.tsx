import { useState } from "react";

type ItemArea = { id: number; name: string };
type Allocation = { itemAreaId: number; percentage: number };

type AreaAllocationFieldsProps = {
  itemAreas: ItemArea[];
  allocations?: Allocation[];
  className?: string;
  inputClassName?: string;
  labelClassName?: string;
};

export function AreaAllocationFields({
  itemAreas,
  allocations = [],
  className = "grid gap-4 sm:grid-cols-3",
  inputClassName = "block w-20 rounded-lg border border-stone-300 bg-white px-3 py-2 font-semibold outline-none focus:border-[#9d302f] focus:ring-2 focus:ring-[#f2d8d7]",
  labelClassName = "rounded-2xl border border-stone-200 bg-white p-5 shadow-sm",
}: AreaAllocationFieldsProps) {
  const smalls = itemAreas.find((area) => area.name === "Smalls");
  const outdoor = itemAreas.find((area) => area.name === "Outdoor");
  const large = itemAreas.find((area) => area.name === "Large/Furniture");
  const initialValue = (area?: ItemArea) => area ? allocations.find((allocation) => allocation.itemAreaId === area.id)?.percentage ?? 0 : 0;
  const [smallsValue, setSmallsValue] = useState(String(initialValue(smalls)));
  const [outdoorValue, setOutdoorValue] = useState(String(initialValue(outdoor)));
  const remaining = 100 - (Number(smallsValue) || 0) - (Number(outdoorValue) || 0);

  return <div className={className}>{itemAreas.map((area) => {
    const isSmalls = area.id === smalls?.id;
    const isOutdoor = area.id === outdoor?.id;
    const isLarge = area.id === large?.id;
    const value = isSmalls ? smallsValue : isOutdoor ? outdoorValue : isLarge ? String(remaining) : String(initialValue(area));
    return <label key={area.id} className={labelClassName}>
      <span className="block font-semibold text-stone-950">{area.name}</span>
      <span className="mt-1 block text-sm text-stone-600">{isLarge ? "Calculated from the remaining load" : "Percentage of this load"}</span>
      <span className="mt-4 flex items-center gap-2"><input
        required={!isLarge}
        readOnly={isLarge}
        type="number"
        name={isLarge ? undefined : `allocation-${area.id}`}
        min="0"
        max="100"
        step="1"
        value={value}
        onChange={isSmalls ? (event) => setSmallsValue(event.target.value) : isOutdoor ? (event) => setOutdoorValue(event.target.value) : undefined}
        className={inputClassName}
      /><span className="text-sm text-stone-500">%</span></span>
    </label>;
  })}</div>;
}
