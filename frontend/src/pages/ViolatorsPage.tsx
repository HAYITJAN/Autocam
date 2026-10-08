import { ArrowDownUp } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { useViolators } from "@/api/queries";
import { Select } from "@/components/Select";
import { CardHeader, PageHeader, Pagination, PageSizeSelect, PlateNumber, QueryView, VehicleStatusBadge } from "@/components/ui";
import { FilterBar } from "@/components/violations/FilterBar";
import { useViolationFilters } from "@/components/violations/filters";
import { ConfidenceMeter, VehicleLabel } from "@/components/violations/parts";
import { ViolationsNav } from "@/components/violations/ViolationsNav";
import { cn, formatDateTime, formatNumber } from "@/lib/format";
import { categoryColor } from "@/lib/palette";

const SORTS = [
  { value: "-violations", label: "Ko‘p qoidabuzarlik" },
  { value: "-last_at", label: "Oxirgi hodisa" },
  { value: "plate_number", label: "Davlat raqami" },
];

/** Vehicles as the object of violations: one row per vehicle with its event count. */
export default function ViolatorsPage() {
  const filters = useViolationFilters();
  const navigate = useNavigate();
  const { get, set } = filters;
  const repeat = get("repeat") === "1";
  const page = Number(get("page") || 1);
  const pageSize = Number(get("size") || 20);
  const sort = get("vsort") || "-violations";
  const query = useViolators({ ...filters.apiParams, min_violations: repeat ? 2 : 1, sort, page, page_size: pageSize });

  return (
    <>
      <PageHeader
        title="Qoidabuzar avtomobillar"
        subtitle="Har bir avtomobil bir marta — uning tanlangan davrdagi barcha qoidabuzarliklari bilan"
        crumbs={[{ label: "Bosh sahifa", to: "/" }, { label: "Qoidabuzarliklar", to: filters.linkTo("/violations") }, { label: "Avtomobillar" }]}
      />
      <ViolationsNav filters={filters} />
      <FilterBar filters={filters} />

      <section className="card overflow-hidden">
        <CardHeader
          title={repeat ? "Takroriy qoidabuzarlar" : "Barcha qoidabuzarlar"}
          subtitle={query.data ? `${formatNumber(query.data.meta.total)} ta avtomobil` : undefined}
          action={
            <div className="flex flex-wrap items-center gap-2">
              <div className="segmented">
                <button type="button" className={cn("segmented-item", !repeat && "segmented-active")} onClick={() => set({ repeat: null })}>
                  Barchasi
                </button>
                <button type="button" className={cn("segmented-item", repeat && "segmented-active")} onClick={() => set({ repeat: "1" })}>
                  Takroriy (2+)
                </button>
              </div>
              <Select
                className="w-52"
                icon={ArrowDownUp}
                aria-label="Saralash"
                value={sort}
                onChange={(value) => set({ vsort: value === "-violations" ? null : value })}
                options={SORTS}
              />
            </div>
          }
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
                      <th className="th text-right">Qoidabuzarliklar</th>
                      <th className="th">Turlar</th>
                      <th className="th">Oxirgi hodisa</th>
                      <th className="th">Oxirgi kamera</th>
                      <th className="th">AI aniqlik</th>
                      <th className="th">Holati</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {data.items.map((item, index) => (
                      <tr key={item.vehicle.id} onClick={() => navigate(`/vehicles/${item.vehicle.id}`)} className="cursor-pointer transition hover:bg-soft">
                        <td className="td text-xs tabular-nums text-mute">{(data.meta.page - 1) * data.meta.page_size + index + 1}</td>
                        <td className="td">
                          <PlateNumber value={item.vehicle.plate_display} />
                        </td>
                        <td className="td">
                          <VehicleLabel vehicle={item.vehicle} />
                          {item.vehicle_type && <div className="text-[11px] text-mute">{item.vehicle_type.name_uz}</div>}
                        </td>
                        <td className="td text-right">
                          <span className={cn("text-[15px] font-semibold tabular-nums", item.violations > 1 ? "text-rose-600" : "text-ink")}>{item.violations}</span>
                        </td>
                        <td className="td">
                          <div className="flex max-w-64 flex-wrap gap-1">
                            {item.types.slice(0, 3).map((type) => (
                              <span key={type.code} className="inline-flex items-center gap-1 rounded-full bg-soft px-2 py-0.5 text-[11px] text-ink/80">
                                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: categoryColor(type.code, type.color) }} />
                                {type.name}
                                <b className="font-semibold">{type.count}</b>
                              </span>
                            ))}
                            {item.types.length > 3 && <span className="text-[11px] text-mute">+{item.types.length - 3}</span>}
                          </div>
                        </td>
                        <td className="td whitespace-nowrap text-[13px] text-ink/80">{formatDateTime(item.last_at)}</td>
                        <td className="td whitespace-nowrap font-mono text-xs">{item.last_camera?.code ?? "—"}</td>
                        <td className="td">{item.avg_confidence !== null ? <ConfidenceMeter value={item.avg_confidence} /> : "—"}</td>
                        <td className="td">
                          <VehicleStatusBadge status={item.status} />
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
      </section>
    </>
  );
}
