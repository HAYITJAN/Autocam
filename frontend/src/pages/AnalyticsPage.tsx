import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import {
  useAnalyticsOverview,
  useByDistrict,
  useByHour,
  useByType,
  useCameraPerformance,
  useDailySeries,
  useReviewOutcomes,
  useTop,
  useWeekdayHour,
  type Period,
} from "@/api/queries";
import { ColumnChart, DonutChart, HorizontalBars, TimeseriesChart, WeekHourHeatmap } from "@/components/charts";
import { Card, CardHeader, CameraStatusBadge, PageHeader, QueryView, StatTile } from "@/components/ui";
import { daysAgoInput, formatDay, formatNumber, formatPct, toIsoEnd, toIsoStart } from "@/lib/format";
import { t } from "@/lib/i18n";
import type { RankedItem, TimeRange } from "@/lib/types";

function Overview({ period }: { period: Period }) {
  const query = useAnalyticsOverview(period);
  return (
    <QueryView query={query}>
      {(o) => (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
          <StatTile
            label={t("common.total")}
            value={
              <>
                {formatNumber(o.total)}
                {o.total_delta_pct !== null && (
                  <span className={o.total_delta_pct >= 0 ? "ml-2 text-xs text-red-600" : "ml-2 text-xs text-emerald-600"}>
                    {o.total_delta_pct >= 0 ? "+" : ""}
                    {formatPct(o.total_delta_pct)}
                  </span>
                )}
              </>
            }
          />
          <StatTile label={t("violation.status.CONFIRMED")} value={formatNumber(o.confirmed)} tone="green" />
          <StatTile label={t("violation.status.REJECTED")} value={formatNumber(o.rejected)} tone="red" />
          <StatTile label={t("analytics.avgPerDay")} value={o.avg_per_day.toFixed(1)} tone="blue" />
          <StatTile label={t("analytics.accuracy")} value={formatPct(o.accuracy_pct)} tone="green" />
          <StatTile label={t("analytics.vehiclesInvolved")} value={formatNumber(o.vehicles_involved)} />
        </div>
      )}
    </QueryView>
  );
}

function TopList({ title, kind, period }: { title: string; kind: "cameras" | "locations" | "vehicles"; period: Period }) {
  const query = useTop(kind, period);
  return (
    <Card>
      <CardHeader title={title} />
      <QueryView query={query} isEmpty={(items) => items.length === 0}>
        {(items: RankedItem[]) => {
          const max = Math.max(1, ...items.map((item) => item.count));
          return (
            <ol className="space-y-3 p-5">
              {items.map((item, index) => (
                <li key={item.id} className="text-sm">
                  <div className="mb-1 flex justify-between gap-2">
                    <span className="truncate">
                      <span className="mr-2 text-slate-400">{index + 1}.</span>
                      <span className={kind === "vehicles" ? "font-mono font-semibold" : "font-medium"}>{item.label}</span>
                      {item.sublabel && <span className="ml-1 text-xs text-slate-500">{item.sublabel}</span>}
                    </span>
                    <span className="font-semibold">{formatNumber(item.count)}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-slate-100">
                    <div className="h-1.5 rounded-full bg-brand-500" style={{ width: `${(item.count / max) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ol>
          );
        }}
      </QueryView>
    </Card>
  );
}

export default function AnalyticsPage() {
  const [days, setDays] = useState(30);
  const period = useMemo<Period>(() => ({ date_from: toIsoStart(daysAgoInput(days - 1)), date_to: toIsoEnd(daysAgoInput(0)) }), [days]);
  const seriesRange: TimeRange = days <= 1 ? "24h" : days <= 7 ? "7d" : "30d";

  const daily = useDailySeries(seriesRange);
  const byHour = useByHour(period);
  const heat = useWeekdayHour(period);
  const byType = useByType(period);
  const byDistrict = useByDistrict(period);
  const outcomes = useReviewOutcomes(period);
  const performance = useCameraPerformance(period);

  return (
    <div className="space-y-5">
      <PageHeader
        title={t("nav.analytics")}
        actions={
          <select className="input w-36" value={days} onChange={(event) => setDays(Number(event.target.value))}>
            <option value={1}>{t("range.24h")}</option>
            <option value={7}>{t("range.7d")}</option>
            <option value={30}>{t("range.30d")}</option>
            <option value={90}>90 kun</option>
          </select>
        }
      />

      <Overview period={period} />

      <div className="grid gap-5 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title={t("analytics.byDay")} />
          <div className="p-4">
            <QueryView query={daily}>{(data) => <TimeseriesChart data={data} stacked />}</QueryView>
          </div>
        </Card>
        <Card>
          <CardHeader title={t("dashboard.violationTypes")} />
          <div className="p-4">
            <QueryView query={byType} isEmpty={(data) => data.total === 0}>
              {(data) => <DonutChart items={data.items} total={data.total} />}
            </QueryView>
          </div>
        </Card>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader title={t("analytics.byHour")} />
          <div className="p-4">
            <QueryView query={byHour}>
              {(data) => <ColumnChart data={data.map((bucket) => ({ hour: `${bucket.hour}`, count: bucket.count }))} xKey="hour" yKey="count" />}
            </QueryView>
          </div>
        </Card>
        <Card>
          <CardHeader title={t("analytics.heatmap")} />
          <div className="p-4">
            <QueryView query={heat}>{(cells) => <WeekHourHeatmap cells={cells} />}</QueryView>
          </div>
        </Card>
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <TopList title={t("analytics.topCameras")} kind="cameras" period={period} />
        <TopList title={t("analytics.topLocations")} kind="locations" period={period} />
        <TopList title={t("analytics.topVehicles")} kind="vehicles" period={period} />
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader title={t("analytics.byDistrict")} />
          <div className="p-4">
            <QueryView query={byDistrict} isEmpty={(data) => data.total === 0}>
              {(data) => <HorizontalBars items={data.items.map((item) => ({ label: item.name, count: item.count, color: "#16a34a" }))} />}
            </QueryView>
          </div>
        </Card>
        <Card>
          <CardHeader title={t("analytics.reviewOutcomes")} />
          <div className="p-4">
            <QueryView query={outcomes}>
              {(data) => (
                <div className="space-y-4">
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart
                      data={data.days.map((day) => ({ label: formatDay(day.day), confirmed: day.confirmed, rejected: day.rejected }))}
                      margin={{ top: 8, right: 8, bottom: 0, left: -16 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#eef0f4" vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#94a3b8" }} tickLine={false} axisLine={false} />
                      <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} tickLine={false} axisLine={false} allowDecimals={false} />
                      <Tooltip />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Bar dataKey="confirmed" name={t("violation.status.CONFIRMED")} stackId="a" fill="#16a34a" />
                      <Bar dataKey="rejected" name={t("violation.status.REJECTED")} stackId="a" fill="#ef4444" />
                    </BarChart>
                  </ResponsiveContainer>
                  {data.rejection_reasons.length > 0 && (
                    <div>
                      <div className="mb-2 text-sm font-medium text-slate-700">{t("analytics.rejectionReasons")}</div>
                      <ul className="space-y-1 text-sm">
                        {data.rejection_reasons.map((reason) => (
                          <li key={reason.code} className="flex justify-between">
                            <span className="text-slate-600">{reason.name}</span>
                            <span className="text-slate-500">
                              {reason.count} · {formatPct(reason.pct)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </QueryView>
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader title={t("analytics.cameraPerformance")} />
        <QueryView query={performance} isEmpty={(items) => items.length === 0}>
          {(items) => (
            <div className="max-h-[480px] overflow-auto">
              <table className="min-w-full divide-y divide-slate-100">
                <thead className="sticky top-0 bg-slate-50">
                  <tr>
                    <th className="th">{t("camera.code")}</th>
                    <th className="th">{t("camera.name")}</th>
                    <th className="th">{t("camera.status")}</th>
                    <th className="th text-right">{t("camera.uptime")}</th>
                    <th className="th text-right">FPS</th>
                    <th className="th text-right">{t("camera.latency")}</th>
                    <th className="th text-right">{t("nav.violations")}</th>
                    <th className="th text-right">{t("analytics.accuracy")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.map((row) => {
                    const reviewed = row.confirmed + row.rejected;
                    return (
                      <tr key={row.id} className="hover:bg-slate-50">
                        <td className="td font-mono text-xs">{row.code}</td>
                        <td className="td">{row.name}</td>
                        <td className="td">
                          <CameraStatusBadge status={row.status} />
                        </td>
                        <td className="td text-right">{formatPct(row.uptime_pct)}</td>
                        <td className="td text-right">{row.avg_fps?.toFixed(1) ?? "—"}</td>
                        <td className="td text-right">{row.avg_latency_ms !== null ? `${row.avg_latency_ms.toFixed(0)} ms` : "—"}</td>
                        <td className="td text-right font-semibold">{formatNumber(row.violations)}</td>
                        <td className="td text-right">{reviewed ? formatPct((row.confirmed / reviewed) * 100) : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </QueryView>
      </Card>
    </div>
  );
}
