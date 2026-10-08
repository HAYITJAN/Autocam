import {
  BarChart3,
  Bot,
  Calendar,
  Camera,
  Car,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  Gauge,
  Map as MapIcon,
  MonitorPlay,
  ShieldAlert,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";

import {
  useCameras,
  useKpis,
  useMapCameras,
  useRecentViolations,
  useSystemStatus,
  useViolationsTimeseries,
  useViolationTypeDistribution,
} from "@/api/queries";
import { CameraMap, MapLegend } from "@/components/CameraMap";
import { CameraPreview } from "@/components/CameraPreview";
import { HatchedColumns, TrendArea, VolumeBars } from "@/components/charts";
import {
  ArrowLink,
  Card,
  CardHeader,
  CameraStatusBadge,
  DeltaChip,
  Figure,
  IconBadge,
  PageHeader,
  QueryView,
  RangeTabs,
  type IconTone,
} from "@/components/ui";
import { cn, DISPLAY_TZ, formatBucket, formatNumber, formatPct, formatTime } from "@/lib/format";
import { t } from "@/lib/i18n";
import { categoryColor } from "@/lib/palette";
import type { CameraListItem, DashboardKpis, TimeRange } from "@/lib/types";
import { useAuthStore, useHasPermission } from "@/stores/auth";

const MONTHS = ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr"];
const WEEKDAY_SHORT = ["Yak", "Dush", "Sesh", "Chor", "Pay", "Jum", "Shan"];

function todayLabel(): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: DISPLAY_TZ, day: "numeric", month: "numeric", year: "numeric" })
      .formatToParts(new Date())
      .map((part) => [part.type, part.value]),
  );
  return `${parts.day} ${MONTHS[Number(parts.month) - 1] ?? ""}, ${parts.year}`;
}

// ------------------------------------------------------------ today card

function QuickAction({ to, icon: Icon, label }: { to: string; icon: LucideIcon; label: string }) {
  return (
    <Link to={to} className="group flex flex-col items-center gap-1.5" title={label}>
      <span className="flex h-11 w-full items-center justify-center rounded-full bg-soft text-ink transition group-hover:bg-ink group-hover:text-white">
        <Icon className="h-[18px] w-[18px]" />
      </span>
      <span className="text-[11px] text-mute group-hover:text-ink">{label}</span>
    </Link>
  );
}

function BreakdownRow({ icon, tone, title, subtitle, value, note }: { icon: LucideIcon; tone: IconTone; title: string; subtitle: string; value: ReactNode; note?: ReactNode }) {
  return (
    <li className="flex items-center gap-3 rounded-2xl bg-soft/70 px-3 py-2.5">
      <IconBadge icon={icon} tone={tone} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-semibold text-ink">{title}</div>
        <div className="truncate text-[11px] text-mute">{subtitle}</div>
      </div>
      <div className="text-right">
        <div className="text-[13px] font-semibold text-ink">{value}</div>
        {note && <div className="text-[11px] text-mute">{note}</div>}
      </div>
    </li>
  );
}

function TodayCard({ kpis }: { kpis: DashboardKpis }) {
  const status = useSystemStatus();
  const ai = status.data?.components.find((item) => item.name === "ai_service");
  const trend = kpis.violations_today.sparkline.map((value, index, all) => ({
    label: index === all.length - 1 ? "Bugun" : `${all.length - 1 - index} kun oldin`,
    value,
  }));
  const onlinePct = (kpis.active_cameras.value / Math.max(kpis.total_cameras, 1)) * 100;

  return (
    <Card className="flex flex-col p-5 xl:row-span-2">
      <div className="flex items-start justify-between">
        <p className="text-[13px] font-medium text-mute">Bugungi qoidabuzarliklar</p>
        <ArrowLink to="/violations" />
      </div>
      <div className="mt-1 flex items-end gap-3">
        <span className="text-[44px] font-semibold leading-none tracking-tight text-ink">{formatNumber(kpis.violations_today.value)}</span>
        <span className="pb-1.5">
          <DeltaChip value={kpis.violations_today.delta_pct} positiveIsGood={false} />
        </span>
      </div>
      <p className="mt-1 text-xs text-mute">kechagi kun bilan solishtirganda</p>

      <div className="mt-5 grid grid-cols-4 gap-2">
        <QuickAction to="/violations?status=NEW" icon={ClipboardCheck} label="Ko‘rish" />
        <QuickAction to="/monitoring" icon={MonitorPlay} label="Jonli" />
        <QuickAction to="/map" icon={MapIcon} label="Xarita" />
        <QuickAction to="/analytics" icon={BarChart3} label="Tahlil" />
      </div>

      <div className="mt-4 -mx-1">
        <TrendArea data={trend} height={110} />
      </div>

      <h3 className="mb-2.5 mt-4 text-[13px] font-semibold text-ink">Tizim tarkibi</h3>
      <ul className="space-y-2">
        <BreakdownRow
          icon={Camera}
          tone="blue"
          title="Faol kameralar"
          subtitle={`${formatPct(onlinePct, 0)} onlayn`}
          value={<Figure value={`${kpis.active_cameras.value} / ${kpis.total_cameras}`} />}
        />
        <BreakdownRow icon={CheckCircle2} tone="green" title="Tasdiqlangan" subtitle="bugun" value={formatNumber(kpis.confirmed_today.value)} note={formatPct(kpis.confirmed_today.secondary)} />
        <BreakdownRow icon={Clock3} tone="amber" title="Ko‘rib chiqilmoqda" subtitle="navbatda" value={formatNumber(kpis.pending_today.value)} note={formatPct(kpis.pending_today.secondary)} />
        <BreakdownRow icon={Car} tone="slate" title="Avtomobillar" subtitle="bazada jami" value={formatNumber(kpis.total_vehicles.value)} />
        <BreakdownRow icon={Gauge} tone="violet" title="Ishlash vaqti" subtitle="so‘nggi 7 kun" value={<Figure value={formatPct(kpis.uptime_pct.value)} />} />
        <BreakdownRow
          icon={Bot}
          tone={ai?.state === "up" ? "green" : "red"}
          title="AI modul"
          subtitle="aniqlash xizmati"
          value={ai ? (ai.state === "up" ? "Online" : "Offline") : "—"}
        />
      </ul>
    </Card>
  );
}

// ---------------------------------------------------------------- charts

function VolumeCard() {
  const [range, setRange] = useState<TimeRange>("30d");
  const query = useViolationsTimeseries(range);
  const total = query.data?.totals.reduce((sum, value) => sum + value, 0);
  return (
    <Card className="flex flex-col">
      <CardHeader title="Qoidabuzarliklar hajmi" subtitle={range === "24h" ? "So‘nggi 24 soat, soatlar bo‘yicha" : `So‘nggi ${range === "7d" ? 7 : 30} kun`} to="/analytics" />
      <div className="flex items-center justify-between px-5">
        <span className="text-[26px] font-semibold tracking-tight text-ink">{formatNumber(total)}</span>
        <RangeTabs value={range} onChange={setRange} />
      </div>
      <div className="flex-1 px-4 pb-4 pt-2">
        <QueryView query={query}>
          {(data) => <VolumeBars height={190} data={data.buckets.map((bucket, index) => ({ label: formatBucket(bucket, data.bucket), value: data.totals[index] ?? 0 }))} />}
        </QueryView>
      </div>
    </Card>
  );
}

function WeeklyCard() {
  const query = useViolationsTimeseries("7d");
  return (
    <Card className="flex flex-col">
      <CardHeader title="Haftalik dinamika" subtitle="So‘nggi 7 kun" to="/violations" />
      <QueryView query={query}>
        {(data) => {
          const total = data.totals.reduce((sum, value) => sum + value, 0);
          const today = data.totals.at(-1) ?? 0;
          const previous = data.totals.at(-2) ?? 0;
          const delta = previous ? ((today - previous) / previous) * 100 : null;
          return (
            <>
              <div className="px-5">
                <span className="text-[34px] font-semibold leading-tight tracking-tight text-ink">{formatNumber(total)}</span>
                <div className="mt-1 flex items-center gap-2">
                  <DeltaChip value={delta} positiveIsGood={false} />
                  <span className="text-xs text-mute">bugun +{formatNumber(today)}</span>
                </div>
              </div>
              <div className="flex-1 px-3 pb-3">
                <HatchedColumns
                  height={170}
                  showAxis={false}
                  highlight={data.totals.length - 1}
                  data={data.buckets.map((bucket, index) => ({
                    label: WEEKDAY_SHORT[new Date(`${bucket.slice(0, 10)}T12:00:00`).getDay()] ?? formatBucket(bucket, data.bucket),
                    value: data.totals[index] ?? 0,
                  }))}
                />
              </div>
            </>
          );
        }}
      </QueryView>
    </Card>
  );
}

function PerformanceCard({ kpis }: { kpis: DashboardKpis }) {
  const [range, setRange] = useState<TimeRange>("30d");
  const query = useViolationTypeDistribution(range);
  return (
    <Card className="xl:col-span-2">
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5">
        <div>
          <h2 className="text-[17px] font-semibold tracking-tight text-ink">Qoidabuzarlik turlari</h2>
          <p className="mt-0.5 text-xs text-mute">AI aniqlagan hodisalar turlar kesimida</p>
        </div>
        <div className="flex items-center gap-2">
          <RangeTabs value={range} onChange={setRange} />
          <ArrowLink to="/analytics" />
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-x-10 gap-y-3 px-5">
        <div className="flex items-center gap-3">
          <IconBadge icon={CheckCircle2} tone="green" />
          <div>
            <p className="text-xs text-mute">Bugun tasdiqlangan</p>
            <p className="flex items-center gap-2 text-[26px] font-semibold leading-tight tracking-tight">
              {formatNumber(kpis.confirmed_today.value)}
              <DeltaChip value={kpis.confirmed_today.delta_pct} />
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <IconBadge icon={Clock3} tone="blue" />
          <div>
            <p className="text-xs text-mute">Ko‘rib chiqish navbatida</p>
            <p className="flex items-center gap-2 text-[26px] font-semibold leading-tight tracking-tight">
              {formatNumber(kpis.pending_today.value)}
              <DeltaChip value={kpis.pending_today.delta_pct} positiveIsGood={false} />
            </p>
          </div>
        </div>
      </div>
      <div className="px-3 pb-4 pt-2">
        <QueryView query={query} isEmpty={(data) => data.total === 0}>
          {(data) => <HatchedColumns height={270} wrapLabels data={data.items.map((item) => ({ label: item.name, value: item.count }))} />}
        </QueryView>
      </div>
    </Card>
  );
}

// ------------------------------------------------------------ live & map

function CameraTile({ camera }: { camera: CameraListItem }) {
  return (
    <Link to={`/cameras/${camera.id}`} className="group block overflow-hidden rounded-[1.1rem] bg-soft">
      <CameraPreview seed={camera.id} status={camera.status} className="transition duration-300 group-hover:scale-[1.02]">
        <span className="absolute left-2.5 top-2.5 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-bold text-ink backdrop-blur">{camera.code}</span>
        <span className="absolute right-2.5 top-2.5">
          <CameraStatusBadge status={camera.status} />
        </span>
        <span className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/70 to-transparent px-3 pb-2 pt-6 text-[11px] text-white">
          <span className="truncate">{camera.location.name}</span>
          <span className="flex shrink-0 items-center gap-1 font-semibold">
            <ShieldAlert className="h-3.5 w-3.5" /> {camera.violations_today}
          </span>
        </span>
      </CameraPreview>
    </Link>
  );
}

function LiveCameras() {
  const query = useCameras({ sort: "-violations_today", page_size: 4 });
  return (
    <Card className="xl:col-span-2">
      <CardHeader title={t("dashboard.liveCameras")} subtitle="Eng faol 4 ta kamera" to="/monitoring" />
      <div className="p-4 pt-2">
        <QueryView query={query}>
          {(page) => (
            <div className="grid gap-3 sm:grid-cols-2">
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

function RecentViolations() {
  const query = useRecentViolations(6);
  return (
    <Card className="flex flex-col">
      <CardHeader title={t("dashboard.recentViolations")} subtitle="Real vaqt oqimi" to="/violations" />
      <div className="flex-1 p-4 pt-2">
        <QueryView query={query} isEmpty={(items) => items.length === 0}>
          {(items) => (
            <ul className="space-y-2">
              {items.map((item) => (
                <li key={item.id}>
                  <Link to={`/violations/${item.id}`} className="flex items-center gap-3 rounded-2xl bg-soft/70 px-3 py-2.5 transition hover:bg-soft">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white" style={{ backgroundColor: categoryColor(item.type.code, item.type.color) }}>
                      <TriangleAlert className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-semibold text-ink">{item.type.name_uz}</div>
                      <div className="truncate text-[11px] text-mute">
                        {item.camera.code} · {item.location_name ?? item.district_name ?? "—"}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="font-mono text-[13px] font-bold text-ink">{item.plate_number ?? "—"}</div>
                      <div className="text-[11px] text-mute">{formatTime(item.occurred_at)}</div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </QueryView>
      </div>
    </Card>
  );
}

function MapCard() {
  const query = useMapCameras();
  return (
    <Card className="xl:col-span-3">
      <CardHeader title={t("dashboard.cameraMap")} subtitle="Toshkent shahri bo‘ylab kameralar holati" action={<MapLegend />} to="/map" />
      <div className="p-4 pt-2">
        <QueryView query={query}>{(cameras) => <CameraMap cameras={cameras} height={380} />}</QueryView>
      </div>
    </Card>
  );
}

// ------------------------------------------------------------------ page

export default function DashboardPage() {
  const user = useAuthStore((state) => state.user);
  const canMonitor = useHasPermission("monitoring.view");
  const kpis = useKpis();
  const firstName = user?.full_name.split(/\s+/)[0] ?? "";

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Bosh sahifa", to: "/" }, { label: "Boshqaruv paneli" }]}
        title={`Xush kelibsiz, ${firstName}`}
        actions={
          <>
            <span className="pill pointer-events-none">
              <Calendar className="h-4 w-4 text-mute" /> {todayLabel()}
            </span>
            {canMonitor && (
              <Link to="/monitoring" className="btn-primary">
                <MonitorPlay className="h-4 w-4" /> Jonli monitoring
              </Link>
            )}
          </>
        }
      />

      <QueryView query={kpis}>
        {(data) => (
          <div className="space-y-4">
            <div className="grid gap-4 xl:grid-cols-[minmax(320px,0.95fr)_1.25fr_1fr]">
              <TodayCard kpis={data} />
              <VolumeCard />
              <WeeklyCard />
              <PerformanceCard kpis={data} />
            </div>
            <div className={cn("grid gap-4 xl:grid-cols-3")}>
              <LiveCameras />
              <RecentViolations />
              <MapCard />
            </div>
          </div>
        )}
      </QueryView>
    </>
  );
}
