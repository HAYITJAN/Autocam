import { ArrowLeft, ArrowRight, Camera, Flame, Layers, MapPin, Search, ShieldAlert, TriangleAlert, Video, X } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";

import { useCamera, useHeatmap, useKpis, useMapCameras, useMapDistricts } from "@/api/queries";
import { CameraMap, STATUS_COLORS, type MapFocus } from "@/components/CameraMap";
import { CameraPreview } from "@/components/CameraPreview";
import { CameraStatusBadge, DeltaChip, Field, PageHeader, QueryView } from "@/components/ui";
import { cn, daysAgoInput, formatDateTime, formatNumber, formatTime, toIsoEnd, toIsoStart } from "@/lib/format";
import { t } from "@/lib/i18n";
import type { CameraStatus, CameraType, MapCamera, MapDistrict } from "@/lib/types";

type Layer = "cameras" | "heatmap" | "districts";

const LAYERS: { value: Layer; label: string; icon: typeof Camera }[] = [
  { value: "cameras", label: "Kameralar", icon: Camera },
  { value: "heatmap", label: "Zichlik", icon: Flame },
  { value: "districts", label: "Tumanlar", icon: MapPin },
];
const PERIODS = [
  { days: 1, label: "24 soat" },
  { days: 7, label: "7 kun" },
  { days: 30, label: "30 kun" },
];
const STATUSES: CameraStatus[] = ["ONLINE", "WARNING", "OFFLINE", "MAINTENANCE"];
const CAMERA_TYPES: Record<CameraType, string> = { FIXED: "Statsionar", PTZ: "PTZ", ANPR: "Raqam aniqlovchi (ANPR)", SPEED: "Tezlik kamerasi" };
const CONNECTIONS: Record<string, string> = { WIFI: "Wi-Fi", LTE_4G: "4G LTE", ETHERNET: "Ethernet" };
const FLOATING = "rounded-2xl border border-black/[0.06] bg-white/95 shadow-[0_12px_32px_-14px_rgba(18,18,18,0.3)] backdrop-blur";

function toggleIn<T>(set: Set<T>, value: T): Set<T> {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

// ----------------------------------------------------------- map overlays

function CameraSearch({ cameras, onPick }: { cameras: MapCamera[]; onPick: (camera: MapCamera) => void }) {
  const [query, setQuery] = useState("");
  const needle = query.trim().toLocaleLowerCase();
  const results = needle
    ? cameras
        .filter((camera) => [camera.code, camera.name, camera.location_name, camera.district_name].some((text) => text.toLocaleLowerCase().includes(needle)))
        .slice(0, 6)
    : [];
  return (
    <div className={cn(FLOATING, "w-72 overflow-hidden")}>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-3 h-4 w-4 text-mute" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && results[0]) {
              onPick(results[0]);
              setQuery("");
            }
            if (event.key === "Escape") setQuery("");
          }}
          placeholder="Kamera kodi yoki manzil…"
          className="h-10 w-full bg-transparent pl-9 pr-9 text-[13px] text-ink outline-none placeholder:text-mute"
        />
        {query && (
          <button type="button" onClick={() => setQuery("")} className="absolute right-2.5 top-2.5 rounded-full p-0.5 text-mute hover:bg-soft hover:text-ink" aria-label="Tozalash">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      {needle && (
        <ul className="max-h-72 overflow-y-auto border-t border-line p-1.5">
          {results.length === 0 && <li className="px-3 py-4 text-center text-[13px] text-mute">Kamera topilmadi</li>}
          {results.map((camera) => (
            <li key={camera.id}>
              <button
                type="button"
                onClick={() => {
                  onPick(camera);
                  setQuery("");
                }}
                className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition hover:bg-soft"
              >
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: STATUS_COLORS[camera.status] }} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-semibold text-ink">{camera.code}</span>
                  <span className="block truncate text-[11px] text-mute">{camera.location_name}</span>
                </span>
                <span className="shrink-0 text-[11px] text-mute">{camera.district_name.replace(" tumani", "")}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function LayerPanel({
  layers,
  onLayer,
  counts,
  hidden,
  onStatus,
}: {
  layers: Set<Layer>;
  onLayer: (layer: Layer) => void;
  counts: Record<CameraStatus, number>;
  hidden: Set<CameraStatus>;
  onStatus: (status: CameraStatus) => void;
}) {
  return (
    <div className={cn(FLOATING, "w-60 p-3")}>
      <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-mute">
        <Layers className="h-3.5 w-3.5" /> Qatlamlar
      </p>
      <div className="grid grid-cols-3 gap-1.5">
        {LAYERS.map((layer) => {
          const on = layers.has(layer.value);
          return (
            <button
              key={layer.value}
              type="button"
              aria-pressed={on}
              onClick={() => onLayer(layer.value)}
              className={cn(
                "flex flex-col items-center gap-1 rounded-xl border px-1 py-2 text-[11px] font-medium transition",
                on ? "border-ink bg-ink text-white" : "border-line bg-white text-ink/70 hover:border-ink/25",
              )}
            >
              <layer.icon className="h-4 w-4" />
              {layer.label}
            </button>
          );
        })}
      </div>
      {layers.has("cameras") && (
        <>
          <p className="mb-1.5 mt-3 text-[11px] font-semibold uppercase tracking-wider text-mute">Kamera holati</p>
          <ul className="space-y-0.5">
            {STATUSES.map((status) => {
              const off = hidden.has(status);
              return (
                <li key={status}>
                  <button
                    type="button"
                    aria-pressed={!off}
                    onClick={() => onStatus(status)}
                    className={cn("flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] transition hover:bg-soft", off && "opacity-40")}
                  >
                    <span className="h-2.5 w-2.5 rounded-full ring-2 ring-white" style={{ backgroundColor: STATUS_COLORS[status] }} />
                    <span className="flex-1 text-left text-ink/80">{t(`camera.status.${status}`)}</span>
                    <span className="text-xs font-semibold tabular-nums text-ink">{counts[status]}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}

function HeatLegend({ days }: { days: number }) {
  return (
    <div className={cn(FLOATING, "w-52 px-3 py-2.5 text-[11px]")}>
      <p className="mb-1.5 font-semibold text-ink">Qoidabuzarliklar zichligi</p>
      <div className="h-2 rounded-full bg-gradient-to-r from-rose-100 via-rose-300 to-rose-600" />
      <div className="mt-1 flex justify-between text-mute">
        <span>Kam</span>
        <span>{PERIODS.find((period) => period.days === days)?.label}</span>
        <span>Ko‘p</span>
      </div>
    </div>
  );
}

// ------------------------------------------------------------- side panel

function SideCard({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <section className="card">
      <div className="px-5 pb-2 pt-4">
        <h2 className="text-[15px] font-semibold tracking-tight text-ink">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-mute">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

function MiniStat({ label, value, extra }: { label: string; value: string; extra?: ReactNode }) {
  return (
    <div className="rounded-2xl bg-soft px-4 py-3">
      <p className="text-[11px] font-medium text-mute">{label}</p>
      <p className="mt-0.5 text-xl font-semibold tracking-tight text-ink">{value}</p>
      {extra && <div className="mt-0.5 text-[11px]">{extra}</div>}
    </div>
  );
}

function Overview({
  cameras,
  districts,
  days,
  onCamera,
  onDistrict,
}: {
  cameras: MapCamera[];
  districts: MapDistrict[];
  days: number;
  onCamera: (camera: MapCamera) => void;
  onDistrict: (district: MapDistrict) => void;
}) {
  const kpis = useKpis();
  const online = cameras.filter((camera) => camera.status === "ONLINE").length;
  const top = [...cameras].sort((a, b) => b.violations_today - a.violations_today).filter((camera) => camera.violations_today > 0).slice(0, 7);
  const sorted = [...districts].sort((a, b) => b.violations - a.violations);
  const max = Math.max(1, ...sorted.map((district) => district.violations));
  const periodTotal = sorted.reduce((sum, district) => sum + district.violations, 0);
  const periodLabel = PERIODS.find((period) => period.days === days)?.label ?? "";

  return (
    <>
      <div className="grid grid-cols-2 gap-2.5">
        <MiniStat label="Kameralar" value={formatNumber(cameras.length)} extra={<span className="text-accent-700">{online} tasi onlayn</span>} />
        <MiniStat
          label="Bugungi hodisalar"
          value={formatNumber(kpis.data?.violations_today.value)}
          extra={kpis.data && <DeltaChip value={kpis.data.violations_today.delta_pct} positiveIsGood={false} />}
        />
        <MiniStat label={`Hodisalar · ${periodLabel}`} value={formatNumber(periodTotal)} extra={<span className="text-mute">tumanlar bo‘yicha jami</span>} />
        <MiniStat label="Tumanlar" value={formatNumber(sorted.filter((district) => district.violations > 0).length)} extra={<span className="text-mute">hodisa qayd etilgan</span>} />
      </div>

      <SideCard title="Eng faol kameralar" subtitle="Bugungi hodisalar bo‘yicha · bosing — xaritada ko‘rsatiladi">
        {top.length === 0 ? (
          <p className="px-5 pb-4 text-[13px] text-mute">Bugun hodisa qayd etilmagan</p>
        ) : (
          <ul className="px-2 pb-2">
            {top.map((camera, index) => (
              <li key={camera.id}>
                <button type="button" onClick={() => onCamera(camera)} className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition hover:bg-soft">
                  <span className="w-4 text-right text-xs tabular-nums text-mute">{index + 1}</span>
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: STATUS_COLORS[camera.status] }} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-semibold text-ink">{camera.code}</span>
                    <span className="block truncate text-[11px] text-mute">{camera.location_name}</span>
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-600">
                    <ShieldAlert className="h-3 w-3" /> {camera.violations_today}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </SideCard>

      <SideCard title="Tumanlar bo‘yicha" subtitle={`So‘nggi ${periodLabel} · bosing — tumanga o‘tish`}>
        <ul className="space-y-0.5 px-2 pb-3">
          {sorted.map((district) => (
            <li key={district.id}>
              <button type="button" onClick={() => onDistrict(district)} className="w-full rounded-xl px-3 py-1.5 text-left transition hover:bg-soft">
                <span className="flex items-baseline justify-between gap-2 text-[13px]">
                  <span className="truncate text-ink/80">{district.name.replace(" tumani", "")}</span>
                  <span className="shrink-0 font-semibold tabular-nums text-ink">{formatNumber(district.violations)}</span>
                </span>
                <span className="mt-1 block h-1.5 rounded-full bg-soft">
                  <span className="block h-1.5 rounded-full bg-ink" style={{ width: `${(district.violations / max) * 100}%`, opacity: 0.35 + (district.violations / max) * 0.65 }} />
                </span>
              </button>
            </li>
          ))}
        </ul>
      </SideCard>
    </>
  );
}

function CameraDetails({ id, onBack }: { id: number; onBack: () => void }) {
  const query = useCamera(id);
  return (
    <QueryView query={query}>
      {(cam) => (
        <section className="card overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3">
            <button type="button" onClick={onBack} className="icon-btn h-8 w-8" aria-label="Orqaga">
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-semibold text-ink">{cam.code}</p>
              <p className="truncate text-[11px] text-mute">{cam.name}</p>
            </div>
            <CameraStatusBadge status={cam.status} />
          </div>
          <CameraPreview seed={cam.id} status={cam.status} />
          <div className="grid grid-cols-3 divide-x divide-line border-b border-line">
            <div className="px-3 py-2.5">
              <p className="text-[10px] uppercase tracking-wider text-mute">Bugun</p>
              <p className={cn("text-[15px] font-semibold", cam.violations_today > 0 ? "text-rose-600" : "text-ink")}>{cam.violations_today} hodisa</p>
            </div>
            <div className="px-3 py-2.5">
              <p className="text-[10px] uppercase tracking-wider text-mute">{cam.metrics.fps !== null ? "FPS" : "Signal"}</p>
              <p className="text-[15px] font-semibold text-ink">
                {cam.metrics.fps !== null ? cam.metrics.fps.toFixed(0) : cam.signal_strength_dbm !== null ? `${cam.signal_strength_dbm} dBm` : "—"}
              </p>
            </div>
            <div className="px-3 py-2.5">
              <p className="text-[10px] uppercase tracking-wider text-mute">Aloqa</p>
              <p className="text-[15px] font-semibold text-ink">{cam.last_heartbeat_at ? formatTime(cam.last_heartbeat_at) : "—"}</p>
            </div>
          </div>
          <dl className="divide-y divide-line px-5 py-1">
            <Field label="Manzil">{cam.location.name}</Field>
            <Field label="Tuman">{cam.location.district.name}</Field>
            <Field label="Kamera turi">{CAMERA_TYPES[cam.camera_type]}</Field>
            <Field label="Ulanish">{cam.connection_type ? (CONNECTIONS[cam.connection_type] ?? cam.connection_type) : "—"}</Field>
            <Field label="IP manzil">{cam.ip_address ?? "—"}</Field>
            <Field label="So‘nggi aloqa">{formatDateTime(cam.last_heartbeat_at)}</Field>
          </dl>
          <div className="grid grid-cols-2 gap-2 border-t border-line p-3">
            <Link to={`/violations?camera=${cam.id}`} className="btn-secondary">
              <TriangleAlert className="h-4 w-4" /> Hodisalar
            </Link>
            <Link to={`/cameras/${cam.id}`} className="btn-primary">
              <Video className="h-4 w-4" /> Kamera <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>
      )}
    </QueryView>
  );
}

// -------------------------------------------------------------------- page

export default function MapPage() {
  const [layers, setLayers] = useState<Set<Layer>>(new Set(["cameras", "heatmap"]));
  const [hidden, setHidden] = useState<Set<CameraStatus>>(new Set());
  const [days, setDays] = useState(7);
  const [selected, setSelected] = useState<number | null>(null);
  const [focus, setFocus] = useState<MapFocus | null>(null);
  const period = useMemo(() => ({ date_from: toIsoStart(daysAgoInput(days - 1)), date_to: toIsoEnd(daysAgoInput(0)) }), [days]);

  const cameras = useMapCameras();
  const heat = useHeatmap(period);
  const districts = useMapDistricts(period);

  const allCameras = cameras.data ?? [];
  const counts = useMemo(() => {
    const result: Record<CameraStatus, number> = { ONLINE: 0, WARNING: 0, OFFLINE: 0, MAINTENANCE: 0 };
    for (const camera of allCameras) result[camera.status] += 1;
    return result;
  }, [allCameras]);
  const visibleCameras = layers.has("cameras") ? allCameras.filter((camera) => !hidden.has(camera.status)) : [];

  const pickCamera = (camera: MapCamera) => {
    setSelected(camera.id);
    setFocus({ key: `c-${camera.id}-${Date.now()}`, lat: camera.latitude, lng: camera.longitude, zoom: 15 });
  };
  const pickDistrict = (district: MapDistrict) => {
    setSelected(null);
    setFocus({ key: `d-${district.id}-${Date.now()}`, lat: district.center_lat, lng: district.center_lng, zoom: 13 });
  };

  return (
    <>
      <PageHeader
        title={t("nav.map")}
        subtitle="Kameralar joylashuvi, qoidabuzarliklar zichligi va real vaqt holati"
        actions={
          <div className="segmented">
            {PERIODS.map((item) => (
              <button key={item.days} type="button" onClick={() => setDays(item.days)} className={cn("segmented-item", days === item.days && "segmented-active")}>
                {item.label}
              </button>
            ))}
          </div>
        }
      />

      <div className="grid gap-5 xl:h-[calc(100vh-12.5rem)] xl:min-h-[560px] xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="card relative h-[70vh] min-h-[480px] overflow-hidden p-0 xl:h-full">
          <CameraMap
            cameras={visibleCameras}
            heat={layers.has("heatmap") ? heat.data : []}
            districts={layers.has("districts") ? districts.data : []}
            height="100%"
            zoom={12}
            muted
            rounded={false}
            selectedId={selected}
            focus={focus}
            onCameraClick={(id) => setSelected(id)}
            onDistrictClick={pickDistrict}
          />
          <div className="pointer-events-none absolute inset-0 z-[500] flex flex-col justify-between p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="pointer-events-auto">
                <LayerPanel
                  layers={layers}
                  onLayer={(layer) => setLayers((current) => toggleIn(current, layer))}
                  counts={counts}
                  hidden={hidden}
                  onStatus={(status) => setHidden((current) => toggleIn(current, status))}
                />
              </div>
              <div className="pointer-events-auto">
                <CameraSearch cameras={allCameras} onPick={pickCamera} />
              </div>
            </div>
            <div className="flex items-end">
              {layers.has("heatmap") && (
                <div className="pointer-events-auto">
                  <HeatLegend days={days} />
                </div>
              )}
            </div>
          </div>
        </div>

        <aside className="space-y-4 xl:overflow-y-auto xl:pr-1">
          {selected !== null ? (
            <CameraDetails id={selected} onBack={() => setSelected(null)} />
          ) : (
            <Overview cameras={allCameras} districts={districts.data ?? []} days={days} onCamera={pickCamera} onDistrict={pickDistrict} />
          )}
        </aside>
      </div>
    </>
  );
}
