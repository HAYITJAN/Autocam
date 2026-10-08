import { CalendarDays, RotateCcw, Search, SlidersHorizontal } from "lucide-react";
import { useEffect, useState } from "react";

import { useCameraOptions, useDistricts, useViolationTypes } from "@/api/queries";
import { Select } from "@/components/Select";
import { cn } from "@/lib/format";
import { tDynamic } from "@/lib/i18n";
import { categoryColor } from "@/lib/palette";

import { CONFIDENCE_LEVELS, DIRECTIONS, PERIODS, STATUSES, type FilterKey, type ViolationFiltersState } from "./filters";

/** Text input committed on Enter / blur, so typing does not refetch on every key. */
function CommitInput({
  value,
  onCommit,
  placeholder,
  className,
  icon = false,
}: {
  value: string;
  onCommit: (value: string) => void;
  placeholder: string;
  className?: string;
  icon?: boolean;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => {
    if (draft.trim() !== value) onCommit(draft.trim());
  };
  return (
    <form
      className={cn("relative", className)}
      onSubmit={(event) => {
        event.preventDefault();
        commit();
      }}
    >
      {icon && <Search className="pointer-events-none absolute left-3.5 top-3 h-4 w-4 text-mute" />}
      <input className={cn("input", icon && "pl-9")} placeholder={placeholder} value={draft} onChange={(event) => setDraft(event.target.value)} onBlur={commit} />
    </form>
  );
}

/**
 * Filter panel shared by every violations page. Every control writes to the URL;
 * the pages derive all KPIs, charts and tables from the same `apiParams`.
 */
export function FilterBar({ filters, hide = [] }: { filters: ViolationFiltersState; hide?: FilterKey[] }) {
  const cameras = useCameraOptions();
  const districts = useDistricts();
  const types = useViolationTypes();
  const { get, set } = filters;
  const shown = (key: FilterKey) => !hide.includes(key);

  return (
    <div className="card mb-5 space-y-3 p-3">
      <div className="flex flex-wrap items-center gap-3">
        {shown("search") && (
          <CommitInput
            icon
            className="min-w-60 flex-1"
            value={get("search")}
            onCommit={(value) => set({ search: value })}
            placeholder="Davlat raqami, kamera kodi, qoidabuzarlik turi yoki ID…"
          />
        )}
        <div className="segmented">
          {PERIODS.map((period) => (
            <button
              key={period.value}
              type="button"
              onClick={() =>
                set(
                  period.value === "custom"
                    ? { period: "custom", from: filters.range.from, to: filters.range.to }
                    : { period: period.value === "30d" ? null : period.value, from: null, to: null },
                )
              }
              className={cn("segmented-item", filters.period === period.value && "segmented-active")}
            >
              {period.label}
            </button>
          ))}
        </div>
        {filters.period === "custom" && (
          <div className="flex h-10 items-center gap-2 rounded-full border border-line bg-white px-4">
            <CalendarDays className="h-4 w-4 text-mute" />
            <input type="date" className="bg-transparent text-sm outline-none" value={filters.range.from} max={filters.range.to} onChange={(event) => set({ from: event.target.value })} />
            <span className="text-mute">→</span>
            <input type="date" className="bg-transparent text-sm outline-none" value={filters.range.to} min={filters.range.from} onChange={(event) => set({ to: event.target.value })} />
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="hidden items-center gap-1.5 px-1 text-xs font-medium text-mute sm:inline-flex">
          <SlidersHorizontal className="h-3.5 w-3.5" /> Filtrlar
        </span>
        {shown("type") && (
          <Select
            className="w-44"
            value={get("type")}
            onChange={(value) => set({ type: value })}
            placeholder="Barcha turlar"
            options={(types.data ?? []).map((type) => ({ value: type.code, label: type.name_uz, color: categoryColor(type.code, type.color) }))}
          />
        )}
        {shown("camera") && (
          <Select
            className="w-44"
            value={get("camera")}
            onChange={(value) => set({ camera: value })}
            placeholder="Barcha kameralar"
            menuClassName="min-w-80"
            options={(cameras.data?.items ?? []).map((camera) => ({ value: String(camera.id), label: camera.name, hint: camera.code }))}
          />
        )}
        {shown("district") && (
          <Select
            className="w-40"
            value={get("district")}
            onChange={(value) => set({ district: value })}
            placeholder="Barcha tumanlar"
            options={(districts.data ?? []).map((district) => ({ value: String(district.id), label: district.name }))}
          />
        )}
        {shown("direction") && (
          <Select
            className="w-36"
            value={get("direction")}
            onChange={(value) => set({ direction: value })}
            placeholder="Yo‘nalish"
            options={DIRECTIONS.map((direction) => ({ value: direction.value, label: `${direction.arrow} ${direction.label}` }))}
          />
        )}
        {shown("status") && (
          <Select
            className="w-40"
            value={get("status")}
            onChange={(value) => set({ status: value })}
            placeholder="Barcha statuslar"
            options={STATUSES.map((status) => ({ value: status, label: tDynamic("violation.status", status) }))}
          />
        )}
        {shown("conf") && (
          <Select className="w-32" value={get("conf")} onChange={(value) => set({ conf: value })} placeholder="AI aniqlik" options={CONFIDENCE_LEVELS} />
        )}
        {shown("plate") && <CommitInput className="w-36" value={get("plate")} onCommit={(value) => set({ plate: value })} placeholder="Davlat raqami" />}
        {shown("model") && <CommitInput className="w-40" value={get("model")} onCommit={(value) => set({ model: value })} placeholder="Avtomobil modeli" />}
        {filters.activeCount > 0 && (
          <button type="button" className="btn-secondary ml-auto" onClick={filters.reset}>
            <RotateCcw className="h-4 w-4" /> Tozalash
            <span className="rounded-full bg-ink px-1.5 text-[10px] font-semibold text-white">{filters.activeCount}</span>
          </button>
        )}
      </div>
    </div>
  );
}
