import { ArrowRight, BarChart3, CalendarDays, CheckCircle2, Clock3, Eye, RotateCcw, Search, TriangleAlert, XCircle } from "lucide-react";
import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { useDistricts, useKpis, useViolation, useViolations, useViolationSummary, useViolationTypes } from "@/api/queries";
import { CameraPreview } from "@/components/CameraPreview";
import { Sparkline } from "@/components/charts";
import { ViolationActions } from "@/components/ViolationActions";
import {
  CountTabs,
  Field,
  KpiTile,
  Pagination,
  PageHeader,
  PageSizeSelect,
  PlateNumber,
  QueryView,
  SidePanel,
  ViolationStatusBadge,
} from "@/components/ui";
import { cn, formatConfidence, formatDateTime, formatNumber, formatPct, toIsoEnd, toIsoStart } from "@/lib/format";
import { t } from "@/lib/i18n";
import type { ViolationStatus } from "@/lib/types";

type StatusTab = ViolationStatus | "";

function confidenceTone(value: number): string {
  if (value >= 0.9) return "text-accent-700";
  if (value >= 0.75) return "text-amber-600";
  return "text-rose-600";
}

function ViolationPanel({ id, onClose }: { id: number; onClose: () => void }) {
  const query = useViolation(id);
  return (
    <QueryView query={query}>
      {(v) => (
        <SidePanel onClose={onClose} title={`Qoidabuzarlik #${v.code}`} badge={<ViolationStatusBadge status={v.status} />}>
          <div className="space-y-4 p-4">
            <CameraPreview seed={v.camera.id * 7 + v.id} status="ONLINE" className="rounded-xl">
              <span className="absolute left-2 top-2 rounded bg-black/60 px-1.5 py-0.5 font-mono text-[10px] text-white">{v.camera.code}</span>
              <span className="absolute bottom-2 right-2 rounded bg-black/60 px-1.5 py-0.5 font-mono text-[10px] text-white">
                {formatDateTime(v.occurred_at)}
              </span>
            </CameraPreview>
            <p className="rounded-2xl bg-soft px-3 py-2 text-xs text-mute">{t("violation.noEvidence")}</p>
            <dl className="divide-y divide-line">
              <Field label={t("violation.plate")}>
                <PlateNumber value={v.plate_number} />
              </Field>
              <Field label={t("violation.type")}>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: v.type.color }} />
                  {v.type.name_uz}
                </span>
              </Field>
              <Field label="Sana / vaqt">{formatDateTime(v.occurred_at)}</Field>
              <Field label={t("violation.camera")}>
                {v.camera.code} ({v.location?.district.name ?? "—"})
              </Field>
              <Field label="Manzil">{v.location?.name ?? "—"}</Field>
              <Field label={t("violation.confidence")}>
                <span className={confidenceTone(v.ai_confidence)}>{formatConfidence(v.ai_confidence)}</span>
              </Field>
              {v.detected_speed !== null && <Field label="Tezlik">{v.detected_speed.toFixed(0)} km/soat</Field>}
              {v.speed_limit !== null && <Field label="Ruxsat etilgan tezlik">{v.speed_limit} km/soat</Field>}
              {v.traffic_light_state && <Field label={t("violation.light")}>{v.traffic_light_state}</Field>}
              <Field label="Holat">
                <ViolationStatusBadge status={v.status} />
              </Field>
              <Field label="Qayd etgan">{v.reviewed_by?.full_name ?? "AI tizimi"}</Field>
              {v.rejection_reason && <Field label={t("violation.rejectReason")}>{v.rejection_reason}</Field>}
            </dl>
            <ViolationActions violation={v} />
            <Link to={`/violations/${v.id}`} className="btn-secondary w-full">
              To‘liq ma’lumot va tarix <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </SidePanel>
      )}
    </QueryView>
  );
}

export default function ViolationsPage() {
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get("search") ?? "");
  const [selected, setSelected] = useState<number | null>(null);

  const get = (key: string) => params.get(key) ?? "";
  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== "page") next.delete("page");
    setParams(next, { replace: true });
  };

  const summary = useViolationSummary();
  const kpis = useKpis();
  const types = useViolationTypes();
  const districts = useDistricts();
  const pageSize = Number(get("size") || 10);
  const violations = useViolations({
    search: get("search"),
    status: get("status") ? [get("status")] : undefined,
    violation_type: get("type") ? [get("type")] : undefined,
    district_id: get("district"),
    camera_id: get("camera"),
    date_from: get("from") ? toIsoStart(get("from")) : undefined,
    date_to: get("to") ? toIsoEnd(get("to")) : undefined,
    sort: get("sort") || "-occurred_at",
    page: Number(get("page") || 1),
    page_size: pageSize,
  });
  const s = summary.data;
  const total = Math.max(s?.total ?? 0, 1);
  const hasFilters = ["search", "status", "type", "district", "from", "to"].some((key) => params.has(key));

  return (
    <>
      <PageHeader
        title={t("nav.violations")}
        subtitle="Aniqlangan yo‘l harakati qoidabuzarliklari ro‘yxati va dalillari"
        actions={
          <Link to="/analytics" className="btn-secondary">
            <BarChart3 className="h-4 w-4" /> Tahlil
          </Link>
        }
        stats={
          <>
            <KpiTile
              icon={TriangleAlert}
              tone="red"
              label="Jami qoidabuzarliklar"
              value={formatNumber(s?.total)}
              delta={s?.today_delta_pct}
              deltaPositiveIsGood={false}
              hint={s ? `bugun ${formatNumber(s.today)}` : undefined}
              spark={kpis.data && <Sparkline values={kpis.data.violations_today.sparkline} />}
            />
            <KpiTile
              icon={CheckCircle2}
              tone="green"
              label="Tasdiqlangan"
              value={formatNumber(s?.confirmed)}
              hint={s ? `${formatPct((s.confirmed / total) * 100)} jamidan` : undefined}
              spark={kpis.data && <Sparkline values={kpis.data.confirmed_today.sparkline} />}
            />
            <KpiTile
              icon={Clock3}
              tone="amber"
              label="Ko‘rib chiqish kutilmoqda"
              value={formatNumber(s?.pending)}
              hint={s ? `${formatPct((s.pending / total) * 100)} jamidan` : undefined}
              spark={kpis.data && <Sparkline values={kpis.data.pending_today.sparkline} color="#f59e0b" />}
            />
            <KpiTile
              icon={XCircle}
              tone="slate"
              label="Rad etilgan"
              value={formatNumber(s?.rejected)}
              hint={s ? `${formatPct((s.rejected / total) * 100)} jamidan` : undefined}
            />
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <CountTabs<StatusTab>
          items={[
            { value: "", label: "Barchasi", count: s?.total },
            { value: "NEW", label: t("violation.status.NEW"), tone: "red" },
            { value: "UNDER_REVIEW", label: t("violation.status.UNDER_REVIEW"), tone: "amber" },
            { value: "CONFIRMED", label: t("violation.status.CONFIRMED"), count: s?.confirmed, tone: "green" },
            { value: "REJECTED", label: t("violation.status.REJECTED"), count: s?.rejected, tone: "blue" },
            { value: "ARCHIVED", label: t("violation.status.ARCHIVED") },
          ]}
          value={(get("status") as StatusTab) || ""}
          onChange={(value) => update("status", value)}
        />
        {hasFilters && (
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              setSearch("");
              setParams(new URLSearchParams(), { replace: true });
            }}
          >
            <RotateCcw className="h-4 w-4" /> Filtrlarni tozalash
          </button>
        )}
      </div>

      <div className="card mb-4 flex flex-wrap items-center gap-3 p-3">
        <form
          className="relative min-w-56 flex-1"
          onSubmit={(event) => {
            event.preventDefault();
            update("search", search.trim());
          }}
        >
          <Search className="pointer-events-none absolute left-3.5 top-3 h-4 w-4 text-mute" />
          <input
            className="input pl-9"
            placeholder="ID yoki davlat raqami…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onBlur={() => update("search", search.trim())}
          />
        </form>
        <select className="input w-48" value={get("type")} onChange={(event) => update("type", event.target.value)}>
          <option value="">Barcha turlar</option>
          {types.data?.map((type) => (
            <option key={type.code} value={type.code}>
              {type.name_uz}
            </option>
          ))}
        </select>
        <select className="input w-48" value={get("district")} onChange={(event) => update("district", event.target.value)}>
          <option value="">Barcha hududlar</option>
          {districts.data?.map((district) => (
            <option key={district.id} value={district.id}>
              {district.name}
            </option>
          ))}
        </select>
        <div className="flex h-10 items-center gap-2 rounded-full border border-line bg-white px-4">
          <CalendarDays className="h-4 w-4 text-mute" />
          <input type="date" className="bg-transparent text-sm outline-none" value={get("from")} onChange={(event) => update("from", event.target.value)} />
          <span className="text-mute">→</span>
          <input type="date" className="bg-transparent text-sm outline-none" value={get("to")} onChange={(event) => update("to", event.target.value)} />
        </div>
      </div>

      <div className={cn("grid gap-5", selected !== null && "xl:grid-cols-[1fr_400px]")}>
        <div className="card overflow-hidden">
          <QueryView query={violations} isEmpty={(data) => data.items.length === 0}>
            {(data) => (
              <>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-line">
                    <thead>
                      <tr>
                        <th className="th">{t("violation.code")}</th>
                        <th className="th">
                          <button
                            type="button"
                            className="whitespace-nowrap hover:text-ink"
                            onClick={() => update("sort", get("sort") === "occurred_at" ? "-occurred_at" : "occurred_at")}
                          >
                            Sana va vaqt {get("sort") === "occurred_at" ? "↑" : "↓"}
                          </button>
                        </th>
                        <th className="th">{t("violation.plate")}</th>
                        <th className="th">Qoidabuzarlik turi</th>
                        <th className="th">{t("violation.camera")}</th>
                        <th className="th">Manzil</th>
                        <th className="th text-right">{t("violation.confidence")}</th>
                        <th className="th">{t("violation.status")}</th>
                        <th className="th text-right">Amallar</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {data.items.map((item) => (
                        <tr
                          key={item.id}
                          onClick={() => setSelected(item.id)}
                          className={cn("cursor-pointer transition hover:bg-soft", selected === item.id && "bg-soft")}
                        >
                          <td className="td">
                            <div className="flex items-center gap-2.5">
                              <CameraPreview seed={item.camera.id * 7 + item.id} status="ONLINE" className="w-14 shrink-0 rounded-md" />
                              <span className="whitespace-nowrap font-mono text-xs font-bold text-ink">{item.code}</span>
                            </div>
                          </td>
                          <td className="td whitespace-nowrap text-xs">
                            <div className="text-ink">{formatDateTime(item.occurred_at).split(",")[0]}</div>
                            <div className="text-mute">{formatDateTime(item.occurred_at).split(",")[1]}</div>
                          </td>
                          <td className="td">
                            <span className="font-mono text-sm font-bold text-ink">{item.plate_number ?? "—"}</span>
                          </td>
                          <td className="td">
                            <span className="inline-flex items-center gap-2 text-sm">
                              <span
                                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-white"
                                style={{ backgroundColor: item.type.color }}
                              >
                                <TriangleAlert className="h-3.5 w-3.5" />
                              </span>
                              {item.type.name_uz}
                            </span>
                          </td>
                          <td className="td whitespace-nowrap font-mono text-xs">{item.camera.code}</td>
                          <td className="td text-sm">{item.location_name ?? "—"}</td>
                          <td className={cn("td text-right font-semibold", confidenceTone(item.ai_confidence))}>
                            {formatConfidence(item.ai_confidence)}
                          </td>
                          <td className="td">
                            <ViolationStatusBadge status={item.status} />
                          </td>
                          <td className="td text-right">
                            <span className="inline-flex gap-1">
                              <button
                                type="button"
                                title={t("common.view")}
                                className="icon-btn h-8 w-8"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setSelected(item.id);
                                }}
                              >
                                <Eye className="h-4 w-4" />
                              </button>
                              <Link
                                to={`/violations/${item.id}`}
                                onClick={(event) => event.stopPropagation()}
                                title="Batafsil"
                                className="icon-btn h-8 w-8 bg-ink text-white hover:bg-black"
                              >
                                <ArrowRight className="h-4 w-4" />
                              </Link>
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Pagination
                  meta={data.meta}
                  onPage={(page) => update("page", String(page))}
                  extra={<PageSizeSelect value={pageSize} onChange={(size) => update("size", String(size))} />}
                />
              </>
            )}
          </QueryView>
        </div>
        {selected !== null && <ViolationPanel id={selected} onClose={() => setSelected(null)} />}
      </div>
    </>
  );
}
