import { ArrowRight, Camera, Car, CheckCircle2, Clock3, Gauge, Info, ShieldAlert, TriangleAlert, type LucideIcon } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";

import {
  useCameras,
  useKpis,
  useMapCameras,
  useRecentViolations,
  useViolationsTimeseries,
  useViolationTypeDistribution,
} from "@/api/queries";
import { CameraMap, MapLegend } from "@/components/CameraMap";
import { CameraPreview } from "@/components/CameraPreview";
import { DonutChart, Sparkline, TimeseriesChart } from "@/components/charts";
import {
  Card,
  CardHeader,
  CameraStatusBadge,
  IconBadge,
  QueryView,
  RangeTabs,
  ViolationStatusBadge,
  type IconTone,
} from "@/components/ui";
import { cn, formatNumber, formatPct, formatTime } from "@/lib/format";
import { t } from "@/lib/i18n";
import type { CameraListItem, Kpi, TimeRange } from "@/lib/types";

function Skyline() {
  const towers = [
    [0, 40], [18, 58], [34, 30], [50, 72], [64, 46], [80, 90], [96, 54], [110, 66], [126, 38], [140, 104],
    [152, 62], [168, 48], [182, 80], [198, 56], [214, 34], [228, 70], [244, 44], [258, 60], [274, 36], [290, 52],
  ] as const;
  return (
    <svg viewBox="0 0 310 110" className="absolute bottom-0 right-6 h-full w-[50%] opacity-60" preserveAspectRatio="xMaxYMax meet" aria-hidden>
      <defs>
        <linearGradient id="tower" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#8a87f4" stopOpacity="0.55" />
          <stop offset="1" stopColor="#8a87f4" stopOpacity="0.05" />
        </linearGradient>
      </defs>
      {towers.map(([x, h]) => (
        <rect key={x} x={x} y={110 - h} width={14} height={h} rx={2} fill="url(#tower)" />
      ))}
      <rect x="143" y="2" width="2" height="6" fill="#8a87f4" opacity="0.6" />
    </svg>
  );
}

function Hero() {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-navy-900 via-navy-800 to-[#2d2a7a] px-7 py-7 shadow-lift">
      <div className="pointer-events-none absolute -left-16 -top-24 h-64 w-64 rounded-full bg-brand-500/20 blur-3xl" />
      <Skyline />
      <div className="relative max-w-xl">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-medium text-white/80">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Toshkent shahri · real vaqt
        </span>
        <h1 className="mt-3 text-[26px] font-bold leading-tight tracking-tight text-white">Yo‘l harakati nazorati tizimi</h1>
        <p className="mt-1.5 text-[13px] text-white/60">
          Sun’iy intellekt yordamida avtomatlashtirilgan qoidabuzarliklarni aniqlash va monitoring qilish
        </p>
      </div>
    </div>
  );
}

const TONE_HEX: Record<IconTone, string> = {
  blue: "#625fee",
  green: "#10b981",
  red: "#f43f5e",
  amber: "#f59e0b",
  violet: "#8b5cf6",
  sky: "#0ea5e9",
  pink: "#ec4899",
  slate: "#94a3b8",
};

interface KpiCardProps {
  label: string;
  kpi: Kpi;
  icon: LucideIcon;
  tone: IconTone;
  format?: (value: number) => string;
  extra?: ReactNode;
  deltaPositiveIsGood?: boolean;
}

function KpiCard({ label, kpi, icon, tone, format = formatNumber, extra, deltaPositiveIsGood = true }: KpiCardProps) {
  const delta = kpi.delta_pct;
  const good = delta === null ? null : (delta >= 0) === deltaPositiveIsGood;
  return (
    <div className="card relative flex flex-col p-4">
      <span className="absolute right-3 top-3 text-slate-300" title={label}>
        <Info className="h-4 w-4" />
      </span>
      <div className="flex items-center gap-3 pr-5">
        <IconBadge icon={icon} tone={tone} />
        <p className="truncate text-[22px] font-bold leading-tight tracking-tight text-navy-900">{format(kpi.value)}</p>
      </div>
      <p className="mt-2.5 truncate text-[13px] text-slate-500">{label}</p>
      <div className="mt-1 flex items-end justify-between gap-2">
        <div className="text-[11px]">
          {extra ??
            (delta !== null && (
              <span className={cn("rounded-md px-1.5 py-0.5 font-semibold", good ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600")}>
                {delta >= 0 ? "↑" : "↓"} {formatPct(Math.abs(delta))}
              </span>
            ))}
        </div>
        <div className="w-20">
          <Sparkline values={kpi.sparkline} color={TONE_HEX[tone]} />
        </div>
      </div>
    </div>
  );
}

function KpiGrid() {
  const query = useKpis();
  return (
    <QueryView query={query}>
      {(kpis) => {
        const onlinePct = (kpis.active_cameras.value / Math.max(kpis.total_cameras, 1)) * 100;
        return (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
            <KpiCard label={t("kpi.totalVehicles")} kpi={kpis.total_vehicles} icon={Car} tone="green" />
            <KpiCard
              label={t("kpi.activeCameras")}
              kpi={kpis.active_cameras}
              icon={Camera}
              tone="blue"
              format={(value) => `${formatNumber(value)} / ${kpis.total_cameras}`}
              extra={
                <div className="w-24">
                  <div className="h-1.5 rounded-full bg-slate-100">
                    <div className="h-1.5 rounded-full bg-brand-600" style={{ width: `${onlinePct}%` }} />
                  </div>
                  <span className="mt-1 block font-semibold text-brand-600">{formatPct(onlinePct, 0)} online</span>
                </div>
              }
            />
            <KpiCard
              label={t("kpi.violationsToday")}
              kpi={kpis.violations_today}
              icon={TriangleAlert}
              tone="red"
              deltaPositiveIsGood={false}
            />
            <KpiCard
              label={t("kpi.confirmedToday")}
              kpi={kpis.confirmed_today}
              icon={CheckCircle2}
              tone="violet"
              extra={
                kpis.confirmed_today.secondary !== null && (
                  <span className="font-semibold text-emerald-600">{formatPct(kpis.confirmed_today.secondary)}</span>
                )
              }
            />
            <KpiCard
              label={t("kpi.pendingToday")}
              kpi={kpis.pending_today}
              icon={Clock3}
              tone="amber"
              extra={
                kpis.pending_today.secondary !== null && (
                  <span className="font-semibold text-amber-600">{formatPct(kpis.pending_today.secondary)}</span>
                )
              }
            />
            <KpiCard
              label={t("kpi.uptime")}
              kpi={kpis.uptime_pct}
              icon={Gauge}
              tone="pink"
              format={(value) => formatPct(value)}
              extra={<span className="text-slate-400">7 kun</span>}
            />
          </div>
        );
      }}
    </QueryView>
  );
}

function CameraTile({ camera }: { camera: CameraListItem }) {
  return (
    <Link to={`/cameras/${camera.id}`} className="group overflow-hidden rounded-xl border border-line bg-white transition hover:-translate-y-0.5 hover:shadow-lift">
      <CameraPreview seed={camera.id} status={camera.status}>
        <span className="absolute left-2 top-2">
          <CameraStatusBadge status={camera.status} />
        </span>
      </CameraPreview>
      <div className="space-y-0.5 px-3 py-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-bold text-slate-900">{camera.code}</span>
          <span className="flex items-center gap-1 text-xs text-slate-500">
            <ShieldAlert className="h-3.5 w-3.5 text-red-500" /> {camera.violations_today}
          </span>
        </div>
        <p className="truncate text-xs text-slate-500">{camera.location.name}</p>
      </div>
    </Link>
  );
}

function LiveCameras() {
  const query = useCameras({ sort: "-violations_today", page_size: 4 });
  return (
    <Card>
      <CardHeader
        title={t("dashboard.liveCameras")}
        action={
          <Link to="/monitoring" className="flex items-center gap-1 text-sm font-medium text-brand-600 hover:underline">
            {t("common.viewAll")} <ArrowRight className="h-4 w-4" />
          </Link>
        }
      />
      <div className="p-4">
        <QueryView query={query}>
          {(page) => (
            <div className="grid grid-cols-2 gap-3">
              {page.items.map((camera) => (
                <CameraTile key={camera.id} camera={camera} />
              ))}
            </div>
          )}
        </QueryView>
      </div>
    </Card>
  );
}

function MapCard() {
  const query = useMapCameras();
  return (
    <Card>
      <CardHeader title={t("dashboard.cameraMap")} action={<MapLegend />} />
      <div className="p-4">
        <QueryView query={query}>{(cameras) => <CameraMap cameras={cameras} height={392} />}</QueryView>
      </div>
    </Card>
  );
}

function ViolationsChart() {
  const [range, setRange] = useState<TimeRange>("7d");
  const query = useViolationsTimeseries(range);
  return (
    <Card>
      <CardHeader title={t("dashboard.violationStats")} action={<RangeTabs value={range} onChange={setRange} />} />
      <div className="p-4">
        <QueryView query={query}>{(data) => <TimeseriesChart data={data} height={260} />}</QueryView>
      </div>
    </Card>
  );
}

function TypesCard() {
  const [range, setRange] = useState<TimeRange>("30d");
  const query = useViolationTypeDistribution(range);
  return (
    <Card>
      <CardHeader title={t("dashboard.violationTypes")} action={<RangeTabs value={range} onChange={setRange} />} />
      <div className="p-4">
        <QueryView query={query} isEmpty={(data) => data.total === 0}>
          {(data) => <DonutChart items={data.items} total={data.total} />}
        </QueryView>
      </div>
    </Card>
  );
}

function RecentViolations() {
  const query = useRecentViolations(5);
  return (
    <Card>
      <CardHeader
        title={t("dashboard.recentViolations")}
        action={
          <Link to="/violations" className="flex items-center gap-1 text-sm font-medium text-brand-600 hover:underline">
            Barchasi <ArrowRight className="h-4 w-4" />
          </Link>
        }
      />
      <QueryView query={query} isEmpty={(items) => items.length === 0}>
        {(items) => (
          <ul className="divide-y divide-slate-100">
            {items.map((item) => (
              <li key={item.id}>
                <Link to={`/violations/${item.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50">
                  <CameraPreview seed={item.camera.id * 7 + item.id} status="ONLINE" className="w-16 shrink-0 rounded-md" />
                  <div className="min-w-0 flex-1">
                    <div className="font-mono text-sm font-bold text-slate-900">{item.plate_number ?? "—"}</div>
                    <div className="text-xs text-slate-500">{item.camera.code}</div>
                  </div>
                  <div className="hidden min-w-0 flex-1 sm:block">
                    <div className="flex items-center gap-1.5 truncate text-xs text-slate-700">
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: item.type.color }} />
                      {item.type.name_uz}
                    </div>
                    <div className="text-xs text-slate-400">{formatTime(item.occurred_at)}</div>
                  </div>
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

export default function DashboardPage() {
  return (
    <div className="space-y-5">
      <Hero />
      <KpiGrid />
      <div className="grid gap-5 xl:grid-cols-2">
        <LiveCameras />
        <MapCard />
      </div>
      <div className="grid gap-5 xl:grid-cols-3">
        <ViolationsChart />
        <TypesCard />
        <RecentViolations />
      </div>
    </div>
  );
}
