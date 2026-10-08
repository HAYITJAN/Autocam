import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { formatBucket, formatNumber, formatPct } from "@/lib/format";
import { t } from "@/lib/i18n";
import type { HeatCell, Timeseries, TypeCount } from "@/lib/types";

const FALLBACK_COLORS = ["#1f6feb", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#14b8a6", "#f97316", "#64748b"];

export const colorAt = (color: string | null, index: number): string =>
  color ?? FALLBACK_COLORS[index % FALLBACK_COLORS.length] ?? "#64748b";

export function Sparkline({ values, color = "#1f6feb" }: { values: number[]; color?: string }) {
  const data = values.map((value, index) => ({ index, value }));
  const id = `spark-${color.replace("#", "")}`;
  return (
    <ResponsiveContainer width="100%" height={36}>
      <AreaChart data={data} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.35} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area type="monotone" dataKey="value" stroke={color} strokeWidth={1.8} fill={`url(#${id})`} isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function TimeseriesChart({ data, height = 280, stacked = false }: { data: Timeseries; height?: number; stacked?: boolean }) {
  const rows = data.buckets.map((bucket, index) => {
    const row: Record<string, number | string> = { label: formatBucket(bucket, data.bucket), total: data.totals[index] ?? 0 };
    for (const series of data.series) row[series.code] = series.values[index] ?? 0;
    return row;
  });

  if (stacked) {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
          <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
          <Tooltip />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {data.series.map((series, index) => (
            <Bar key={series.code} dataKey={series.code} name={series.name} stackId="a" fill={colorAt(series.color, index)} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
        <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
        <Tooltip />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Line type="monotone" dataKey="total" name={t("common.total")} stroke="#1f6feb" strokeWidth={2.5} dot={false} />
        {data.series.slice(0, 4).map((series, index) => (
          <Line
            key={series.code}
            type="monotone"
            dataKey={series.code}
            name={series.name}
            stroke={colorAt(series.color, index + 1)}
            strokeWidth={1.5}
            dot={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

export function DonutChart({ items, total, height = 220 }: { items: TypeCount[]; total: number; height?: number }) {
  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row">
      <div className="relative w-full max-w-[220px]" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={items} dataKey="count" nameKey="name" innerRadius="62%" outerRadius="95%" paddingAngle={2} isAnimationActive={false}>
              {items.map((item, index) => (
                <Cell key={item.code} fill={colorAt(item.color, index)} />
              ))}
            </Pie>
            <Tooltip formatter={(value: number) => formatNumber(value)} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl font-semibold text-slate-900">{formatNumber(total)}</span>
          <span className="text-xs text-slate-500">{t("common.total")}</span>
        </div>
      </div>
      <ul className="w-full space-y-1.5 text-sm">
        {items.map((item, index) => (
          <li key={item.code} className="flex items-center justify-between gap-2">
            <span className="flex min-w-0 items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: colorAt(item.color, index) }} />
              <span className="truncate text-slate-700">{item.name}</span>
            </span>
            <span className="shrink-0 text-slate-500">
              {formatNumber(item.count)} · {formatPct(item.pct)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function HorizontalBars({ items, height }: { items: { label: string; count: number; color?: string | null }[]; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height ?? Math.max(160, items.length * 34)}>
      <BarChart data={items} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 0 }}>
        <XAxis type="number" hide />
        <YAxis type="category" dataKey="label" width={150} tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
        <Tooltip formatter={(value: number) => formatNumber(value)} />
        <Bar dataKey="count" name={t("common.total")} radius={[0, 4, 4, 0]} barSize={16}>
          {items.map((item, index) => (
            <Cell key={item.label} fill={colorAt(item.color ?? null, index)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function ColumnChart({ data, xKey, yKey, color = "#1f6feb", height = 240 }: {
  data: Record<string, number | string>[];
  xKey: string;
  yKey: string;
  color?: string;
  height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
        <XAxis dataKey={xKey} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
        <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
        <Tooltip />
        <Bar dataKey={yKey} name={t("common.total")} fill={color} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function WeekHourHeatmap({ cells }: { cells: HeatCell[] }) {
  const max = Math.max(1, ...cells.map((cell) => cell.count));
  const lookup = new Map(cells.map((cell) => [`${cell.weekday}-${cell.hour}`, cell.count]));
  const hours = Array.from({ length: 24 }, (_, hour) => hour);
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-0.5 text-[10px]">
        <thead>
          <tr>
            <th />
            {hours.map((hour) => (
              <th key={hour} className="font-normal text-slate-400">
                {hour}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {[1, 2, 3, 4, 5, 6, 7].map((weekday) => (
            <tr key={weekday}>
              <td className="pr-1 text-xs text-slate-500">{t(`weekday.${weekday}` as "weekday.1")}</td>
              {hours.map((hour) => {
                const count = lookup.get(`${weekday}-${hour}`) ?? 0;
                return (
                  <td
                    key={hour}
                    title={`${count}`}
                    className="h-6 min-w-5 rounded"
                    style={{ backgroundColor: `rgba(239, 68, 68, ${0.06 + (count / max) * 0.9})` }}
                  />
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
