import { CalendarDays, Car, CheckCircle2, Target, TriangleAlert, XCircle } from "lucide-react";
import { useMemo, useState } from "react";
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
import {
  ACCENT_DEEP,
  ColumnChart,
  DonutChart,
  HorizontalBars,
  INK,
  StackedColumns,
  TimeseriesChart,
  WeekHourHeatmap,
} from "@/components/charts";
import { Card, CardHeader, CameraStatusBadge, KpiTile, PageHeader, QueryView } from "@/components/ui";
import { cn, daysAgoInput, formatDay, formatNumber, formatPct, toIsoEnd, toIsoStart } from "@/lib/format";
import { t } from "@/lib/i18n";
import type { RankedItem, TimeRange } from "@/lib/types";

const PERIODS = [
  { days: 1, label: t("range.24h") },
  { days: 7, label: t("range.7d") },
  { days: 30, label: t("range.30d") },
  { days: 90, label: "90 kun" },
];

function Overview({ period }: { period: Period }) {
  const query = useAnalyticsOverview(period);
  return (
    <QueryView query={query}>
      {(o) => (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
          <KpiTile
            icon={TriangleAlert}
            tone="blue"
            label="Jami qoidabuzarliklar"
            value={formatNumber(o.total)}
            delta={o.total_delta_pct}
            deltaPositiveIsGood={false}
            hint="oldingi davrga nisbatan"
          />
          <KpiTile icon={CheckCircle2} tone="green" label={t("violation.status.CONFIRMED")} value={formatNumber(o.confirmed)} />
          <KpiTile icon={XCircle} tone="red" label={t("violation.status.REJECTED")} value={formatNumber(o.rejected)} />
          <KpiTile icon={CalendarDays} tone="slate" label={t("analytics.avgPerDay")} value={o.avg_per_day.toFixed(1)} />
          <KpiTile icon={Target} tone="green" label={t("analytics.accuracy")} value={formatPct(o.accuracy_pct)} hint="tasdiqlangan / ko‘rib chiqilgan" />
          <KpiTile icon={Car} tone="slate" label={t("analytics.vehiclesInvolved")} value={formatNumber(o.vehicles_involved)} />
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
                      <span className="mr-2 text-mute">{index + 1}.</span>
                      <span className={kind === "vehicles" ? "font-mono font-semibold" : "font-medium"}>{item.label}</span>
                      {item.sublabel && <span className="ml-1 text-xs text-mute">{item.sublabel}</span>}
                    </span>
                    <span className="font-semibold">{formatNumber(item.count)}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-soft">
                    <div className={cn("h-1.5 rounded-full", index === 0 ? "bg-accent-400" : "bg-ink")} style={{ width: `${(item.count / max) * 100}%` }} />
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
        subtitle="Qoidabuzarliklar dinamikasi, hududlar, vaqt kesimi va kameralar samaradorligi"
        actions={
          <div className="segmented">
            {PERIODS.map((item) => (
              <button
                key={item.days}
                type="button"
                className={cn("segmented-item", days === item.days && "segmented-active")}
                onClick={() => setDays(item.days)}
              >
                {item.label}
              </button>
            ))}
          </div>
        }
      />

      <Overview period={period} />

      <div className="grid gap-5 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title={t("analytics.byDay")} subtitle="Holatlar kesimida kunlik dinamika" />
          <div className="p-4">
            <QueryView query={daily}>{(data) => <TimeseriesChart data={data} stacked />}</QueryView>
          </div>
        </Card>
        <Card>
          <CardHeader title={t("dashboard.violationTypes")} subtitle="Tanlangan davr bo‘yicha ulush" />
          <div className="p-4">
            <QueryView query={byType} isEmpty={(data) => data.total === 0}>
              {(data) => <DonutChart items={data.items} total={data.total} />}
            </QueryView>
          </div>
        </Card>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader title={t("analytics.byHour")} subtitle="Eng yuqori soat ajratib ko‘rsatiladi" />
          <div className="p-4">
            <QueryView query={byHour}>
              {(data) => (
                <ColumnChart
                  showAverage
                  data={data.map((bucket) => ({ hour: `${String(bucket.hour).padStart(2, "0")}:00`, count: bucket.count }))}
                  xKey="hour"
                  yKey="count"
                />
              )}
            </QueryView>
          </div>
        </Card>
        <Card>
          <CardHeader title={t("analytics.heatmap")} subtitle="Hafta kuni × soat — patrul rejalashtirish uchun" />
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
              {(data) => <HorizontalBars items={data.items.map((item) => ({ label: item.name, count: item.count}))} />}
            </QueryView>
          </div>
        </Card>
        <Card>
          <CardHeader title={t("analytics.reviewOutcomes")} />
          <div className="p-4">
            <QueryView query={outcomes}>
              {(data) => (
                <div className="space-y-5">
                  <StackedColumns
                    height={220}
                    rows={data.days.map((day) => ({ label: formatDay(day.day), confirmed: day.confirmed, rejected: day.rejected }))}
                    series={[
                      { key: "confirmed", name: t("violation.status.CONFIRMED"), color: ACCENT_DEEP },
                      { key: "rejected", name: t("violation.status.REJECTED"), color: INK },
                    ]}
                  />
                  {data.rejection_reasons.length > 0 && (
                    <div>
                      <div className="mb-3 text-[13px] font-semibold text-ink">{t("analytics.rejectionReasons")}</div>
                      <HorizontalBars items={data.rejection_reasons.map((reason) => ({ label: reason.name, count: reason.count, color: INK }))} />
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
              <table className="min-w-full divide-y divide-line">
                <thead className="sticky top-0 bg-soft">
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
                <tbody className="divide-y divide-line">
                  {items.map((row) => {
                    const reviewed = row.confirmed + row.rejected;
                    return (
                      <tr key={row.id} className="hover:bg-soft">
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
