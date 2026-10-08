import { Activity, ArrowRight, Car, Eye, Search, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";

import { useTop, useVehicle, useVehicles, useVehicleStatus, useVehicleSummary, useVehicleTypes, useVehicleViolations } from "@/api/queries";
import { CameraPreview } from "@/components/CameraPreview";
import { DonutChart, HorizontalBars } from "@/components/charts";
import {
  Badge,
  Card,
  CardHeader,
  CountTabs,
  Field,
  KpiTile,
  Pagination,
  PageHeader,
  QueryView,
  SidePanel,
  type TabItem,
} from "@/components/ui";
import { ApiError } from "@/lib/api";
import { cn, daysAgoInput, formatDateTime, formatNumber, formatRelative, toIsoEnd, toIsoStart } from "@/lib/format";
import { t } from "@/lib/i18n";
import { categoryColor } from "@/lib/palette";
import type { VehicleDetail, VehicleListItem, VehicleStatus } from "@/lib/types";
import { useHasPermission } from "@/stores/auth";

type Tab = "all" | "violators" | "WATCHLIST" | "BLACKLIST";
const STATUSES: VehicleStatus[] = ["NORMAL", "WATCHLIST", "BLACKLIST"];

function VehicleBadge({ vehicle }: { vehicle: Pick<VehicleListItem, "status" | "total_violations"> }) {
  if (vehicle.status === "BLACKLIST") return <Badge tone="red">Qora ro‘yxat</Badge>;
  if (vehicle.status === "WATCHLIST") return <Badge tone="amber">Kuzatuvda</Badge>;
  if (vehicle.total_violations > 0) return <Badge tone="red">Qoidabuzar</Badge>;
  return <Badge tone="green">Toza</Badge>;
}

function StatusForm({ vehicle }: { vehicle: VehicleDetail }) {
  const mutation = useVehicleStatus(vehicle.id);
  const [status, setStatus] = useState<VehicleStatus>(vehicle.status);
  const [reason, setReason] = useState(vehicle.status_reason ?? "");
  return (
    <form
      className="space-y-2 rounded-xl border border-line p-3"
      onSubmit={(event) => {
        event.preventDefault();
        mutation.mutate({ status, reason: reason.trim() || undefined });
      }}
    >
      <div className="text-sm font-semibold text-ink/80">{t("vehicle.changeStatus")}</div>
      <div className="flex gap-2">
        <select className="input" value={status} onChange={(event) => setStatus(event.target.value as VehicleStatus)}>
          {STATUSES.map((value) => (
            <option key={value} value={value}>
              {t(`vehicle.status.${value}`)}
            </option>
          ))}
        </select>
        <button type="submit" className="btn-primary" disabled={mutation.isPending}>
          {t("common.save")}
        </button>
      </div>
      <input className="input" placeholder={t("vehicle.reason")} value={reason} onChange={(event) => setReason(event.target.value)} />
      {mutation.isError && <p className="text-xs text-red-600">{mutation.error instanceof ApiError ? mutation.error.message : t("common.error")}</p>}
    </form>
  );
}

function VehiclePanel({ id, onClose }: { id: number; onClose: () => void }) {
  const vehicle = useVehicle(id);
  const violations = useVehicleViolations(id, 1);
  const canEdit = useHasPermission("violations.review");

  return (
    <QueryView query={vehicle}>
      {(v) => (
        <SidePanel onClose={onClose} title={<span className="font-mono">{v.plate_display}</span>} badge={<VehicleBadge vehicle={v} />}>
          <div className="space-y-4 p-4">
            <CameraPreview seed={v.id * 13} status="ONLINE" className="rounded-xl">
              {v.last_camera && (
                <span className="absolute left-2 top-2 rounded bg-black/60 px-1.5 py-0.5 font-mono text-[10px] text-white">{v.last_camera.code}</span>
              )}
            </CameraPreview>
            <dl className="divide-y divide-line">
              <Field label={t("vehicle.type")}>{v.vehicle_type?.name_uz ?? "—"}</Field>
              <Field label={t("vehicle.brandModel")}>{[v.brand, v.model].filter(Boolean).join(" ") || "—"}</Field>
              <Field label={t("vehicle.color")}>{v.color ?? "—"}</Field>
              <Field label="VIN">{v.vin ?? "—"}</Field>
              <Field label="Ro‘yxat holati">
                <VehicleBadge vehicle={v} />
              </Field>
              <Field label="Umumiy ko‘rishlar">{formatNumber(v.total_detections)}</Field>
              <Field label="Jami qoidabuzarliklar">
                <span className="text-red-600">{formatNumber(v.total_violations)}</span>
              </Field>
              <Field label="So‘nggi ko‘rish">
                {formatDateTime(v.last_seen_at)}
                {v.last_camera && <div className="text-xs font-normal text-mute">{v.last_camera.name}</div>}
              </Field>
            </dl>
            {v.violations_by_type.length > 0 && <DonutChart items={v.violations_by_type} total={v.total_violations} height={150} />}
            {canEdit && <StatusForm key={v.status} vehicle={v} />}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-bold text-ink">So‘nggi qoidabuzarliklar</span>
                <Link to={`/vehicles/${v.id}`} className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline">
                  Barchasi <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
              <QueryView query={violations} isEmpty={(data) => data.items.length === 0}>
                {(data) => (
                  <ul className="space-y-1">
                    {data.items.slice(0, 5).map((item) => (
                      <li key={item.id}>
                        <Link to={`/violations/${item.id}`} className="flex items-center gap-2 rounded-lg px-1.5 py-1 text-xs hover:bg-soft">
                          <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: categoryColor(item.type.code, item.type.color) }} />
                          <span className="min-w-0 flex-1 truncate text-ink/80">{item.type.name_uz}</span>
                          <span className="text-mute">{formatDateTime(item.occurred_at)}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </QueryView>
            </div>
          </div>
        </SidePanel>
      )}
    </QueryView>
  );
}

function BottomCharts() {
  const canAnalytics = useHasPermission("analytics.view");
  const period = { date_from: toIsoStart(daysAgoInput(29)), date_to: toIsoEnd(daysAgoInput(0)) };
  const top = useTop("vehicles", period, 10);
  const summary = useVehicleSummary();
  return (
    <div className="mt-5 grid gap-5 xl:grid-cols-2">
      {canAnalytics && (
        <Card>
          <CardHeader title="Qoidabuzarliklar bo‘yicha top 10 avtomobil" subtitle="So‘nggi 30 kun" />
          <div className="p-4">
            <QueryView query={top} isEmpty={(items) => items.length === 0}>
              {(items) => <HorizontalBars items={items.map((item) => ({ label: item.label, count: item.count}))} />}
            </QueryView>
          </div>
        </Card>
      )}
      <Card>
        <CardHeader title="Avtomobil turlari" />
        <div className="p-4">
          <QueryView query={summary}>{(data) => <DonutChart items={data.by_type} total={data.total} />}</QueryView>
        </div>
      </Card>
    </div>
  );
}

export default function VehiclesPage() {
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<Tab>("all");
  const [vehicleType, setVehicleType] = useState("");
  const [sort, setSort] = useState("-last_seen_at");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<number | null>(null);

  const summary = useVehicleSummary();
  const types = useVehicleTypes();
  const vehicles = useVehicles({
    search,
    vehicle_type: vehicleType,
    status: tab === "WATCHLIST" || tab === "BLACKLIST" ? tab : undefined,
    has_violations: tab === "violators" ? true : undefined,
    sort,
    page,
    page_size: 10,
  });

  const reset = <T,>(setter: (value: T) => void) => (value: T) => {
    setter(value);
    setPage(1);
  };
  const s = summary.data;
  const tabs: TabItem<Tab>[] = [
    { value: "all", label: "Barcha avtomobillar", count: s?.total },
    { value: "violators", label: "Qoidabuzarlik qilgan", count: s?.with_violations, tone: "red" },
    { value: "WATCHLIST", label: "Kuzatuv ro‘yxati", count: s?.watchlist, tone: "violet" },
    { value: "BLACKLIST", label: "Qora ro‘yxat", count: s?.blacklisted, tone: "red" },
  ];

  return (
    <>
      <PageHeader
        title={t("nav.vehicles")}
        subtitle="Yo‘l harakatida aniqlangan avtomobillar ro‘yxati va ma’lumotlari"
        stats={
          <>
            <KpiTile icon={Car} tone="blue" label="Jami avtomobillar" value={formatNumber(s?.total)} />
            <KpiTile icon={Activity} tone="amber" label="24 soatda faol" value={formatNumber(s?.active_24h)} />
            <KpiTile icon={TriangleAlert} tone="red" label="Qoidabuzarligi bor" value={formatNumber(s?.with_violations)} />
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <CountTabs items={tabs} value={tab} onChange={reset(setTab)} />
        <div className="flex-1" />
        <div className="relative w-60">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-mute" />
          <input className="input pl-9" placeholder="Davlat raqami, marka…" value={search} onChange={(event) => reset(setSearch)(event.target.value)} />
        </div>
        <select className="input w-44" value={vehicleType} onChange={(event) => reset(setVehicleType)(event.target.value)}>
          <option value="">Avtomobil turi</option>
          {types.data?.map((type) => (
            <option key={type.code} value={type.code}>
              {type.name_uz}
            </option>
          ))}
        </select>
        <select className="input w-48" value={sort} onChange={(event) => setSort(event.target.value)}>
          <option value="-last_seen_at">Oxirgi ko‘rilgan</option>
          <option value="-total_violations">Qoidabuzarliklar soni</option>
          <option value="-total_detections">Ko‘rishlar soni</option>
          <option value="plate_number">Davlat raqami</option>
        </select>
      </div>

      <div className={cn("grid gap-5", selected !== null && "xl:grid-cols-[1fr_380px]")}>
        <div className="card overflow-hidden">
          <QueryView query={vehicles} isEmpty={(data) => data.items.length === 0}>
            {(data) => (
              <>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-line">
                    <thead className="bg-soft/80">
                      <tr>
                        <th className="th">#</th>
                        <th className="th">{t("vehicle.plate")}</th>
                        <th className="th">Avtomobil turi</th>
                        <th className="th">{t("vehicle.brandModel")}</th>
                        <th className="th">So‘nggi ko‘rish</th>
                        <th className="th text-right">Ko‘rishlar</th>
                        <th className="th text-right">{t("vehicle.violations")}</th>
                        <th className="th">Holat</th>
                        <th className="th text-right">Amallar</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {data.items.map((vehicle, index) => (
                        <tr
                          key={vehicle.id}
                          onClick={() => setSelected(vehicle.id)}
                          className={cn("cursor-pointer transition hover:bg-soft", selected === vehicle.id && "bg-brand-50/60")}
                        >
                          <td className="td text-xs text-mute">{(data.meta.page - 1) * data.meta.page_size + index + 1}</td>
                          <td className="td">
                            <div className="flex items-center gap-2.5">
                              <CameraPreview seed={vehicle.id * 13} status="ONLINE" className="w-14 shrink-0 rounded-md" />
                              <span className="whitespace-nowrap font-mono text-sm font-bold text-ink">{vehicle.plate_display}</span>
                            </div>
                          </td>
                          <td className="td">
                            {vehicle.vehicle_type ? (
                              <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[13px]">
                                <Car className="h-4 w-4" style={{ color: categoryColor(vehicle.vehicle_type.code, vehicle.vehicle_type.color) }} />
                                {vehicle.vehicle_type.name_uz}
                              </span>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="td">{[vehicle.brand, vehicle.model].filter(Boolean).join(" ") || "—"}</td>
                          <td className="td text-xs">
                            <div className="text-ink/80">{formatRelative(vehicle.last_seen_at)}</div>
                            <div className="text-mute">{vehicle.last_camera?.name ?? "—"}</div>
                          </td>
                          <td className="td text-right">{formatNumber(vehicle.total_detections)}</td>
                          <td className={cn("td text-right font-bold", vehicle.total_violations > 0 ? "text-red-600" : "text-mute")}>
                            {formatNumber(vehicle.total_violations)}
                          </td>
                          <td className="td">
                            <VehicleBadge vehicle={vehicle} />
                          </td>
                          <td className="td text-right">
                            <button
                              type="button"
                              className="rounded-lg p-1.5 text-brand-600 hover:bg-brand-50"
                              onClick={(event) => {
                                event.stopPropagation();
                                setSelected(vehicle.id);
                              }}
                            >
                              <Eye className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Pagination meta={data.meta} onPage={setPage} />
              </>
            )}
          </QueryView>
        </div>
        {selected !== null && <VehiclePanel id={selected} onClose={() => setSelected(null)} />}
      </div>

      <BottomCharts />
    </>
  );
}
