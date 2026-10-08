import { useId, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type LabelProps,
} from "recharts";

import { formatBucket, formatNumber, formatPct } from "@/lib/format";
import { t } from "@/lib/i18n";
import type { HeatCell, Timeseries, TypeCount } from "@/lib/types";

export const INK = "#121212";
export const ACCENT = "#7fdd5c";
const MUTED_BAR = "#dcdcd9";
const GRID = "#efefed";
const TICK = { fontSize: 11, fill: "#8a8a87" };

const FALLBACK_COLORS = [INK, ACCENT, "#f59e0b", "#f43f5e", "#8b5cf6", "#0ea5e9", "#f97316", "#a3a3a3"];

export const colorAt = (color: string | null, index: number): string =>
  color ?? FALLBACK_COLORS[index % FALLBACK_COLORS.length] ?? "#a3a3a3";

interface TooltipEntry {
  name?: string | number;
  value?: number | string | (number | string)[];
  color?: string;
}

/** Dark tooltip bubble used by every chart. */
function InkTooltip({ active, payload, label }: { active?: boolean; payload?: TooltipEntry[]; label?: string | number }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-2xl bg-ink px-3 py-2 text-xs text-white shadow-pop">
      {label !== undefined && label !== "" && <div className="mb-1 text-white/50">{label}</div>}
      {payload.map((entry, index) => (
        <div key={`${entry.name}-${index}`} className="flex items-center gap-2">
          {payload.length > 1 && <span className="h-2 w-2 rounded-full" style={{ backgroundColor: entry.color }} />}
          {payload.length > 1 && <span className="text-white/60">{entry.name}</span>}
          <span className="ml-auto font-semibold">{typeof entry.value === "number" ? formatNumber(entry.value) : String(entry.value)}</span>
        </div>
      ))}
    </div>
  );
}

const tooltip = <Tooltip content={<InkTooltip />} cursor={{ fill: "rgba(0,0,0,0.03)" }} />;

/** Diagonal hatch fills (muted and accent); called as a function because Recharts only renders raw <defs> children. */
function hatchDefs(id: string) {
  return (
    <defs>
      <pattern id={`${id}-muted`} patternUnits="userSpaceOnUse" width="7" height="7" patternTransform="rotate(45)">
        <rect width="7" height="7" fill="#ececea" />
        <line x1="0" y1="0" x2="0" y2="7" stroke="#dededb" strokeWidth="3" />
      </pattern>
      <pattern id={`${id}-accent`} patternUnits="userSpaceOnUse" width="7" height="7" patternTransform="rotate(45)">
        <rect width="7" height="7" fill={ACCENT} />
        <line x1="0" y1="0" x2="0" y2="7" stroke="#6fcf4d" strokeWidth="3" />
      </pattern>
    </defs>
  );
}

export function Sparkline({ values, color = ACCENT }: { values: number[]; color?: string }) {
  const id = useId().replace(/:/g, "");
  const data = values.map((value, index) => ({ index, value }));
  return (
    <ResponsiveContainer width="100%" height={36}>
      <AreaChart data={data} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.35} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area type="monotone" dataKey="value" stroke={color} strokeWidth={2} fill={`url(#${id})`} isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/** Smooth area trend with a highlighted last value; used for the "today" hero card. */
export function TrendArea({ data, height = 120 }: { data: { label: string; value: number }[]; height?: number }) {
  const id = useId().replace(/:/g, "");
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 4 }}>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={ACCENT} stopOpacity={0.45} />
            <stop offset="100%" stopColor={ACCENT} stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis dataKey="label" hide />
        {tooltip}
        <Area type="monotone" dataKey="value" name={t("common.total")} stroke="#55c235" strokeWidth={2.2} fill={`url(#${id})`} activeDot={{ r: 5, fill: INK, stroke: "#fff", strokeWidth: 2 }} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/** Dense thin bars; the hovered (or largest) bar and its neighbours are drawn in ink. */
export function VolumeBars({ data, height = 200 }: { data: { label: string; value: number }[]; height?: number }) {
  const maxIndex = data.reduce((best, item, index, all) => (item.value > (all[best]?.value ?? -1) ? index : best), 0);
  const [active, setActive] = useState<number | null>(null);
  const focus = active ?? maxIndex;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        data={data}
        margin={{ top: 8, right: 0, bottom: 0, left: 0 }}
        barCategoryGap="22%"
        onMouseMove={(state) => setActive(typeof state.activeTooltipIndex === "number" ? state.activeTooltipIndex : null)}
        onMouseLeave={() => setActive(null)}
      >
        <XAxis dataKey="label" tick={TICK} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={24} />
        <Tooltip content={<InkTooltip />} cursor={false} />
        <Bar dataKey="value" name={t("common.total")} radius={[3, 3, 3, 3]} isAnimationActive={false}>
          {data.map((item, index) => (
            <Cell key={item.label} fill={Math.abs(index - focus) <= 3 ? INK : MUTED_BAR} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Rounded hatched columns; the highlighted column is accent green with a dark value bubble above it. */
export function HatchedColumns({
  data,
  height = 220,
  highlight,
  showAxis = true,
}: {
  data: { label: string; value: number }[];
  height?: number;
  highlight?: number;
  showAxis?: boolean;
}) {
  const id = useId().replace(/:/g, "");
  const maxIndex = data.reduce((best, item, index, all) => (item.value > (all[best]?.value ?? -1) ? index : best), 0);
  const focus = highlight ?? maxIndex;
  const renderLabel = (props: LabelProps & { index?: number }) => {
    if (props.index !== focus) return null;
    const x = Number(props.x ?? 0) + Number(props.width ?? 0) / 2;
    const y = Number(props.y ?? 0) - 12;
    const text = formatNumber(Number(props.value ?? 0));
    const width = Math.max(34, text.length * 7 + 16);
    return (
      <g>
        <rect x={x - width / 2} y={y - 20} width={width} height={22} rx={8} fill={INK} />
        <text x={x} y={y - 5} textAnchor="middle" fontSize={11} fontWeight={600} fill="#fff">
          {text}
        </text>
      </g>
    );
  };
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 34, right: 4, bottom: 0, left: showAxis ? -18 : 4 }} barCategoryGap="18%">
        {hatchDefs(id)}
        {showAxis && <CartesianGrid stroke={GRID} vertical={false} />}
        <XAxis dataKey="label" tick={TICK} tickLine={false} axisLine={false} />
        {showAxis && <YAxis tick={TICK} tickLine={false} axisLine={false} allowDecimals={false} />}
        <Tooltip content={<InkTooltip />} cursor={false} />
        <Bar dataKey="value" name={t("common.total")} radius={[10, 10, 10, 10]} isAnimationActive={false}>
          {data.map((item, index) => (
            <Cell key={item.label} fill={index === focus ? `url(#${id}-accent)` : `url(#${id}-muted)`} />
          ))}
          <LabelList dataKey="value" content={renderLabel} />
        </Bar>
      </BarChart>
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
        <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: -16 }} barCategoryGap="20%">
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="label" tick={TICK} tickLine={false} axisLine={false} />
          <YAxis tick={TICK} tickLine={false} axisLine={false} allowDecimals={false} />
          {tooltip}
          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
          {data.series.map((series, index) => (
            <Bar
              key={series.code}
              dataKey={series.code}
              name={series.name}
              stackId="a"
              fill={colorAt(series.color, index)}
              radius={index === data.series.length - 1 ? [6, 6, 0, 0] : [0, 0, 0, 0]}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="label" tick={TICK} tickLine={false} axisLine={false} />
        <YAxis tick={TICK} tickLine={false} axisLine={false} allowDecimals={false} />
        <Tooltip content={<InkTooltip />} />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
        <Line type="monotone" dataKey="total" name={t("common.total")} stroke={INK} strokeWidth={2.5} dot={false} />
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

export function DonutChart({ items, total, height = 200 }: { items: TypeCount[]; total: number; height?: number }) {
  return (
    <div className="@container">
      <div className="flex flex-col items-center gap-5 @sm:flex-row">
        <div className="relative w-full max-w-[200px] shrink-0" style={{ height }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={items}
                dataKey="count"
                nameKey="name"
                innerRadius="70%"
                outerRadius="100%"
                paddingAngle={3}
                cornerRadius={6}
                stroke="none"
                isAnimationActive={false}
              >
                {items.map((item, index) => (
                  <Cell key={item.code} fill={colorAt(item.color, index)} />
                ))}
              </Pie>
              <Tooltip content={<InkTooltip />} />
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-semibold tracking-tight text-ink">{formatNumber(total)}</span>
            <span className="text-[11px] text-mute">{t("common.total")}</span>
          </div>
        </div>
        <ul className="w-full space-y-2.5 text-[13px]">
          {items.map((item, index) => (
            <li key={item.code} className="flex items-center justify-between gap-2">
              <span className="flex min-w-0 items-center gap-2">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: colorAt(item.color, index) }} />
                <span className="truncate text-ink/80">{item.name}</span>
              </span>
              <span className="shrink-0 font-medium text-ink">
                {formatNumber(item.count)} <span className="text-mute">· {formatPct(item.pct)}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** Ranked list rendered as labelled progress bars. */
export function HorizontalBars({ items, color }: { items: { label: string; count: number; color?: string | null; sublabel?: string | null }[]; color?: string }) {
  const max = Math.max(1, ...items.map((item) => item.count));
  return (
    <ul className="space-y-3">
      {items.map((item, index) => (
        <li key={`${item.label}-${index}`}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-[13px]">
            <span className="min-w-0 truncate text-ink/85">
              {item.label}
              {item.sublabel && <span className="ml-1.5 text-xs text-mute">{item.sublabel}</span>}
            </span>
            <span className="shrink-0 font-semibold text-ink">{formatNumber(item.count)}</span>
          </div>
          <div className="h-2 rounded-full bg-soft">
            <div
              className="h-2 rounded-full"
              style={{ width: `${(item.count / max) * 100}%`, backgroundColor: item.color ?? color ?? (index === 0 ? ACCENT : INK) }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function ColumnChart({ data, xKey, yKey, height = 240 }: { data: Record<string, number | string>[]; xKey: string; yKey: string; color?: string; height?: number }) {
  return (
    <HatchedColumns
      height={height}
      data={data.map((row) => ({ label: String(row[xKey] ?? ""), value: Number(row[yKey] ?? 0) }))}
    />
  );
}

export function WeekHourHeatmap({ cells }: { cells: HeatCell[] }) {
  const max = Math.max(1, ...cells.map((cell) => cell.count));
  const lookup = new Map(cells.map((cell) => [`${cell.weekday}-${cell.hour}`, cell.count]));
  const hours = Array.from({ length: 24 }, (_, hour) => hour);
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-[3px] text-[10px]">
        <thead>
          <tr>
            <th />
            {hours.map((hour) => (
              <th key={hour} className="font-normal text-mute">
                {hour}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {[1, 2, 3, 4, 5, 6, 7].map((weekday) => (
            <tr key={weekday}>
              <td className="pr-1 text-xs text-mute">{t(`weekday.${weekday}` as "weekday.1")}</td>
              {hours.map((hour) => {
                const count = lookup.get(`${weekday}-${hour}`) ?? 0;
                const ratio = count / max;
                return (
                  <td
                    key={hour}
                    title={`${count}`}
                    className="h-6 min-w-5 rounded-md"
                    style={{ backgroundColor: ratio > 0.85 ? INK : `rgba(95, 205, 60, ${0.08 + ratio * 0.85})` }}
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
