import { useEffect, useState } from "react";

type ItemArea = { id: number; name: string };
type Allocation = { itemAreaId: number; percentage: number };

type AreaAllocationFieldsProps = {
  itemAreas: ItemArea[];
  allocations?: Allocation[];
  className?: string;
  inputClassName?: string;
  labelClassName?: string;
  onTotalChange?: (total: number) => void;
};

export function AreaAllocationFields({
  itemAreas,
  allocations = [],
  className = "grid gap-4 sm:grid-cols-3",
  inputClassName = "block w-20 rounded-lg border border-stone-300 bg-white px-3 py-2 font-semibold outline-none focus:border-[#9d302f] focus:ring-2 focus:ring-[#f2d8d7]",
  labelClassName = "rounded-2xl border border-stone-200 bg-white p-5 shadow-sm",
  onTotalChange,
}: AreaAllocationFieldsProps) {
  const initialValue = (area?: ItemArea) => area ? allocations.find((allocation) => allocation.itemAreaId === area.id)?.percentage ?? 0 : 0;
  const [values, setValues] = useState(() => new Map(itemAreas.map((area) => [area.id, String(initialValue(area))])));
  const total = itemAreas.reduce((sum, area) => sum + (Number(values.get(area.id)) || 0), 0);
  useEffect(() => onTotalChange?.(total), [onTotalChange, total]);

  return <><div className={className}>{itemAreas.map((area) => {
    const value = values.get(area.id) ?? "0";
    return <label key={area.id} className={labelClassName}>
      <span className="block font-semibold text-stone-950">{area.name}</span>
      <span className="mt-1 block text-sm text-stone-600">Percentage of this load</span>
      <span className="mt-4 flex items-center gap-2"><input
        required
        type="number"
        name={`allocation-${area.id}`}
        min="0"
        max="100"
        step="1"
        value={value}
        onChange={(event) => setValues((current) => new Map(current).set(area.id, event.target.value))}
        className={inputClassName}
      /><span className="text-sm text-stone-500">%</span></span>
    </label>;
  })}</div><p className={total === 100 ? "mt-4 font-semibold text-emerald-800" : "mt-4 font-semibold text-amber-800"}>Total allocated: {total}%{total < 100 ? ` — ${100 - total}% remaining` : total > 100 ? ` — ${total - 100}% over` : ""}</p></>;
}
