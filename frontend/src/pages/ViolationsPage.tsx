import { ArrowRight, CalendarDays, CheckCircle2, Clock3, Eye, RotateCcw, Search, TriangleAlert, XCircle } from "lucide-react";
import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { useDistricts, useKpis, useViolation, useViolations, useViolationSummary, useViolationTypes } from "@/api/queries";
import { CameraPreview } from "@/components/CameraPreview";
import { Sparkline } from "@/components/charts";
import { ViolationActions } from "@/components/ViolationActions";
import {
  Field,
  KpiTile,
  Pagination,
  PageHeader,
  PlateNumber,
  QueryView,
  SidePanel,
  ViolationStatusBadge,
} from "@/components/ui";
import { cn, formatConfidence, formatDateTime, formatNumber, formatPct, toIsoEnd, toIsoStart } from "@/lib/format";
import { t } from "@/lib/i18n";
import type { ViolationStatus } from "@/lib/types";

const STATUSES: ViolationStatus[] = ["NEW", "UNDER_REVIEW", "CONFIRMED", "REJECTED", "ARCHIVED"];

function confidenceTone(value: number): string {
  if (value >= 0.9) return "text-emerald-600";
  if (value >= 0.75) return "text-amber-600";
  return "text-red-600";
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
            <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">{t("violation.noEvidence")}</p>
            <dl className="divide-y divide-slate-100">
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
          <>
            <KpiTile
              icon={TriangleAlert}
              tone="red"
              label="Jami qoidabuzarliklar"
              value={formatNumber(s?.total)}
              hint={s ? `bugun ${formatNumber(s.today)}` : undefined}
              spark={kpis.data && <Sparkline values={kpis.data.violations_today.sparkline} color="#ef4444" />}
            />
            <KpiTile
              icon={CheckCircle2}
              tone="green"
              label="Tasdiqlangan"
              value={formatNumber(s?.confirmed)}
              hint={s ? formatPct((s.confirmed / total) * 100) : undefined}
              spark={kpis.data && <Sparkline values={kpis.data.confirmed_today.sparkline} color="#22c55e" />}
            />
            <KpiTile
              icon={Clock3}
              tone="blue"
              label="Ko‘rib chiqilmoqda"
              value={formatNumber(s?.pending)}
              hint={s ? formatPct((s.pending / total) * 100) : undefined}
              spark={kpis.data && <Sparkline values={kpis.data.pending_today.sparkline} color="#625fee" />}
            />
            <KpiTile icon={XCircle} tone="slate" label="Rad etilgan" value={formatNumber(s?.rejected)} hint={s ? formatPct((s.rejected / total) * 100) : undefined} />
          </>
        }
      />

      <div className="card mb-4 flex flex-wrap items-center gap-3 p-3">
        <div className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-1">
          <CalendarDays className="h-4 w-4 text-slate-400" />
          <input type="date" className="bg-transparent text-sm outline-none" value={get("from")} onChange={(event) => update("from", event.target.value)} />
          <span className="text-slate-400">→</span>
          <input type="date" className="bg-transparent text-sm outline-none" value={get("to")} onChange={(event) => update("to", event.target.value)} />
        </div>
        <form
          className="relative w-56"
          onSubmit={(event) => {
            event.preventDefault();
            update("search", search.trim());
          }}
        >
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
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
        <select className="input w-44" value={get("status")} onChange={(event) => update("status", event.target.value)}>
          <option value="">Barcha holat</option>
          {STATUSES.map((status) => (
            <option key={status} value={status}>
              {t(`violation.status.${status}`)}
            </option>
          ))}
        </select>
        {hasFilters && (
          <button
            type="button"
            className="btn-secondary ml-auto"
            onClick={() => {
              setSearch("");
              setParams(new URLSearchParams(), { replace: true });
            }}
          >
            <RotateCcw className="h-4 w-4" /> Tozalash
          </button>
        )}
      </div>

      <div className={cn("grid gap-5", selected !== null && "xl:grid-cols-[1fr_400px]")}>
        <div className="card overflow-hidden">
          <QueryView query={violations} isEmpty={(data) => data.items.length === 0}>
            {(data) => (
              <>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-100">
                    <thead className="bg-slate-50/80">
                      <tr>
                        <th className="th">{t("violation.code")}</th>
                        <th className="th">
                          <button
                            type="button"
                            className="whitespace-nowrap hover:text-slate-600"
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
                    <tbody className="divide-y divide-slate-100">
                      {data.items.map((item) => (
                        <tr
                          key={item.id}
                          onClick={() => setSelected(item.id)}
                          className={cn("cursor-pointer transition hover:bg-slate-50", selected === item.id && "bg-brand-50/60")}
                        >
                          <td className="td">
                            <div className="flex items-center gap-2.5">
                              <CameraPreview seed={item.camera.id * 7 + item.id} status="ONLINE" className="w-14 shrink-0 rounded-md" />
                              <span className="whitespace-nowrap font-mono text-xs font-bold text-brand-700">{item.code}</span>
                            </div>
                          </td>
                          <td className="td whitespace-nowrap text-xs">
                            <div className="text-slate-700">{formatDateTime(item.occurred_at).split(",")[0]}</div>
                            <div className="text-slate-500">{formatDateTime(item.occurred_at).split(",")[1]}</div>
                          </td>
                          <td className="td">
                            <span className="font-mono text-sm font-bold text-slate-900">{item.plate_number ?? "—"}</span>
                          </td>
                          <td className="td">
                            <span className="inline-flex items-center gap-2 text-sm">
                              <span
                                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-white"
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
                                className="rounded-lg p-1.5 text-brand-600 hover:bg-brand-50"
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
                                className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
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
                <div className="flex items-center">
                  <div className="flex-1">
                    <Pagination meta={data.meta} onPage={(page) => update("page", String(page))} />
                  </div>
                  <select className="input mr-4 w-28 border-slate-200 py-1 text-xs" value={pageSize} onChange={(event) => update("size", event.target.value)}>
                    {[10, 20, 50].map((size) => (
                      <option key={size} value={size}>
                        Sahifada: {size}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}
          </QueryView>
        </div>
        {selected !== null && <ViolationPanel id={selected} onClose={() => setSelected(null)} />}
      </div>
    </>
  );
}
