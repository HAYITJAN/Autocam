import { ArrowRight, CalendarDays, Camera, CheckCircle2, Gauge, ShieldAlert, Timer, TriangleAlert, XCircle } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { useCamera, useCameraSummary, useHeatmap, useKpis, useMapCameras, useMapDistricts } from "@/api/queries";
import { CameraMap, STATUS_COLORS } from "@/components/CameraMap";
import { CameraPreview } from "@/components/CameraPreview";
import { Select } from "@/components/Select";
import { Card, CardHeader, CameraStatusBadge, Field, KpiTile, PageHeader, QueryView, SidePanel } from "@/components/ui";
import { cn, daysAgoInput, formatDateTime, formatNumber, formatPct, toIsoEnd, toIsoStart } from "@/lib/format";
import { t } from "@/lib/i18n";
import type { CameraStatus } from "@/lib/types";

type Layer = "cameras" | "heatmap" | "districts";

const DISTRICT_BAR_COLORS = ["#121212", "#2c2c2b", "#474745", "#62625f", "#7f7f7b", "#9d9d99", "#bcbcb8", "#d8d8d4"];

function SelectedCamera({ id, onClose }: { id: number; onClose: () => void }) {
  const camera = useCamera(id);
  return (
    <QueryView query={camera}>
      {(cam) => (
        <SidePanel onClose={onClose} title={cam.code} badge={<CameraStatusBadge status={cam.status} />}>
          <div className="space-y-4 p-4">
            <CameraPreview seed={cam.id} status={cam.status} className="rounded-xl" />
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div className="rounded-xl bg-red-50 p-2">
                <ShieldAlert className="mx-auto h-4 w-4 text-red-600" />
                <div className="mt-1 text-sm font-bold">{cam.violations_today}</div>
                <div className="text-mute">Bugun</div>
              </div>
              <div className="rounded-xl bg-emerald-50 p-2">
                <Gauge className="mx-auto h-4 w-4 text-emerald-600" />
                <div className="mt-1 text-sm font-bold">{cam.metrics.fps?.toFixed(0) ?? "—"}</div>
                <div className="text-mute">FPS</div>
              </div>
              <div className="rounded-xl bg-brand-50 p-2">
                <Timer className="mx-auto h-4 w-4 text-brand-600" />
                <div className="mt-1 text-sm font-bold">{cam.metrics.latency_ms ?? "—"}</div>
                <div className="text-mute">ms</div>
              </div>
            </div>
            <dl className="divide-y divide-line">
              <Field label="Manzil">{cam.location.name}</Field>
              <Field label="Hudud">{cam.location.district.name}</Field>
              <Field label="Kamera turi">{cam.camera_type}</Field>
              <Field label="IP manzil">{cam.ip_address ?? "—"}</Field>
              <Field label="Ulanish turi">{cam.connection_type ?? "—"}</Field>
              <Field label="So‘nggi ulanish">{formatDateTime(cam.last_heartbeat_at)}</Field>
            </dl>
            <Link to={`/cameras/${cam.id}`} className="btn-primary w-full">
              Batafsil <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </SidePanel>
      )}
    </QueryView>
  );
}

export default function MapPage() {
  const [layers, setLayers] = useState<Set<Layer>>(new Set(["cameras", "heatmap"]));
  const [days, setDays] = useState(7);
  const [selected, setSelected] = useState<number | null>(null);
  const period = useMemo(() => ({ date_from: toIsoStart(daysAgoInput(days - 1)), date_to: toIsoEnd(daysAgoInput(0)) }), [days]);

  const cameras = useMapCameras();
  const heat = useHeatmap(period);
  const districts = useMapDistricts(period);
  const summary = useCameraSummary();
  const kpis = useKpis();

  const toggle = (layer: Layer) =>
    setLayers((current) => {
      const next = new Set(current);
      if (next.has(layer)) next.delete(layer);
      else next.add(layer);
      return next;
    });

  const s = summary.data;
  const sortedDistricts = [...(districts.data ?? [])].sort((a, b) => b.violations - a.violations);
  const maxDistrict = Math.max(1, ...sortedDistricts.map((district) => district.violations));
  const topCameras = [...(cameras.data ?? [])].sort((a, b) => b.violations_today - a.violations_today).slice(0, 4);
  const statusCounts: [CameraStatus, number | undefined][] = [
    ["ONLINE", s?.online],
    ["OFFLINE", s?.offline],
    ["WARNING", s?.warning],
    ["MAINTENANCE", s?.maintenance],
  ];

  return (
    <>
      <PageHeader
        title={t("nav.map")}
        subtitle="Kameralar joylashuvi, qoidabuzarliklar va real vaqt holatini xaritada kuzating"
        stats={
          <>
            <KpiTile icon={Camera} tone="blue" label="Jami kameralar" value={s?.total ?? "—"} />
            <KpiTile icon={CheckCircle2} tone="green" label="Online" value={s?.online ?? "—"} hint={s ? formatPct((s.online / Math.max(s.total, 1)) * 100) : undefined} />
            <KpiTile icon={XCircle} tone="red" label="Offline" value={s?.offline ?? "—"} />
            <KpiTile
              icon={TriangleAlert}
              tone="red"
              label="Bugungi qoidabuzarliklar"
              value={formatNumber(kpis.data?.violations_today.value)}
              delta={kpis.data?.violations_today.delta_pct}
              deltaPositiveIsGood={false}
            />
          </>
        }
      />

      <div className={cn("grid gap-5", selected !== null && "xl:grid-cols-[1fr_360px]")}>
        <div className="card relative p-2">
          <div className="absolute left-5 top-5 z-10 w-56 space-y-3 rounded-xl border border-line bg-white/95 p-3 text-sm shadow-lg backdrop-blur">
            <ul className="space-y-1.5">
              <li className="font-semibold text-ink">Barcha kameralar ({s?.total ?? "—"})</li>
              {statusCounts.map(([status, count]) => (
                <li key={status} className="flex items-center justify-between text-ink/70">
                  <span className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: STATUS_COLORS[status] }} />
                    {t(`camera.status.${status}`)}
                  </span>
                  <span className="text-xs text-mute">{count ?? "—"}</span>
                </li>
              ))}
            </ul>
            <div className="space-y-1.5 border-t border-line pt-2">
              {(
                [
                  ["cameras", t("map.cameras")],
                  ["heatmap", t("map.heatmap")],
                  ["districts", t("map.districts")],
                ] as [Layer, string][]
              ).map(([layer, label]) => (
                <label key={layer} className="flex cursor-pointer items-center gap-2 text-ink/80">
                  <input type="checkbox" className="h-4 w-4 rounded accent-ink" checked={layers.has(layer)} onChange={() => toggle(layer)} />
                  {label}
                </label>
              ))}
            </div>
            <Select
              size="sm"
              icon={CalendarDays}
              aria-label="Davr"
              value={String(days)}
              onChange={(value) => setDays(Number(value))}
              options={[
                { value: "1", label: "So‘nggi 24 soat" },
                { value: "7", label: "So‘nggi 7 kun" },
                { value: "30", label: "So‘nggi 30 kun" },
              ]}
            />
          </div>
          {layers.has("heatmap") && (
            <div className="absolute bottom-5 right-5 z-10 w-48 rounded-xl border border-line bg-white/95 p-2.5 text-xs shadow-lg">
              <div className="mb-1 font-semibold text-ink/80">Qoidabuzarliklar zichligi</div>
              <div className="h-2 rounded-full bg-gradient-to-r from-emerald-300 via-amber-300 to-red-500" />
              <div className="mt-1 flex justify-between text-mute">
                <span>Kam</span>
                <span>Yuqori</span>
              </div>
            </div>
          )}
          <CameraMap
            cameras={layers.has("cameras") ? cameras.data : []}
            heat={layers.has("heatmap") ? heat.data : []}
            districts={layers.has("districts") ? districts.data : []}
            height="calc(100vh - 330px)"
            zoom={12}
            selectedId={selected}
            onCameraClick={setSelected}
          />
        </div>
        {selected !== null && <SelectedCamera id={selected} onClose={() => setSelected(null)} />}
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader title="Eng faol kameralar" subtitle="Bugungi qoidabuzarliklar bo‘yicha" />
          <div className="grid gap-3 p-4 sm:grid-cols-2 2xl:grid-cols-4">
            {topCameras.map((camera) => (
              <button
                key={camera.id}
                type="button"
                onClick={() => setSelected(camera.id)}
                className={cn("overflow-hidden rounded-xl border text-left transition hover:shadow-md", selected === camera.id ? "border-brand-500" : "border-line")}
              >
                <CameraPreview seed={camera.id} status={camera.status} />
                <div className="p-2.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-ink">{camera.code}</span>
                    <CameraStatusBadge status={camera.status} />
                  </div>
                  <div className="truncate text-mute">{camera.location_name}</div>
                  <div className="mt-1 flex items-center gap-1 font-semibold text-red-600">
                    <ShieldAlert className="h-3.5 w-3.5" /> {camera.violations_today}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </Card>
        <Card>
          <CardHeader title="Hududlar bo‘yicha qoidabuzarliklar" />
          <ul className="space-y-2.5 p-5">
            {sortedDistricts.map((district, index) => (
              <li key={district.id} className="grid grid-cols-[130px_1fr_48px] items-center gap-3 text-sm">
                <span className="truncate text-ink/80">{district.name.replace(" tumani", "")}</span>
                <div className="h-2 rounded-full bg-soft">
                  <div
                    className="h-2 rounded-full"
                    style={{
                      width: `${(district.violations / maxDistrict) * 100}%`,
                      backgroundColor: DISTRICT_BAR_COLORS[index] ?? "#ececea",
                    }}
                  />
                </div>
                <span className="text-right font-semibold text-ink">{formatNumber(district.violations)}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
