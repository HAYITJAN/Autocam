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
import { ColumnChart, DonutChart } from "@/components/charts";
import { Card, CardHeader, CameraStatusBadge, KpiTile, Pagination, PageHeader, QueryView, ViolationStatusBadge } from "@/components/ui";
import { cn, formatBucket, formatNumber, formatPct, formatTime } from "@/lib/format";
import { t } from "@/lib/i18n";
import type { CameraListItem, CameraStatus } from "@/lib/types";

const GRID_OPTIONS = [4, 6, 9] as const;

function Tile({ camera }: { camera: CameraListItem }) {
  return (
    <div className="card overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2">
        <span className="text-sm font-bold text-slate-900">{camera.code}</span>
        <CameraStatusBadge status={camera.status} />
        <span className="flex min-w-0 flex-1 items-center gap-1 truncate text-xs text-slate-500">
          <MapPin className="h-3 w-3 shrink-0" />
          <span className="truncate">{camera.location.name}</span>
        </span>
        <Link to={`/cameras/${camera.id}`} className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-brand-600" title={t("common.view")}>
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
                  className="flex gap-3 rounded-xl border border-slate-100 border-l-4 p-2 hover:bg-slate-50"
                  style={{ borderLeftColor: item.type.color }}
                >
                  <CameraPreview seed={item.camera.id * 7 + item.id} status="ONLINE" className="w-20 shrink-0 rounded-md" />
                  <div className="min-w-0 flex-1 text-xs">
                    <div className="flex items-start justify-between gap-2">
                      <span className="truncate font-semibold text-slate-800">{item.type.name_uz}</span>
                      <ViolationStatusBadge status={item.status} />
                    </div>
                    <div className="font-mono text-sm font-bold text-slate-900">{item.plate_number ?? "—"}</div>
                    <div className="truncate text-slate-500">
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
                  ["ONLINE", summary.online, "#22c55e"],
                  ["WARNING", summary.warning, "#f59e0b"],
                  ["OFFLINE", summary.offline, "#ef4444"],
                  ["MAINTENANCE", summary.maintenance, "#94a3b8"],
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
      <CardHeader title="Qoidabuzarliklar oqimi" subtitle="So‘nggi 24 soat" />
      <div className="p-3">
        <QueryView query={query}>
          {(data) => (
            <ColumnChart
              height={180}
              xKey="hour"
              yKey="count"
              data={data.buckets.map((bucket, index) => ({ hour: formatBucket(bucket, data.bucket), count: data.totals[index] ?? 0 }))}
            />
          )}
        </QueryView>
      </div>
    </Card>
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
        actions={
          <>
            <KpiTile icon={Camera} tone="blue" label="Jami kameralar" value={summary.data?.total ?? "—"} />
            <KpiTile icon={CheckCircle2} tone="green" label="Online" value={summary.data?.online ?? "—"} />
            <KpiTile icon={XCircle} tone="red" label="Offline" value={summary.data?.offline ?? "—"} />
            <KpiTile icon={Car} tone="sky" label="Aniqlangan avtomobillar" value={formatNumber(kpis.data?.total_vehicles.value)} />
            <KpiTile
              icon={TriangleAlert}
              tone="red"
              label="Bugungi qoidabuzarliklar"
              value={formatNumber(kpis.data?.violations_today.value)}
            />
          </>
        }
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
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input className="input pl-9" placeholder="Kamera qidirish…" value={search} onChange={(event) => reset(setSearch)(event.target.value)} />
        </div>
        <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1">
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
                grid === option ? "bg-brand-600 text-white" : "text-slate-500 hover:bg-slate-50",
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
        <span className="ml-auto text-xs text-slate-500">
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
