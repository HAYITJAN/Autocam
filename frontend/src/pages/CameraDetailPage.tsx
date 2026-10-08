import { ArrowLeft, Camera } from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { useCamera, useCameraEvents, useCameraStatistics } from "@/api/queries";
import { DonutChart } from "@/components/charts";
import {
  Card,
  CardHeader,
  CameraStatusBadge,
  Field,
  PlateNumber,
  QueryView,
  RangeTabs,
  StatTile,
  TypeChip,
  ViolationStatusBadge,
} from "@/components/ui";
import { formatBucket, formatDateTime, formatNumber, formatPct, formatTime } from "@/lib/format";
import { t } from "@/lib/i18n";
import type { CameraStatistics, TimeRange } from "@/lib/types";

function MetricsChart({ stats }: { stats: CameraStatistics }) {
  const bucket = stats.range === "24h" ? "hour" : "day";
  const rows = stats.violations_series.map((point, index) => ({
    label: formatBucket(point.t, bucket),
    violations: point.value ?? 0,
    fps: stats.fps_series[index]?.value ?? null,
    latency: stats.latency_series[index]?.value ?? null,
  }));
  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
        <YAxis yAxisId="left" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
        <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
        <Tooltip />
        <Line yAxisId="left" dataKey="violations" name={t("nav.violations")} stroke="#ef4444" strokeWidth={2} dot={false} />
        <Line yAxisId="right" dataKey="fps" name="FPS" stroke="#16a34a" strokeWidth={1.5} dot={false} connectNulls />
        <Line yAxisId="right" dataKey="latency" name={`${t("camera.latency")} (ms)`} stroke="#0ea5e9" strokeWidth={1.5} dot={false} connectNulls />
      </LineChart>
    </ResponsiveContainer>
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
          <div className="flex flex-wrap items-center gap-3">
            <Link to="/cameras" className="btn-secondary px-2.5">
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div className="flex-1">
              <h1 className="text-xl font-semibold text-slate-900">
                {cam.code} · {cam.name}
              </h1>
              <p className="text-sm text-slate-500">
                {cam.location.name}, {cam.location.district.name}
              </p>
            </div>
            <CameraStatusBadge status={cam.status} />
          </div>

          <div className="grid gap-5 xl:grid-cols-3">
            <Card className="xl:col-span-2">
              <div className="relative flex aspect-video items-center justify-center rounded-xl bg-gradient-to-br from-slate-800 to-slate-950 text-slate-400">
                <div className="flex flex-col items-center gap-2 text-sm">
                  <Camera className="h-10 w-10 text-slate-600" />
                  {t("camera.streamPending")}
                </div>
                <span className="absolute left-3 top-3 rounded bg-black/60 px-2 py-0.5 font-mono text-xs text-white">
                  {cam.code} · {cam.resolution}
                </span>
              </div>
            </Card>
            <Card>
              <CardHeader title={t("camera.details")} />
              <dl className="divide-y divide-slate-100 px-5 pb-3">
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
              <ul className="divide-y divide-slate-100">
                {cam.connections.map((connection) => (
                  <li key={connection.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                    <div>
                      <div className="font-medium">
                        {connection.connection_type} {connection.is_primary && <span className="text-xs text-brand-700">(asosiy)</span>}
                      </div>
                      <div className="text-xs text-slate-500">
                        {[connection.operator, connection.ssid_or_apn, connection.ip_address].filter(Boolean).join(" · ") || "—"}
                      </div>
                    </div>
                    <div className="text-right text-xs text-slate-500">
                      <div>{connection.status}</div>
                      {connection.signal_strength_dbm !== null && <div>{connection.signal_strength_dbm} dBm</div>}
                    </div>
                  </li>
                ))}
              </ul>
              {cam.zones.length > 0 && (
                <div className="border-t border-slate-100 px-5 py-3 text-sm">
                  <div className="mb-1 font-medium">Nazorat zonalari</div>
                  <div className="flex flex-wrap gap-2">
                    {cam.zones.map((zone) => (
                      <span key={zone.id} className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
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
                  <ul className="divide-y divide-slate-100">
                    {items.map((item) => (
                      <li key={item.id}>
                        <Link to={`/violations/${item.id}`} className="flex items-center gap-3 px-5 py-2.5 hover:bg-slate-50">
                          <span className="w-12 text-sm text-slate-600">{formatTime(item.occurred_at)}</span>
                          <span className="flex-1">
                            <TypeChip name={item.type.name_uz} color={item.type.color} />
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
