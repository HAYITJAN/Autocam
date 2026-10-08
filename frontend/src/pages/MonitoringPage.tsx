import { ArrowRight, Camera, Car, CheckCircle2, LayoutGrid, Map as MapIcon, MapPin, Search, TriangleAlert, XCircle } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";

import { useCameras, useCameraSummary, useDistricts, useKpis, useRecentViolations, useViolationsTimeseries } from "@/api/queries";
import { CameraPreview } from "@/components/CameraPreview";
import { Select } from "@/components/Select";
import { Sparkline, VolumeBars } from "@/components/charts";
import {
  Card,
  CardHeader,
  CountTabs,
  KpiTile,
  PageHeader,
  Pagination,
  PlateNumber,
  QueryView,
  ShareBar,
  ViolationStatusBadge,
} from "@/components/ui";
import { cn, formatBucket, formatNumber, formatPct, formatRelative, formatTime } from "@/lib/format";
import { t } from "@/lib/i18n";
import { categoryColor } from "@/lib/palette";
import type { CameraListItem, CameraStatus, CameraSummary, DashboardKpis } from "@/lib/types";

const GRID_OPTIONS = [6, 9, 12] as const;
const STATUSES: CameraStatus[] = ["ONLINE", "WARNING", "OFFLINE", "MAINTENANCE"];
const STATUS_COLORS: Record<CameraStatus, string> = { ONLINE: "#5ccb3a", WARNING: "#f59e0b", OFFLINE: "#f43f5e", MAINTENANCE: "#8a8a87" };

type StatusTab = CameraStatus | "";

// ------------------------------------------------------------------ KPIs

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
              parts={STATUSES.map((status) => ({
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
        hint={today ? "kechaga" : undefined}
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

// ------------------------------------------------------------- camera wall

function TileStat({ label, value, tone }: { label: string; value: string; tone?: "red" }) {
  return (
    <div className="min-w-0 px-3 py-2">
      <p className="truncate text-[10px] uppercase tracking-wider text-mute">{label}</p>
      <p className={cn("truncate text-[13px] font-semibold tabular-nums text-ink", tone === "red" && "text-rose-600")}>{value}</p>
    </div>
  );
}

/** One camera on the wall; metrics fall back to link quality when the stream reports none. */
function CameraTile({ camera }: { camera: CameraListItem }) {
  const live = camera.status === "ONLINE" || camera.status === "WARNING";
  const { fps, latency_ms: latency } = camera.metrics;
  return (
    <Link to={`/cameras/${camera.id}`} className="group card flex flex-col overflow-hidden transition hover:-translate-y-0.5 hover:shadow-lg">
      <CameraPreview seed={camera.id} status={camera.status}>
        <span className="absolute left-2.5 top-2.5 inline-flex items-center gap-1.5 rounded-full bg-black/60 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur-sm">
          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: STATUS_COLORS[camera.status] }} />
          {camera.code}
        </span>
        {live && (
          <span className="absolute right-2.5 top-2.5 inline-flex items-center gap-1 rounded-full bg-black/60 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-white backdrop-blur-sm">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-rose-500" /> Live
          </span>
        )}
        {camera.violations_today > 0 && (
          <span className="absolute bottom-2.5 left-2.5 inline-flex items-center gap-1 rounded-full bg-rose-500 px-2 py-0.5 text-[11px] font-semibold text-white">
            <TriangleAlert className="h-3 w-3" /> {camera.violations_today}
          </span>
        )}
      </CameraPreview>
      <div className="flex items-center gap-2 px-3.5 pb-2 pt-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold text-ink" title={camera.location.name}>
            {camera.location.name}
          </p>
          <p className="flex items-center gap-1 truncate text-[11px] text-mute">
            <MapPin className="h-3 w-3 shrink-0" /> {camera.location.district.name}
          </p>
        </div>
        <ArrowRight className="h-4 w-4 shrink-0 text-mute transition group-hover:translate-x-0.5 group-hover:text-ink" />
      </div>
      <div className="mt-auto grid grid-cols-3 divide-x divide-line border-t border-line">
        <TileStat label="Bugun" value={`${camera.violations_today} hodisa`} tone={camera.violations_today > 0 ? "red" : undefined} />
        {fps !== null ? (
          <TileStat label="FPS" value={fps.toFixed(0)} />
        ) : (
          <TileStat label="Signal" value={camera.signal_strength_dbm !== null ? `${camera.signal_strength_dbm} dBm` : "—"} />
        )}
        {latency !== null ? (
          <TileStat label="Kechikish" value={`${latency} ms`} />
        ) : (
          <TileStat label="Aloqa" value={camera.last_heartbeat_at ? formatTime(camera.last_heartbeat_at) : "—"} />
        )}
      </div>
    </Link>
  );
}

function CameraWall({ summary }: { summary: CameraSummary | undefined }) {
  const [grid, setGrid] = useState<(typeof GRID_OPTIONS)[number]>(9);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [districtId, setDistrictId] = useState("");
  const [status, setStatus] = useState<StatusTab>("");
  const districts = useDistricts();
  const cameras = useCameras({ page, page_size: grid, sort: "code", search, district_id: districtId, status });

  const reset = <T,>(setter: (value: T) => void) => (value: T) => {
    setter(value);
    setPage(1);
  };

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-3 px-5 pb-3 pt-5">
        <div className="min-w-0 flex-1">
          <h2 className="text-[17px] font-semibold tracking-tight text-ink">Kamera oqimlari</h2>
          <p className="mt-0.5 text-xs text-mute">
            {cameras.data ? `${formatNumber(cameras.data.meta.total)} ta kamera` : "Yuklanmoqda…"}
            {cameras.dataUpdatedAt > 0 && ` · yangilandi ${formatTime(new Date(cameras.dataUpdatedAt).toISOString())}`}
          </p>
        </div>
        <div className="segmented">
          {GRID_OPTIONS.map((option) => (
            <button key={option} type="button" onClick={() => reset(setGrid)(option)} className={cn("segmented-item gap-1", grid === option && "segmented-active")}>
              <LayoutGrid className="h-3.5 w-3.5" /> {option}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-y border-line bg-soft/50 px-5 py-3">
        <CountTabs<StatusTab>
          value={status}
          onChange={reset(setStatus)}
          items={[
            { value: "", label: "Barchasi", count: summary?.total },
            { value: "ONLINE", label: t("camera.status.ONLINE"), count: summary?.online, tone: "green" },
            { value: "WARNING", label: t("camera.status.WARNING"), count: summary?.warning, tone: "amber" },
            { value: "OFFLINE", label: t("camera.status.OFFLINE"), count: summary?.offline, tone: "red" },
            { value: "MAINTENANCE", label: t("camera.status.MAINTENANCE"), count: summary?.maintenance },
          ]}
        />
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className="relative w-56">
            <Search className="pointer-events-none absolute left-3.5 top-3 h-4 w-4 text-mute" />
            <input className="input pl-9" placeholder="Kod yoki manzil…" value={search} onChange={(event) => reset(setSearch)(event.target.value)} />
          </div>
          <Select
            className="w-48"
            icon={MapPin}
            value={districtId}
            onChange={reset(setDistrictId)}
            placeholder="Barcha tumanlar"
            options={(districts.data ?? []).map((district) => ({ value: String(district.id), label: district.name }))}
          />
        </div>
      </div>

      <QueryView query={cameras} isEmpty={(data) => data.items.length === 0}>
        {(data) => (
          <>
            <div className={cn("grid gap-4 p-5 sm:grid-cols-2 xl:grid-cols-3", grid === 12 && "2xl:grid-cols-4")}>
              {data.items.map((camera) => (
                <CameraTile key={camera.id} camera={camera} />
              ))}
            </div>
            <Pagination meta={data.meta} onPage={setPage} />
          </>
        )}
      </QueryView>
    </Card>
  );
}

// ------------------------------------------------------------- side panel

/** Cameras that need an operator: offline first, then warnings. */
function AttentionCard() {
  const offline = useCameras({ status: "OFFLINE", page_size: 5, sort: "-last_heartbeat_at" });
  const warning = useCameras({ status: "WARNING", page_size: 5, sort: "-last_heartbeat_at" });
  const items = [...(offline.data?.items ?? []), ...(warning.data?.items ?? [])].slice(0, 6);
  const loading = offline.isPending || warning.isPending;
  return (
    <Card>
      <CardHeader title="Diqqat talab qiladi" subtitle="Aloqasi yo‘q yoki nosoz kameralar" />
      {loading ? null : items.length === 0 ? (
        <div className="flex items-center gap-3 px-5 pb-5 text-[13px] text-mute">
          <CheckCircle2 className="h-5 w-5 text-accent-600" /> Barcha kameralar me’yorida ishlayapti
        </div>
      ) : (
        <ul className="space-y-1 px-3 pb-3">
          {items.map((camera) => (
            <li key={camera.id}>
              <Link to={`/cameras/${camera.id}`} className="flex items-center gap-3 rounded-xl px-2 py-2 transition hover:bg-soft">
                <span
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                  style={{ backgroundColor: `${STATUS_COLORS[camera.status]}1f`, color: STATUS_COLORS[camera.status] }}
                >
                  {camera.status === "OFFLINE" ? <XCircle className="h-4 w-4" /> : <TriangleAlert className="h-4 w-4" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-semibold text-ink">{camera.code}</span>
                  <span className="block truncate text-[11px] text-mute">{camera.location.name}</span>
                </span>
                <span className="shrink-0 text-right text-[11px]">
                  <span className="block font-medium" style={{ color: STATUS_COLORS[camera.status] }}>
                    {t(`camera.status.${camera.status}`)}
                  </span>
                  <span className="block text-mute">{camera.last_heartbeat_at ? formatRelative(camera.last_heartbeat_at) : "signal yo‘q"}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function RecentEvents() {
  const query = useRecentViolations(6);
  return (
    <Card>
      <CardHeader title="So‘nggi hodisalar" subtitle="Real vaqtda aniqlangan qoidabuzarliklar" to="/violations" />
      <QueryView query={query} isEmpty={(items) => items.length === 0}>
        {(items) => (
          <ul className="divide-y divide-line px-2 pb-2">
            {items.map((item) => (
              <li key={item.id}>
                <Link to={`/violations/${item.id}`} className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition hover:bg-soft">
                  <span className="h-9 w-1 shrink-0 rounded-full" style={{ backgroundColor: categoryColor(item.type.code, item.type.color) }} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-semibold text-ink" title={item.type.name_uz}>
                      {item.type.name_uz}
                    </span>
                    <span className="mt-0.5 flex items-center gap-2 text-[11px] text-mute">
                      <PlateNumber value={item.vehicle?.plate_display ?? item.plate_number} />
                      <span className="truncate">
                        {item.camera.code} · {formatTime(item.occurred_at)}
                      </span>
                    </span>
                  </span>
                  <ViolationStatusBadge status={item.status} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </QueryView>
    </Card>
  );
}

function Last24h() {
  const query = useViolationsTimeseries("24h");
  const total = query.data?.totals.reduce((sum, value) => sum + value, 0);
  return (
    <Card>
      <CardHeader
        title="Qoidabuzarliklar oqimi"
        subtitle="So‘nggi 24 soat, soatlar bo‘yicha"
        action={total !== undefined && <span className="text-lg font-semibold tabular-nums text-ink">{formatNumber(total)}</span>}
      />
      <div className="px-4 pb-4">
        <QueryView query={query}>
          {(data) => <VolumeBars height={160} data={data.buckets.map((bucket, index) => ({ label: formatBucket(bucket, data.bucket), value: data.totals[index] ?? 0 }))} />}
        </QueryView>
      </div>
    </Card>
  );
}

// -------------------------------------------------------------------- page

export default function MonitoringPage() {
  const summary = useCameraSummary();
  const kpis = useKpis();

  return (
    <>
      <PageHeader
        title={t("nav.monitoring")}
        subtitle="Barcha kameralar real vaqt rejimida. AI yordamida transport vositalari aniqlanmoqda."
        actions={
          <>
            <span className="inline-flex items-center gap-2 rounded-full border border-line bg-white px-3.5 py-2 text-xs font-medium text-ink">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-accent-500" />
              </span>
              Jonli rejim
            </span>
            <Link to="/map" className="btn-secondary">
              <MapIcon className="h-4 w-4" /> Xaritada ko‘rish
            </Link>
          </>
        }
        stats={<MonitoringKpis summary={summary.data} kpis={kpis.data} />}
      />

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <CameraWall summary={summary.data} />
        <div className="space-y-5">
          <AttentionCard />
          <RecentEvents />
          <Last24h />
        </div>
      </div>
    </>
  );
}
