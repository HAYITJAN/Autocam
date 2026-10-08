import { ArrowRight } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";

import { useViolations } from "@/api/queries";
import { CardHeader, Pagination, PageSizeSelect, PlateNumber, QueryView, TypeChip, ViolationStatusBadge } from "@/components/ui";
import type { QueryParams } from "@/lib/api";
import { cn, formatClock, formatDate, formatNumber } from "@/lib/format";

import { EventDrawer } from "./EventDrawer";
import { directionLabel, type ViolationFiltersState } from "./filters";
import { ConfidenceMeter, VehicleLabel } from "./parts";

type SortKey = "occurred_at" | "ai_confidence";

/**
 * Violation events for the current filters. Page, size, sort and the open
 * drawer (`v`) live in the URL next to the filters.
 */
export function EventsTable({
  filters,
  params,
  title = "Qoidabuzarlik hodisalari",
  subtitle,
  showType = true,
  action,
}: {
  filters: ViolationFiltersState;
  /** Extra params on top of the shared filters (e.g. a fixed violation type). */
  params?: QueryParams;
  title?: string;
  subtitle?: string;
  showType?: boolean;
  action?: ReactNode;
}) {
  const { get, set } = filters;
  const page = Number(get("page") || 1);
  const pageSize = Number(get("size") || 20);
  const sort = get("sort") || "-occurred_at";
  const selected = Number(get("v")) || null;
  const query = useViolations({ ...filters.apiParams, ...params, sort, page, page_size: pageSize });

  const sortButton = (key: SortKey, label: string) => {
    const active = sort.replace("-", "") === key;
    const descending = sort.startsWith("-");
    return (
      <button
        type="button"
        className={cn("whitespace-nowrap hover:text-ink", active && "text-ink")}
        onClick={() => set({ sort: active && descending ? key : `-${key}` })}
      >
        {label} {active ? (descending ? "↓" : "↑") : ""}
      </button>
    );
  };

  return (
    <section className="card overflow-hidden">
      <CardHeader
        title={title}
        subtitle={subtitle ?? (query.data ? `${formatNumber(query.data.meta.total)} ta hodisa topildi` : undefined)}
        action={action}
      />
      <QueryView query={query} isEmpty={(data) => data.items.length === 0}>
        {(data) => (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-line">
                <thead>
                  <tr>
                    <th className="th w-12">№</th>
                    <th className="th">Davlat raqami</th>
                    <th className="th">Avtomobil</th>
                    {showType && <th className="th">Qoidabuzarlik</th>}
                    <th className="th">{sortButton("occurred_at", "Sana")}</th>
                    <th className="th">Vaqt</th>
                    <th className="th">Kamera</th>
                    <th className="th">Yo‘nalish</th>
                    <th className="th">{sortButton("ai_confidence", "AI aniqlik")}</th>
                    <th className="th">Status</th>
                    <th className="th" aria-label="Batafsil" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {data.items.map((item, index) => (
                    <tr
                      key={item.id}
                      onClick={() => set({ v: String(item.id) }, { keepPage: true })}
                      className={cn("cursor-pointer transition hover:bg-soft", selected === item.id && "bg-accent-50")}
                    >
                      <td className="td text-xs tabular-nums text-mute">{(data.meta.page - 1) * data.meta.page_size + index + 1}</td>
                      <td className="td">
                        <PlateNumber value={item.vehicle?.plate_display ?? item.plate_number} />
                      </td>
                      <td className="td">
                        <VehicleLabel vehicle={item.vehicle} />
                      </td>
                      {showType && (
                        <td className="td whitespace-nowrap">
                          <TypeChip name={item.type.name_uz} code={item.type.code} color={item.type.color} />
                        </td>
                      )}
                      <td className="td whitespace-nowrap text-[13px] text-ink">{formatDate(item.occurred_at)}</td>
                      <td className="td whitespace-nowrap text-[13px] tabular-nums text-ink/80">{formatClock(item.occurred_at)}</td>
                      <td className="td">
                        <div className="whitespace-nowrap font-mono text-xs font-semibold text-ink">{item.camera.code}</div>
                        <div className="max-w-44 truncate text-[11px] text-mute">{item.location_name ?? item.camera.name}</div>
                      </td>
                      <td className="td whitespace-nowrap text-[13px]">{directionLabel(item.direction)}</td>
                      <td className="td">
                        <ConfidenceMeter value={item.ai_confidence} />
                      </td>
                      <td className="td">
                        <ViolationStatusBadge status={item.status} />
                      </td>
                      <td className="td text-right">
                        <Link
                          to={`/violations/${item.id}`}
                          onClick={(event) => event.stopPropagation()}
                          title="Batafsil sahifa"
                          className="icon-btn h-8 w-8"
                        >
                          <ArrowRight className="h-4 w-4" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              meta={data.meta}
              onPage={(next) => set({ page: String(next) })}
              extra={<PageSizeSelect value={pageSize} onChange={(size) => set({ size: String(size) })} />}
            />
          </>
        )}
      </QueryView>
      {selected !== null && <EventDrawer id={selected} onClose={() => set({ v: null }, { keepPage: true })} />}
    </section>
  );
}
