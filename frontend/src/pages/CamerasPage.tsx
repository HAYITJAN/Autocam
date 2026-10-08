import { ArrowRight, Camera, CheckCircle2, Gauge, MapPin, Search, ShieldAlert, Signal, Timer, TriangleAlert, Wifi, XCircle } from "lucide-react";
import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { useCamera, useCameraEvents, useCameras, useCameraStatistics, useCameraSummary, useDistricts, useMapCameras } from "@/api/queries";
import { CameraMap } from "@/components/CameraMap";
import { CameraPreview } from "@/components/CameraPreview";
import {
  CameraStatusBadge,
  CountTabs,
  Field,
  KpiTile,
  Pagination,
  PageHeader,
  PlateNumber,
  QueryView,
  SidePanel,
  type TabItem,
} from "@/components/ui";
import { cn, formatDateTime, formatNumber, formatPct, formatTime } from "@/lib/format";
import { t } from "@/lib/i18n";
import { categoryColor } from "@/lib/palette";
import type { CameraListItem, CameraStatus, CameraType } from "@/lib/types";

const CONNECTION_LABELS: Record<string, string> = { WIFI: "Wi-Fi", LTE_4G: "4G LTE", ETHERNET: "Ethernet" };
const CAMERA_TYPES: Record<CameraType, string> = {
  FIXED: "Statsionar",
  PTZ: "Yo‘l kamerasi (PTZ)",
  ANPR: "Raqam aniqlovchi (ANPR)",
  SPEED: "Tezlik kamerasi",
};

type StatusTab = "" | CameraStatus;

function CameraCard({ camera, selected, onSelect }: { camera: CameraListItem; selected: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "card overflow-hidden text-left transition hover:shadow-md",
        selected && "ring-2 ring-brand-500 ring-offset-2 ring-offset-page",
      )}
    >
      <CameraPreview seed={camera.id} status={camera.status}>
        <span className="absolute left-2 top-2">
          <CameraStatusBadge status={camera.status} />
        </span>
      </CameraPreview>
      <div className="space-y-1.5 p-3">
        <div>
          <div className="text-sm font-bold text-ink">{camera.code}</div>
          <div className="truncate text-sm text-ink/70">{camera.name}</div>
        </div>
        <div className="flex items-center gap-3 truncate text-[11px] text-mute">
          <span className="flex items-center gap-1">
            <Camera className="h-3 w-3" /> {CAMERA_TYPES[camera.camera_type]}
          </span>
          <span className="flex items-center gap-1 truncate">
            <MapPin className="h-3 w-3 shrink-0" /> {camera.location.district.name}
          </span>
        </div>
        <div className="flex items-center justify-between border-t border-line pt-1.5 text-xs">
          <span className="flex items-center gap-1 font-semibold text-red-600">
            <ShieldAlert className="h-3.5 w-3.5" /> {camera.violations_today}
          </span>
          <span className="flex items-center gap-1 text-mute">
            <Wifi className="h-3.5 w-3.5" /> {camera.connection_type ? CONNECTION_LABELS[camera.connection_type] : "—"}
          </span>
          <span className="font-semibold text-emerald-600">{camera.metrics.fps !== null ? `${camera.metrics.fps.toFixed(0)} FPS` : "— FPS"}</span>
        </div>
      </div>
    </button>
  );
}

function MetricBox({ icon: Icon, label, value, tone }: { icon: typeof Gauge; label: string; value: string; tone: string }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-line p-2">
      <div className={cn("flex h-8 w-8 items-center justify-center rounded-lg", tone)}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="leading-tight">
        <div className="text-sm font-bold text-ink">{value}</div>
        <div className="text-[10px] text-mute">{label}</div>
      </div>
    </div>
  );
}

function CameraPanel({ id, onClose }: { id: number; onClose: () => void }) {
  const camera = useCamera(id);
  const stats = useCameraStatistics(id, "24h");
  const events = useCameraEvents(id);
  const [tab, setTab] = useState<"info" | "stats">("info");

  return (
    <QueryView query={camera}>
      {(cam) => (
        <SidePanel
          onClose={onClose}
          title={
            <span>
              {cam.code}
              <span className="block truncate text-xs font-normal text-mute">{cam.name}</span>
            </span>
          }
          badge={<CameraStatusBadge status={cam.status} />}
        >
          <div className="space-y-4 p-4">
            <CameraPreview seed={cam.id} status={cam.status} className="rounded-xl">
              <span className="absolute bottom-2 right-2 rounded bg-black/60 px-1.5 py-0.5 font-mono text-[10px] text-white">{cam.resolution}</span>
            </CameraPreview>
            <div className="grid grid-cols-2 gap-2">
              <MetricBox icon={ShieldAlert} label="Bugungi qoidabuzarlik" value={String(cam.violations_today)} tone="bg-red-50 text-red-600" />
              <MetricBox icon={Gauge} label="Kadrlar tezligi" value={cam.metrics.fps !== null ? `${cam.metrics.fps.toFixed(0)} FPS` : "—"} tone="bg-emerald-50 text-emerald-600" />
              <MetricBox icon={Timer} label="Kechikish" value={cam.metrics.latency_ms !== null ? `${cam.metrics.latency_ms} ms` : "—"} tone="bg-brand-50 text-brand-600" />
              <MetricBox icon={Signal} label="Signal" value={cam.signal_strength_dbm !== null ? `${cam.signal_strength_dbm} dBm` : "—"} tone="bg-violet-50 text-violet-600" />
            </div>

            <div className="grid grid-cols-2 gap-1 rounded-xl bg-soft p-1 text-sm font-medium">
              {(["info", "stats"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setTab(value)}
                  className={cn("rounded-lg py-1.5", tab === value ? "bg-white text-brand-700 shadow-sm" : "text-mute")}
                >
                  {value === "info" ? "Ma’lumotlar" : "Statistika (24 soat)"}
                </button>
              ))}
            </div>

            {tab === "info" ? (
              <dl className="divide-y divide-line">
                <Field label="Kamera ID">{cam.code}</Field>
                <Field label="Manzil">{cam.location.name}</Field>
                <Field label="Hudud">{cam.location.district.name}</Field>
                <Field label="Turi">{CAMERA_TYPES[cam.camera_type]}</Field>
                <Field label="IP manzil">{cam.ip_address ?? "—"}</Field>
                <Field label="Ulanish turi">{cam.connection_type ? CONNECTION_LABELS[cam.connection_type] : "—"}</Field>
                <Field label="Oxirgi signal">{formatDateTime(cam.last_heartbeat_at)}</Field>
                <Field label="Tezlik chegarasi">{cam.speed_limit_kmh} km/soat</Field>
                <Field label="Saqlash">{cam.retention_days} kun</Field>
              </dl>
            ) : (
              <QueryView query={stats}>
                {(data) => (
                  <dl className="divide-y divide-line">
                    <Field label="Qoidabuzarliklar">{formatNumber(data.violations_total)}</Field>
                    <Field label="Ishlash vaqti">{formatPct(data.uptime_pct)}</Field>
                    {data.by_type.slice(0, 5).map((item) => (
                      <Field key={item.code} label={item.name}>
                        {item.count} · {formatPct(item.pct)}
                      </Field>
                    ))}
                  </dl>
                )}
              </QueryView>
            )}

            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-bold text-ink">So‘nggi hodisalar</span>
                <Link to={`/cameras/${cam.id}`} className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline">
                  Batafsil <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
              <QueryView query={events} isEmpty={(items) => items.length === 0}>
                {(items) => (
                  <ul className="space-y-1.5">
                    {items.slice(0, 5).map((item) => (
                      <li key={item.id}>
                        <Link to={`/violations/${item.id}`} className="flex items-center gap-2 rounded-lg px-1.5 py-1 text-xs hover:bg-soft">
                          <span className="w-10 text-mute">{formatTime(item.occurred_at)}</span>
                          <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: categoryColor(item.type.code, item.type.color) }} />
                          <span className="min-w-0 flex-1 truncate text-ink/80">{item.type.name_uz}</span>
                          <PlateNumber value={item.plate_number} />
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

export default function CamerasPage() {
  const [params] = useSearchParams();
  const [search, setSearch] = useState(params.get("search") ?? "");
  const [status, setStatus] = useState<StatusTab>(() => {
    const initial = params.get("status");
    return initial && ["ONLINE", "WARNING", "OFFLINE", "MAINTENANCE"].includes(initial) ? (initial as StatusTab) : "";
  });
  const [districtId, setDistrictId] = useState("");
  const [cameraType, setCameraType] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<number | null>(null);
  const [panelOpen, setPanelOpen] = useState(true);

  const summary = useCameraSummary();
  const districts = useDistricts();
  const mapCameras = useMapCameras();
  const cameras = useCameras({ search, status, district_id: districtId, camera_type: cameraType, sort: "code", page, page_size: 9 });

  const reset = <T,>(setter: (value: T) => void) => (value: T) => {
    setter(value);
    setPage(1);
  };
  const activeId = selected ?? cameras.data?.items[0]?.id ?? null;
  const s = summary.data;
  const tabs: TabItem<StatusTab>[] = [
    { value: "", label: "Barcha kameralar", count: s?.total },
    { value: "ONLINE", label: "Online", count: s?.online, tone: "green" },
    { value: "OFFLINE", label: "Offline", count: s?.offline, tone: "red" },
    { value: "WARNING", label: "Ogohlantirish", count: s?.warning, tone: "amber" },
    { value: "MAINTENANCE", label: "Ta’mirda", count: s?.maintenance, tone: "violet" },
  ];

  return (
    <>
      <PageHeader
        title={t("nav.cameras")}
        subtitle="Barcha trafik kameralari ro‘yxati va holati"
        stats={
          <>
            <KpiTile icon={Camera} tone="blue" label="Jami kameralar" value={s?.total ?? "—"} />
            <KpiTile icon={CheckCircle2} tone="green" label="Online" value={s?.online ?? "—"} hint={s ? formatPct((s.online / Math.max(s.total, 1)) * 100) : undefined} />
            <KpiTile icon={XCircle} tone="red" label="Offline" value={s?.offline ?? "—"} />
            <KpiTile icon={TriangleAlert} tone="amber" label="Ogohlantirish" value={s?.warning ?? "—"} />
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <CountTabs items={tabs} value={status} onChange={reset(setStatus)} />
        <div className="flex-1" />
        <div className="relative w-56">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-mute" />
          <input className="input pl-9" placeholder={t("common.search")} value={search} onChange={(event) => reset(setSearch)(event.target.value)} />
        </div>
        <select className="input w-48" value={districtId} onChange={(event) => reset(setDistrictId)(event.target.value)}>
          <option value="">Barcha hududlar</option>
          {districts.data?.map((district) => (
            <option key={district.id} value={district.id}>
              {district.name}
            </option>
          ))}
        </select>
        <select className="input w-48" value={cameraType} onChange={(event) => reset(setCameraType)(event.target.value)}>
          <option value="">Barcha turlar</option>
          {(Object.keys(CAMERA_TYPES) as CameraType[]).map((type) => (
            <option key={type} value={type}>
              {CAMERA_TYPES[type]}
            </option>
          ))}
        </select>
      </div>

      <div className={cn("grid gap-5", panelOpen && "xl:grid-cols-[1fr_380px]")}>
        <div className="space-y-4">
          <div className="card p-2">
            <CameraMap cameras={mapCameras.data} height={210} zoom={11} />
          </div>
          <QueryView query={cameras} isEmpty={(data) => data.items.length === 0}>
            {(data) => (
              <>
                <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
                  {data.items.map((camera) => (
                    <CameraCard key={camera.id} camera={camera} selected={camera.id === activeId} onSelect={() => {
                      setSelected(camera.id);
                      setPanelOpen(true);
                    }} />
                  ))}
                </div>
                <div className="card">
                  <Pagination meta={data.meta} onPage={setPage} />
                </div>
              </>
            )}
          </QueryView>
        </div>
        {panelOpen && activeId !== null && <CameraPanel id={activeId} onClose={() => setPanelOpen(false)} />}
      </div>
    </>
  );
}
