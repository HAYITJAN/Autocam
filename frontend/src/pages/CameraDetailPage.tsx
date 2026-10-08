import { ArrowLeft, Camera } from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useCamera, useCameraEvents, useCameraStatistics } from "@/api/queries";
import { CameraPreview } from "@/components/CameraPreview";
import { ACCENT_DEEP, DonutChart, HatchedColumns, INK, MetricArea } from "@/components/charts";
import {
  Card,
  CardHeader,
  CameraStatusBadge,
  Field,
  PageHeader,
  PlateNumber,
  QueryView,
  RangeTabs,
  StatTile,
  TypeChip,
  ViolationStatusBadge,
} from "@/components/ui";
import { cn, formatBucket, formatDateTime, formatNumber, formatPct, formatTime } from "@/lib/format";
import { t } from "@/lib/i18n";
import type { CameraStatistics, TimeRange } from "@/lib/types";

type Metric = "violations" | "fps" | "latency";

const METRICS: { value: Metric; label: string }[] = [
  { value: "violations", label: "Qoidabuzarliklar" },
  { value: "fps", label: "FPS" },
  { value: "latency", label: "Kechikish" },
];

/** One metric at a time: three series with different units on twin axes were unreadable. */
function MetricsChart({ stats }: { stats: CameraStatistics }) {
  const [metric, setMetric] = useState<Metric>("violations");
  const bucket = stats.range === "24h" ? "hour" : "day";
  const source = metric === "violations" ? stats.violations_series : metric === "fps" ? stats.fps_series : stats.latency_series;
  const points = source.map((point) => ({ label: formatBucket(point.t, bucket), value: point.value }));
  const values = points.map((point) => point.value).filter((value): value is number => value !== null);
  const summary =
    metric === "violations"
      ? `${formatNumber(values.reduce((sum, value) => sum + value, 0))} ta`
      : values.length
        ? `${(values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(metric === "fps" ? 1 : 0)}${metric === "fps" ? " FPS" : " ms"} o‘rtacha`
        : "ma’lumot yo‘q";

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="segmented">
          {METRICS.map((item) => (
            <button
              key={item.value}
              type="button"
              className={cn("segmented-item", metric === item.value && "segmented-active")}
              onClick={() => setMetric(item.value)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <span className="text-sm font-semibold text-ink">{summary}</span>
      </div>
      {metric === "violations" ? (
        <HatchedColumns height={240} showAverage data={points.map((point) => ({ label: point.label, value: point.value ?? 0 }))} />
      ) : (
        <MetricArea height={240} data={points} color={metric === "fps" ? ACCENT_DEEP : INK} unit={metric === "fps" ? "FPS" : "ms"} />
      )}
    </div>
  );
}

export default function CameraDetailPage() {
  const id = Number(useParams().id);
  const [range, setRange] = useState<TimeRange>("24h");
  const camera = useCamera(id);
  const stats = useCameraStatistics(id, range);
  const events = useCameraEvents(id);

  return (
    <QueryView query={camera}>
      {(cam) => (
        <div className="space-y-5">
          <PageHeader
            crumbs={[{ label: "Bosh sahifa", to: "/" }, { label: t("nav.cameras"), to: "/cameras" }, { label: cam.code }]}
            title={`${cam.code} · ${cam.name}`}
            subtitle={`${cam.location.name}, ${cam.location.district.name}`}
            actions={
              <>
                <CameraStatusBadge status={cam.status} />
                <Link to="/cameras" className="btn-secondary">
                  <ArrowLeft className="h-4 w-4" /> Kameralar
                </Link>
              </>
            }
          />

          <div className="grid gap-5 xl:grid-cols-3">
            <Card className="p-3 xl:col-span-2">
              <CameraPreview seed={cam.id} status={cam.status} className="rounded-[1.1rem]">
                <span className="absolute left-3 top-3 rounded-full bg-black/60 px-2.5 py-1 font-mono text-[11px] text-white">
                  {cam.code} · {cam.resolution}
                </span>
                <span className="absolute bottom-3 left-3 inline-flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-1 text-xs text-ink">
                  <Camera className="h-3.5 w-3.5" />
                  {t("camera.streamPending")}
                </span>
              </CameraPreview>
            </Card>
            <Card>
              <CardHeader title={t("camera.details")} />
              <dl className="divide-y divide-line px-5 pb-3">
                <Field label={t("camera.type")}>{cam.camera_type}</Field>
                <Field label="IP">{cam.ip_address ?? "—"}</Field>
                <Field label="FPS (maqsad)">{cam.fps_target}</Field>
                <Field label="Tezlik chegarasi">{cam.speed_limit_kmh} km/soat</Field>
                <Field label="AI ishonch chegarasi">{formatPct(cam.confidence_threshold * 100, 0)}</Field>
                <Field label="Svetofor">{cam.has_traffic_light ? "Ha" : "Yo‘q"}</Field>
                <Field label="Saqlash muddati">{cam.retention_days} kun</Field>
                <Field label={t("camera.heartbeat")}>{formatDateTime(cam.last_heartbeat_at)}</Field>
              </dl>
            </Card>
          </div>

          <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
            <StatTile label="FPS" value={cam.metrics.fps?.toFixed(1) ?? "—"} tone="green" />
            <StatTile label={t("camera.latency")} value={cam.metrics.latency_ms !== null ? `${cam.metrics.latency_ms} ms` : "—"} />
            <StatTile label="CPU" value={formatPct(cam.metrics.cpu_percent)} />
            <StatTile label="Harorat" value={cam.metrics.temperature_c !== null ? `${cam.metrics.temperature_c.toFixed(0)} °C` : "—"} />
            <StatTile label="Paket yo‘qotilishi" value={formatPct(cam.metrics.packet_loss_pct, 2)} />
          </div>

          <Card>
            <CardHeader title={t("camera.statistics")} action={<RangeTabs value={range} onChange={setRange} />} />
            <QueryView query={stats} className="p-4">
              {(data) => (
                <div className="grid gap-5 p-4 xl:grid-cols-3">
                  <div className="xl:col-span-2">
                    <div className="mb-3 flex gap-6 text-sm">
                      <span>
                        {t("common.total")}: <b>{formatNumber(data.violations_total)}</b>
                      </span>
                      <span>
                        {t("camera.uptime")}: <b>{formatPct(data.uptime_pct)}</b>
                      </span>
                    </div>
                    <MetricsChart stats={data} />
                  </div>
                  <DonutChart items={data.by_type} total={data.violations_total} height={180} />
                </div>
              )}
            </QueryView>
          </Card>

          <div className="grid gap-5 xl:grid-cols-2">
            <Card>
              <CardHeader title={t("camera.connection")} />
              <ul className="divide-y divide-line">
                {cam.connections.map((connection) => (
                  <li key={connection.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                    <div>
                      <div className="font-medium">
                        {connection.connection_type} {connection.is_primary && <span className="text-xs text-brand-700">(asosiy)</span>}
                      </div>
                      <div className="text-xs text-mute">
                        {[connection.operator, connection.ssid_or_apn, connection.ip_address].filter(Boolean).join(" · ") || "—"}
                      </div>
                    </div>
                    <div className="text-right text-xs text-mute">
                      <div>{connection.status}</div>
                      {connection.signal_strength_dbm !== null && <div>{connection.signal_strength_dbm} dBm</div>}
                    </div>
                  </li>
                ))}
              </ul>
              {cam.zones.length > 0 && (
                <div className="border-t border-line px-5 py-3 text-sm">
                  <div className="mb-1 font-medium">Nazorat zonalari</div>
                  <div className="flex flex-wrap gap-2">
                    {cam.zones.map((zone) => (
                      <span key={zone.id} className="rounded bg-soft px-2 py-0.5 text-xs text-ink/70">
                        {zone.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </Card>
            <Card>
              <CardHeader title={t("camera.recentViolations")} />
              <QueryView query={events} isEmpty={(items) => items.length === 0}>
                {(items) => (
                  <ul className="divide-y divide-line">
                    {items.map((item) => (
                      <li key={item.id}>
                        <Link to={`/violations/${item.id}`} className="flex items-center gap-3 px-5 py-2.5 hover:bg-soft">
                          <span className="w-12 text-sm text-ink/70">{formatTime(item.occurred_at)}</span>
                          <span className="flex-1">
                            <TypeChip name={item.type.name_uz} code={item.type.code} color={item.type.color} />
                          </span>
                          <PlateNumber value={item.plate_number} />
                          <ViolationStatusBadge status={item.status} />
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </QueryView>
            </Card>
          </div>
        </div>
      )}
    </QueryView>
  );
}
