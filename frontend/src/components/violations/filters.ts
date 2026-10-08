import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";

import type { QueryParams } from "@/lib/api";
import { daysAgoInput, toIsoEnd, toIsoStart } from "@/lib/format";
import type { EvidenceKind, ViolationStatus } from "@/lib/types";

/**
 * Filter state of the violations module lives in the URL, so every page
 * (dashboard, type, violators, cameras) shares it and links stay shareable.
 * `apiParams` maps it 1:1 onto the backend `ViolationFilters` query params.
 */

export type PeriodPreset = "today" | "7d" | "30d" | "90d" | "custom";

export const PERIODS: { value: PeriodPreset; label: string }[] = [
  { value: "today", label: "Bugun" },
  { value: "7d", label: "7 kun" },
  { value: "30d", label: "30 kun" },
  { value: "90d", label: "90 kun" },
  { value: "custom", label: "Oraliq" },
];

const PERIOD_DAYS: Record<Exclude<PeriodPreset, "custom">, number> = { today: 0, "7d": 6, "30d": 29, "90d": 89 };
const DEFAULT_PERIOD: Exclude<PeriodPreset, "custom"> = "30d";

/** URL keys that narrow the data set (paging, sorting and the open drawer are not filters). */
export const FILTER_KEYS = ["camera", "district", "direction", "type", "plate", "model", "status", "conf", "search"] as const;
export type FilterKey = (typeof FILTER_KEYS)[number] | "period" | "from" | "to";

/** Keys that only control the view and must not leak into links to other pages. */
const VIEW_KEYS = ["page", "size", "sort", "v", "repeat", "vsort"];

export const DIRECTIONS: { value: string; label: string; arrow: string }[] = [
  { value: "NORTH", label: "Shimol", arrow: "↑" },
  { value: "SOUTH", label: "Janub", arrow: "↓" },
  { value: "EAST", label: "Sharq", arrow: "→" },
  { value: "WEST", label: "G‘arb", arrow: "←" },
];

export function directionLabel(value: string | null | undefined): string {
  if (!value) return "—";
  const item = DIRECTIONS.find((direction) => direction.value === value);
  return item ? `${item.arrow} ${item.label}` : value;
}

export const STATUSES: ViolationStatus[] = ["NEW", "UNDER_REVIEW", "CONFIRMED", "REJECTED", "ARCHIVED"];

export const CONFIDENCE_LEVELS = [
  { value: "90", label: "≥ 90%" },
  { value: "75", label: "≥ 75%" },
  { value: "60", label: "≥ 60%" },
];

export const EVIDENCE_LABELS: Record<EvidenceKind, string> = {
  FULL_FRAME: "Qoidabuzarlik kadri",
  VEHICLE: "Avtomobil kadri",
  PLATE: "Davlat raqami",
  CONTEXT: "To‘liq kadr (oldin)",
  VIDEO: "Video",
};

export interface DateRange {
  from: string;
  to: string;
}

function periodRange(period: PeriodPreset, from: string, to: string): DateRange {
  const today = daysAgoInput(0);
  if (period === "custom") {
    const start = from || daysAgoInput(PERIOD_DAYS[DEFAULT_PERIOD]);
    const end = to || today;
    return start <= end ? { from: start, to: end } : { from: end, to: start };
  }
  return { from: daysAgoInput(PERIOD_DAYS[period]), to: today };
}

function isPeriod(value: string | null): value is PeriodPreset {
  return PERIODS.some((item) => item.value === value);
}

export function useViolationFilters() {
  const [params, setParams] = useSearchParams();
  const get = useCallback((key: string) => params.get(key) ?? "", [params]);

  const rawPeriod = params.get("period");
  const period: PeriodPreset = isPeriod(rawPeriod) ? rawPeriod : DEFAULT_PERIOD;
  const range = periodRange(period, get("from"), get("to"));

  const apiParams = useMemo<QueryParams>(() => {
    const conf = Number(get("conf"));
    return {
      date_from: toIsoStart(range.from),
      date_to: toIsoEnd(range.to),
      camera_id: get("camera") || undefined,
      district_id: get("district") || undefined,
      direction: get("direction") || undefined,
      violation_type: get("type") || undefined,
      plate: get("plate").trim() || undefined,
      vehicle_model: get("model").trim() || undefined,
      status: get("status") || undefined,
      confidence_min: conf > 0 ? conf / 100 : undefined,
      search: get("search").trim() || undefined,
    };
  }, [get, range.from, range.to]);

  /** Patch URL params; any filter change resets paging. Empty values are removed. */
  const set = useCallback(
    (patch: Partial<Record<string, string | null>>, { keepPage = false } = {}) => {
      setParams(
        (current) => {
          const next = new URLSearchParams(current);
          for (const [key, value] of Object.entries(patch)) {
            if (value) next.set(key, value);
            else next.delete(key);
          }
          if (!keepPage && !("page" in patch)) next.delete("page");
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  const reset = useCallback(() => {
    setParams(
      (current) => {
        const next = new URLSearchParams();
        for (const key of ["size", "sort"]) {
          const value = current.get(key);
          if (value) next.set(key, value);
        }
        return next;
      },
      { replace: true },
    );
  }, [setParams]);

  const activeCount = FILTER_KEYS.filter((key) => get(key)).length + (period !== DEFAULT_PERIOD ? 1 : 0);

  /** Link to another violations page carrying the current filters (plus overrides). */
  const linkTo = useCallback(
    (path: string, overrides: Record<string, string | null> = {}) => {
      const next = new URLSearchParams(params);
      for (const key of VIEW_KEYS) next.delete(key);
      for (const [key, value] of Object.entries(overrides)) {
        if (value) next.set(key, value);
        else next.delete(key);
      }
      const query = next.toString();
      return query ? `${path}?${query}` : path;
    },
    [params],
  );

  return { get, set, reset, linkTo, apiParams, period, range, activeCount };
}

export type ViolationFiltersState = ReturnType<typeof useViolationFilters>;
