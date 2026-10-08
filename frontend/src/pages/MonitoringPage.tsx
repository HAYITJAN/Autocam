import { ArrowRight, Camera, Car, CheckCircle2, Gauge, LayoutGrid, MapPin, Search, ShieldAlert, Timer, TriangleAlert, XCircle } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";

import {
  useCameras,
  useCameraSummary,
  useDistricts,
  useKpis,
  useRecentViolations,
  useViolationsTimeseries,
} from "@/api/queries";
import { CameraPreview } from "@/components/CameraPreview";
import { DonutChart, Sparkline, VolumeBars } from "@/components/charts";
import { Card, CardHeader, CameraStatusBadge, KpiTile, Pagination, PageHeader, QueryView, ShareBar, ViolationStatusBadge } from "@/components/ui";
import { cn, formatBucket, formatNumber, formatPct, formatTime } from "@/lib/format";
import { t } from "@/lib/i18n";
import { categoryColor } from "@/lib/palette";
import type { CameraListItem, CameraStatus, CameraSummary, DashboardKpis } from "@/lib/types";

const GRID_OPTIONS = [4, 6, 9] as const;

function Tile({ camera }: { camera: CameraListItem }) {
  return (
    <div className="card overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2">
        <span className="text-sm font-bold text-ink">{camera.code}</span>
        <CameraStatusBadge status={camera.status} />
        <span className="flex min-w-0 flex-1 items-center gap-1 truncate text-xs text-mute">
          <MapPin className="h-3 w-3 shrink-0" />
          <span className="truncate">{camera.location.name}</span>
        </span>
        <Link to={`/cameras/${camera.id}`} className="rounded-md p-1 text-mute hover:bg-soft hover:text-brand-600" title={t("common.view")}>
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
      <CameraPreview seed={camera.id} status={camera.status} />
      <div className="flex items-center justify-between bg-slate-900 px-3 py-1.5 text-[11px] text-slate-200">
        <span className="flex items-center gap-1">
          <ShieldAlert className="h-3.5 w-3.5 text-red-400" /> {camera.violations_today}
        </span>
        <span className="flex items-center gap-1">
          <Gauge className="h-3.5 w-3.5" /> FPS {camera.metrics.fps?.toFixed(0) ?? "—"}
        </span>
        <span className="flex items-center gap-1">
          <Timer className="h-3.5 w-3.5" /> {camera.metrics.latency_ms ?? "—"} ms
        </span>
      </div>
    </div>
  );
}

function RecentEvents() {
  const query = useRecentViolations(5);
  return (
    <Card>
      <CardHeader
        title="So‘nggi hodisalar"
        action={
          <Link to="/violations" className="flex items-center gap-1 text-sm font-medium text-brand-600 hover:underline">
            {t("common.viewAll")} <ArrowRight className="h-4 w-4" />
          </Link>
        }
      />
      <QueryView query={query} isEmpty={(items) => items.length === 0}>
        {(items) => (
          <ul className="space-y-2 p-3">
            {items.map((item) => (
              <li key={item.id}>
                <Link
                  to={`/violations/${item.id}`}
                  className="flex gap-3 rounded-xl border border-line border-l-4 p-2 hover:bg-soft"
                  style={{ borderLeftColor: categoryColor(item.type.code, item.type.color) }}
                >
                  <CameraPreview seed={item.camera.id * 7 + item.id} status="ONLINE" className="w-20 shrink-0 rounded-md" />
                  <div className="min-w-0 flex-1 text-xs">
                    <div className="flex items-start justify-between gap-2">
                      <span className="truncate font-semibold text-ink">{item.type.name_uz}</span>
                      <ViolationStatusBadge status={item.status} />
                    </div>
                    <div className="font-mono text-sm font-bold text-ink">{item.plate_number ?? "—"}</div>
                    <div className="truncate text-mute">
                      {item.camera.code} · {formatTime(item.occurred_at)}
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </QueryView>
    </Card>
  );
}

function CameraHealth() {
  const query = useCameraSummary();
  return (
    <Card>
      <CardHeader title="Kamera holati" />
      <div className="p-4">
        <QueryView query={query}>
          {(summary) => (
            <DonutChart
              total={summary.total}
              height={170}
              items={(
                [
                  ["ONLINE", summary.online, "#5ccb3a"],
                  ["WARNING", summary.warning, "#f59e0b"],
                  ["OFFLINE", summary.offline, "#f43f5e"],
                  ["MAINTENANCE", summary.maintenance, "#8a8a87"],
                ] as [CameraStatus, number, string][]
              )
                .filter(([, count]) => count > 0)
                .map(([status, count, color]) => ({
                  code: status,
                  name: t(`camera.status.${status}`),
                  color,
                  count,
                  pct: (count / Math.max(summary.total, 1)) * 100,
                }))}
            />
          )}
        </QueryView>
      </div>
    </Card>
  );
}

function Last24h() {
  const query = useViolationsTimeseries("24h");
  return (
    <Card>
      <CardHeader
        title="Qoidabuzarliklar oqimi"
        subtitle="So‘nggi 24 soat, soatlar bo‘yicha"
        action={query.data && <span className="text-lg font-semibold text-ink">{formatNumber(query.data.totals.reduce((sum, value) => sum + value, 0))}</span>}
      />
      <div className="px-4 pb-4">
        <QueryView query={query}>
          {(data) => (
            <VolumeBars height={170} data={data.buckets.map((bucket, index) => ({ label: formatBucket(bucket, data.bucket), value: data.totals[index] ?? 0 }))} />
          )}
        </QueryView>
      </div>
    </Card>
  );
}

const STATUS_COLORS: Record<CameraStatus, string> = { ONLINE: "#5ccb3a", WARNING: "#f59e0b", OFFLINE: "#f43f5e", MAINTENANCE: "#8a8a87" };

function MonitoringKpis({ summary, kpis }: { summary: CameraSummary | undefined; kpis: DashboardKpis | undefined }) {
  const total = summary?.total ?? 0;
  const share = (value: number) => formatPct((value / Math.max(total, 1)) * 100);
  const today = kpis?.violations_today;
  return (
    <>
      <KpiTile
        icon={Camera}
        tone="blue"
        label="Jami kameralar"
        value={summary?.total ?? "—"}
        hint={summary ? `${summary.online + summary.warning} tasi ishlamoqda` : undefined}
        footer={
          summary && (
            <ShareBar
              total={total}
              parts={(["ONLINE", "WARNING", "OFFLINE", "MAINTENANCE"] as CameraStatus[]).map((status) => ({
                label: t(`camera.status.${status}`),
                value: summary[status.toLowerCase() as Lowercase<CameraStatus>],
                color: STATUS_COLORS[status],
              }))}
            />
          )
        }
      />
      <KpiTile
        icon={CheckCircle2}
        tone="green"
        label="Online"
        value={summary?.online ?? "—"}
        hint={summary ? `${share(summary.online)} kameralar` : undefined}
        spark={kpis && kpis.uptime_pct.sparkline.length > 1 && <Sparkline values={kpis.uptime_pct.sparkline} />}
        footer={
          kpis && (
            <p className="text-[11px] text-mute">
              30 kunlik uptime: <b className="font-semibold text-ink">{formatPct(kpis.uptime_pct.value)}</b>
            </p>
          )
        }
      />
      <KpiTile
        icon={XCircle}
        tone="red"
        label="Offline"
        value={summary?.offline ?? "—"}
        hint={summary ? `${share(summary.offline)} kameralar` : undefined}
        footer={
          summary && (
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-mute">
              <span>
                Ogohlantirish: <b className="font-semibold text-amber-600">{summary.warning}</b>
              </span>
              <span>
                Ta’mirda: <b className="font-semibold text-ink">{summary.maintenance}</b>
              </span>
              <Link to="/cameras?status=OFFLINE" className="ml-auto font-medium text-ink underline decoration-ink/20 underline-offset-2 hover:decoration-ink">
                Ko‘rish
              </Link>
            </div>
          )
        }
      />
      <KpiTile
        icon={Car}
        tone="sky"
        label="Aniqlangan avtomobillar"
        value={formatNumber(kpis?.total_vehicles.value)}
        delta={kpis?.total_vehicles.delta_pct}
        hint={kpis ? "7 kunda" : undefined}
        spark={kpis && <Sparkline values={kpis.total_vehicles.sparkline} color="#4fb0e6" />}
        footer={
          kpis && (
            <p className="text-[11px] text-mute">
              Faol kameralar: <b className="font-semibold text-ink">{kpis.active_cameras.value}</b> / {kpis.total_cameras}
            </p>
          )
        }
      />
      <KpiTile
        icon={TriangleAlert}
        tone="red"
        label="Bugungi qoidabuzarliklar"
        value={formatNumber(today?.value)}
        delta={today?.delta_pct}
        deltaPositiveIsGood={false}
        hint={today ? "kechaga nisbatan" : undefined}
        spark={today && <Sparkline values={today.sparkline} color="#f0566a" />}
        footer={
          kpis && (
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-mute">
              <span>
                Tasdiqlangan: <b className="font-semibold text-accent-700">{formatNumber(kpis.confirmed_today.value)}</b>
              </span>
              <span>
                Kutilmoqda: <b className="font-semibold text-amber-600">{formatNumber(kpis.pending_today.value)}</b>
              </span>
            </div>
          )
        }
      />
    </>
  );
}

export default function MonitoringPage() {
  const [grid, setGrid] = useState<(typeof GRID_OPTIONS)[number]>(6);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [districtId, setDistrictId] = useState("");
  const [status, setStatus] = useState("");
  const summary = useCameraSummary();
  const kpis = useKpis();
  const districts = useDistricts();
  const cameras = useCameras({ page, page_size: grid, sort: "code", search, district_id: districtId, status });

  const reset = (setter: (value: string) => void) => (value: string) => {
    setter(value);
    setPage(1);
  };

  return (
    <>
      <PageHeader
        title={t("nav.monitoring")}
        subtitle="Barcha kameralar real vaqt rejimida. AI yordamida transport vositalari aniqlanmoqda."
        stats={<MonitoringKpis summary={summary.data} kpis={kpis.data} />}
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <select className="input w-52" value={districtId} onChange={(event) => reset(setDistrictId)(event.target.value)}>
          <option value="">Barcha hududlar</option>
          {districts.data?.map((district) => (
            <option key={district.id} value={district.id}>
              {district.name}
            </option>
          ))}
        </select>
        <div className="relative w-64">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-mute" />
          <input className="input pl-9" placeholder="Kamera qidirish…" value={search} onChange={(event) => reset(setSearch)(event.target.value)} />
        </div>
        <div className="inline-flex rounded-xl border border-line bg-white p-1">
          {GRID_OPTIONS.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => {
                setGrid(option);
                setPage(1);
              }}
              className={cn(
                "flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium",
                grid === option ? "bg-brand-600 text-white" : "text-mute hover:bg-soft",
              )}
            >
              <LayoutGrid className="h-3.5 w-3.5" /> {option}
            </button>
          ))}
        </div>
        <select className="input w-48" value={status} onChange={(event) => reset(setStatus)(event.target.value)}>
          <option value="">Barcha kameralar</option>
          {(["ONLINE", "WARNING", "OFFLINE", "MAINTENANCE"] as CameraStatus[]).map((value) => (
            <option key={value} value={value}>
              {t(`camera.status.${value}`)}
            </option>
          ))}
        </select>
        <span className="ml-auto text-xs text-mute">
          Onlayn ulush: <b className="text-emerald-600">{summary.data ? formatPct((summary.data.online / Math.max(summary.data.total, 1)) * 100) : "—"}</b>
        </span>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
        <QueryView query={cameras}>
          {(data) => (
            <div>
              <div className={cn("grid gap-4 sm:grid-cols-2", grid === 9 && "2xl:grid-cols-3", grid === 6 && "2xl:grid-cols-3")}>
                {data.items.map((camera) => (
                  <Tile key={camera.id} camera={camera} />
                ))}
              </div>
              <div className="card mt-4">
                <Pagination meta={data.meta} onPage={setPage} />
              </div>
            </div>
          )}
        </QueryView>
        <div className="space-y-5">
          <RecentEvents />
          <CameraHealth />
          <Last24h />
        </div>
      </div>
    </>
  );
}
