import { useId, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type LabelProps,
} from "recharts";

import { cn, formatBucket, formatNumber, formatPct } from "@/lib/format";
import { t } from "@/lib/i18n";
import { categoryColor } from "@/lib/palette";
import type { HeatCell, Timeseries, TypeCount } from "@/lib/types";

export const INK = "#121212";
export const ACCENT = "#7fdd5c";
export const ACCENT_DEEP = "#5ccb3a";
const MUTED_BAR = "#dcdcd9";
const MUTE = "#8a8a87";
const GRID = "#efefed";
const TICK = { fontSize: 11, fill: MUTE };

function average(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function maxIndexOf(values: number[]): number {
  return values.reduce((best, value, index) => (value > (values[best] ?? -Infinity) ? index : best), 0);
}

function formatValue(value: number, unit?: string): string {
  const text = Number.isInteger(value) ? formatNumber(value) : value.toFixed(1);
  return unit ? `${text} ${unit}` : text;
}

// --------------------------------------------------------------- tooltip

interface TooltipEntry {
  name?: string | number;
  value?: number | string | (number | string)[];
  color?: string;
  fill?: string;
}

/** Dark tooltip bubble shared by every chart; multi-series payloads are sorted and totalled. */
function InkTooltip({
  active,
  payload,
  label,
  unit,
  showTotal = false,
}: {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string | number;
  unit?: string;
  showTotal?: boolean;
}) {
  if (!active || !payload?.length) return null;
  const multi = payload.length > 1;
  const entries = multi
    ? [...payload].filter((entry) => Number(entry.value) > 0).sort((a, b) => Number(b.value) - Number(a.value))
    : payload;
  const total = payload.reduce((sum, entry) => sum + (Number(entry.value) || 0), 0);
  return (
    <div className="min-w-36 rounded-2xl bg-ink px-3.5 py-2.5 text-xs text-white shadow-pop">
      {label !== undefined && label !== "" && <div className="mb-1.5 text-[11px] text-white/50">{label}</div>}
      <div className="space-y-1">
        {entries.map((entry, index) => (
          <div key={`${entry.name}-${index}`} className="flex items-center gap-2">
            {multi && <span className="h-2 w-2 shrink-0 rounded-[3px]" style={{ backgroundColor: entry.color ?? entry.fill }} />}
            {multi && <span className="max-w-44 truncate text-white/70">{entry.name}</span>}
            <span className="ml-auto pl-3 font-semibold tabular-nums">
              {typeof entry.value === "number" ? formatValue(entry.value, unit) : String(entry.value ?? "—")}
            </span>
          </div>
        ))}
        {multi && entries.length === 0 && <div className="text-white/50">Ma’lumot yo‘q</div>}
      </div>
      {multi && showTotal && (
        <div className="mt-1.5 flex items-center justify-between border-t border-white/10 pt-1.5">
          <span className="text-white/50">{t("common.total")}</span>
          <span className="font-semibold tabular-nums">{formatValue(total, unit)}</span>
        </div>
      )}
    </div>
  );
}

function averageLine(value: number, unit?: string) {
  if (!value) return null;
  return (
    <ReferenceLine
      y={value}
      stroke={MUTE}
      strokeDasharray="4 4"
      strokeOpacity={0.7}
      ifOverflow="extendDomain"
      label={{ value: `o‘rtacha ${formatValue(Math.round(value * 10) / 10, unit)}`, position: "insideTopRight", fill: MUTE, fontSize: 10 }}
    />
  );
}

// ---------------------------------------------------------------- legend

export interface LegendItem {
  key: string;
  name: string;
  color: string;
  value?: number;
}

/** Pill legend; clicking an item toggles its series (the last visible one cannot be hidden). */
export function ChartLegend({ items, hidden, onToggle }: { items: LegendItem[]; hidden?: Set<string>; onToggle?: (key: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item) => {
        const off = hidden?.has(item.key) ?? false;
        return (
          <button
            key={item.key}
            type="button"
            disabled={!onToggle}
            onClick={() => onToggle?.(item.key)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-xs transition",
              off ? "bg-transparent text-mute" : "bg-white text-ink",
              onToggle && "hover:border-ink/20",
            )}
          >
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: off ? "#d4d4d0" : item.color }} />
            <span className={cn(off && "line-through decoration-mute/60")}>{item.name}</span>
            {item.value !== undefined && <span className="tabular-nums text-mute">{formatNumber(item.value)}</span>}
          </button>
        );
      })}
    </div>
  );
}

function useHiddenSeries(total: number) {
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());
  const toggle = (key: string) =>
    setHidden((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else if (next.size < total - 1) next.add(key);
      return next;
    });
  return [hidden, toggle] as const;
}

// ------------------------------------------------------------- small ones

export function Sparkline({ values, color = ACCENT }: { values: number[]; color?: string }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
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

/** Smooth area trend without axes; used for the "today" hero card. */
export function TrendArea({ data, height = 120 }: { data: { label: string; value: number }[]; height?: number }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
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
        <Tooltip content={<InkTooltip />} cursor={{ stroke: INK, strokeOpacity: 0.15, strokeDasharray: "3 3" }} />
        <Area
          type="monotone"
          dataKey="value"
          name={t("common.total")}
          stroke={ACCENT_DEEP}
          strokeWidth={2.2}
          fill={`url(#${id})`}
          activeDot={{ r: 5, fill: INK, stroke: "#fff", strokeWidth: 2 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ------------------------------------------------------------ bar charts

/** Dense thin bars; the hovered (or largest) bar and its neighbours are drawn in ink. */
export function VolumeBars({ data, height = 200 }: { data: { label: string; value: number }[]; height?: number }) {
  const values = data.map((item) => item.value);
  const [active, setActive] = useState<number | null>(null);
  const focus = active ?? maxIndexOf(values);
  const spread = data.length > 20 ? 3 : 1;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        data={data}
        margin={{ top: 14, right: 0, bottom: 0, left: 0 }}
        barCategoryGap="22%"
        onMouseMove={(state) => setActive(typeof state.activeTooltipIndex === "number" ? state.activeTooltipIndex : null)}
        onMouseLeave={() => setActive(null)}
      >
        <XAxis dataKey="label" tick={TICK} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={28} />
        <YAxis hide domain={[0, "dataMax"]} />
        <Tooltip content={<InkTooltip />} cursor={false} />
        {averageLine(average(values))}
        <Bar dataKey="value" name={t("common.total")} radius={[4, 4, 4, 4]} isAnimationActive={false}>
          {data.map((item, index) => (
            <Cell key={item.label} fill={Math.abs(index - focus) <= spread ? INK : MUTED_BAR} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Diagonal hatch fills; called as a function because Recharts only renders raw <defs> children. */
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

/** Category tick that wraps long labels onto two lines. */
function WrapTick({ x = 0, y = 0, payload }: { x?: number; y?: number; payload?: { value?: string | number } }) {
  const words = String(payload?.value ?? "").split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > 14 && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  const shown = lines.slice(0, 2);
  if (lines.length > 2) shown[1] = `${shown[1]}…`;
  return (
    <text x={x} y={y} textAnchor="middle" fontSize={11} fill={MUTE}>
      {shown.map((line, index) => (
        <tspan key={line} x={x} dy={index === 0 ? 12 : 13}>
          {line}
        </tspan>
      ))}
    </text>
  );
}

/** Rounded hatched columns; the hovered (or highlighted) column turns accent with a value bubble. */
export function HatchedColumns({
  data,
  height = 220,
  highlight,
  showAxis = true,
  showAverage = false,
  wrapLabels = false,
  unit,
}: {
  data: { label: string; value: number }[];
  height?: number;
  highlight?: number;
  showAxis?: boolean;
  showAverage?: boolean;
  wrapLabels?: boolean;
  unit?: string;
}) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const values = data.map((item) => item.value);
  const [active, setActive] = useState<number | null>(null);
  const focus = active ?? highlight ?? maxIndexOf(values);
  const renderLabel = (props: LabelProps & { index?: number }) => {
    if (props.index !== focus) return null;
    const x = Number(props.x ?? 0) + Number(props.width ?? 0) / 2;
    const y = Number(props.y ?? 0) - 10;
    const text = formatValue(Number(props.value ?? 0), unit);
    const width = Math.max(34, text.length * 7 + 18);
    return (
      <g pointerEvents="none">
        <rect x={x - width / 2} y={y - 22} width={width} height={22} rx={11} fill={INK} />
        <path d={`M${x - 4},${y} L${x + 4},${y} L${x},${y + 4} Z`} fill={INK} />
        <text x={x} y={y - 7} textAnchor="middle" fontSize={11} fontWeight={600} fill="#fff">
          {text}
        </text>
      </g>
    );
  };
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        data={data}
        margin={{ top: 36, right: 4, bottom: 0, left: showAxis ? -14 : 4 }}
        barCategoryGap={data.length > 16 ? "14%" : "20%"}
        onMouseMove={(state) => setActive(typeof state.activeTooltipIndex === "number" ? state.activeTooltipIndex : null)}
        onMouseLeave={() => setActive(null)}
      >
        {hatchDefs(id)}
        {showAxis && <CartesianGrid stroke={GRID} vertical={false} />}
        <XAxis
          dataKey="label"
          tick={wrapLabels ? <WrapTick /> : TICK}
          tickLine={false}
          axisLine={false}
          interval={wrapLabels ? 0 : "preserveStartEnd"}
          minTickGap={wrapLabels ? 0 : 6}
          height={wrapLabels ? 40 : 30}
        />
        <YAxis hide={!showAxis} tick={TICK} tickLine={false} axisLine={false} allowDecimals={false} width={44} />
        <Tooltip content={<InkTooltip unit={unit} />} cursor={false} />
        {showAverage && averageLine(average(values), unit)}
        <Bar dataKey="value" name={t("common.total")} radius={[12, 12, 12, 12]} maxBarSize={72} isAnimationActive={false}>
          {data.map((item, index) => (
            <Cell key={`${item.label}-${index}`} fill={index === focus ? `url(#${id}-accent)` : `url(#${id}-muted)`} />
          ))}
          <LabelList dataKey="value" content={renderLabel} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function ColumnChart({
  data,
  xKey,
  yKey,
  height = 240,
  showAverage = false,
}: {
  data: Record<string, number | string>[];
  xKey: string;
  yKey: string;
  height?: number;
  showAverage?: boolean;
}) {
  return (
    <HatchedColumns
      height={height}
      showAverage={showAverage}
      data={data.map((row) => ({ label: String(row[xKey] ?? ""), value: Number(row[yKey] ?? 0) }))}
    />
  );
}

// ---------------------------------------------------------- stacked bars

export interface StackSeries {
  key: string;
  name: string;
  color: string;
}

interface SegmentProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  fill?: string;
  index?: number;
  payload?: Record<string, number | string>;
}

function topRoundedPath(x: number, y: number, width: number, height: number, radius: number): string {
  const r = Math.max(0, Math.min(radius, width / 2, height));
  return `M${x},${y + height} L${x},${y + r} Q${x},${y} ${x + r},${y} L${x + width - r},${y} Q${x + width},${y} ${x + width},${y + r} L${x + width},${y + height} Z`;
}

/**
 * Stacked columns: biggest series at the bottom, only the topmost visible segment is rounded,
 * segments are separated by a hairline gap and non-hovered columns fade out.
 */
export function StackedColumns({
  rows,
  series,
  height = 280,
  legend = true,
}: {
  rows: Record<string, number | string>[];
  series: StackSeries[];
  height?: number;
  legend?: boolean;
}) {
  const [hidden, toggle] = useHiddenSeries(series.length);
  const [active, setActive] = useState<number | null>(null);
  const totals = new Map(series.map((item) => [item.key, rows.reduce((sum, row) => sum + (Number(row[item.key]) || 0), 0)]));
  const ordered = [...series].sort((a, b) => (totals.get(b.key) ?? 0) - (totals.get(a.key) ?? 0));
  const visible = ordered.filter((item) => !hidden.has(item.key));
  const columnTotals = rows.map((row) => visible.reduce((sum, item) => sum + (Number(row[item.key]) || 0), 0));

  const renderSegment = (seriesKey: string) => (raw: unknown) => {
    const props = raw as SegmentProps;
    const { x = 0, y = 0, width = 0, height: barHeight = 0, fill, index, payload } = props;
    if (barHeight <= 0 || !payload) return <g />;
    const top = [...visible].reverse().find((item) => (Number(payload[item.key]) || 0) > 0)?.key;
    const gap = barHeight > 3 ? 1.5 : 0;
    const d = seriesKey === top ? topRoundedPath(x, y + gap, width, barHeight - gap, 6) : `M${x},${y + gap} h${width} v${barHeight - gap} h${-width} Z`;
    return <path d={d} fill={fill} opacity={active === null || active === index ? 1 : 0.35} />;
  };

  return (
    <div>
      {legend && (
        <div className="mb-3">
          <ChartLegend
            items={ordered.map((item) => ({ key: item.key, name: item.name, color: item.color, value: totals.get(item.key) }))}
            hidden={hidden}
            onToggle={toggle}
          />
        </div>
      )}
      <ResponsiveContainer width="100%" height={height}>
        <BarChart
          data={rows}
          margin={{ top: 8, right: 4, bottom: 0, left: -14 }}
          barCategoryGap={rows.length > 20 ? "24%" : "32%"}
          onMouseMove={(state) => setActive(typeof state.activeTooltipIndex === "number" ? state.activeTooltipIndex : null)}
          onMouseLeave={() => setActive(null)}
        >
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="label" tick={TICK} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={20} />
          <YAxis tick={TICK} tickLine={false} axisLine={false} allowDecimals={false} width={44} />
          <Tooltip content={<InkTooltip showTotal />} cursor={false} />
          {averageLine(average(columnTotals))}
          {visible.map((item) => (
            <Bar
              key={item.key}
              dataKey={item.key}
              name={item.name}
              stackId="stack"
              fill={item.color}
              maxBarSize={28}
              isAnimationActive={false}
              shape={renderSegment(item.key)}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ------------------------------------------------------------ time series

export function TimeseriesChart({ data, height = 280, stacked = false }: { data: Timeseries; height?: number; stacked?: boolean }) {
  const rows = data.buckets.map((bucket, index) => {
    const row: Record<string, number | string> = { label: formatBucket(bucket, data.bucket), total: data.totals[index] ?? 0 };
    for (const series of data.series) row[series.code] = series.values[index] ?? 0;
    return row;
  });
  const series = data.series.map((item, index) => ({ key: item.code, name: item.name, color: categoryColor(item.code, item.color, index) }));
  const [hidden, toggle] = useHiddenSeries(series.length + 1);
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");

  if (stacked) return <StackedColumns rows={rows} series={series} height={height} />;

  const lines = [{ key: "total", name: t("common.total"), color: INK }, ...series.slice(0, 5)];
  return (
    <div>
      <div className="mb-3">
        <ChartLegend items={lines} hidden={hidden} onToggle={toggle} />
      </div>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: -14 }}>
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={INK} stopOpacity={0.12} />
              <stop offset="100%" stopColor={INK} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="label" tick={TICK} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={20} />
          <YAxis tick={TICK} tickLine={false} axisLine={false} allowDecimals={false} width={44} />
          <Tooltip content={<InkTooltip />} cursor={{ stroke: INK, strokeOpacity: 0.15, strokeDasharray: "3 3" }} />
          {lines
            .filter((line) => !hidden.has(line.key))
            .map((line) => (
              <Line
                key={line.key}
                type="monotone"
                dataKey={line.key}
                name={line.name}
                stroke={line.color}
                strokeWidth={line.key === "total" ? 2.5 : 1.6}
                dot={false}
                activeDot={{ r: 4, fill: line.color, stroke: "#fff", strokeWidth: 2 }}
                isAnimationActive={false}
              />
            ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Single metric over time as a soft area with an average guide; gaps (null) are kept as gaps. */
export function MetricArea({
  data,
  color = INK,
  unit,
  height = 240,
}: {
  data: { label: string; value: number | null }[];
  color?: string;
  unit?: string;
  height?: number;
}) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const values = data.map((item) => item.value).filter((value): value is number => value !== null);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 12, right: 8, bottom: 0, left: -6 }}>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.28} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="label" tick={TICK} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={24} />
        <YAxis tick={TICK} tickLine={false} axisLine={false} width={44} />
        <Tooltip content={<InkTooltip unit={unit} />} cursor={{ stroke: INK, strokeOpacity: 0.15, strokeDasharray: "3 3" }} />
        {averageLine(average(values), unit)}
        <Area
          type="monotone"
          dataKey="value"
          name={t("common.total")}
          stroke={color}
          strokeWidth={2.2}
          fill={`url(#${id})`}
          connectNulls={false}
          activeDot={{ r: 5, fill: color, stroke: "#fff", strokeWidth: 2 }}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ------------------------------------------------------------------ donut

/** Donut with a linked legend: hovering a slice or a legend row focuses it and updates the centre. */
export function DonutChart({ items, total, height = 200 }: { items: TypeCount[]; total: number; height?: number }) {
  const [active, setActive] = useState<number | null>(null);
  const colors = items.map((item, index) => categoryColor(item.code, item.color, index));
  const focused = active !== null ? items[active] : undefined;
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
                onMouseEnter={(_, index) => setActive(index)}
                onMouseLeave={() => setActive(null)}
              >
                {items.map((item, index) => (
                  <Cell key={item.code} fill={colors[index]} opacity={active === null || active === index ? 1 : 0.25} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-8 text-center">
            <span className="text-2xl font-semibold tracking-tight text-ink">{formatNumber(focused ? focused.count : total)}</span>
            <span className="line-clamp-2 text-[11px] leading-tight text-mute">
              {focused ? `${focused.name} · ${formatPct(focused.pct)}` : t("common.total")}
            </span>
          </div>
        </div>
        <ul className="w-full space-y-0.5 text-[13px]">
          {items.map((item, index) => (
            <li
              key={item.code}
              onMouseEnter={() => setActive(index)}
              onMouseLeave={() => setActive(null)}
              className={cn(
                "flex cursor-default items-center justify-between gap-2 rounded-xl px-2 py-1.5 transition",
                active === index && "bg-soft",
                active !== null && active !== index && "opacity-50",
              )}
            >
              <span className="flex min-w-0 items-center gap-2">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: colors[index] }} />
                <span className="truncate text-ink/80">{item.name}</span>
              </span>
              <span className="shrink-0 font-medium tabular-nums text-ink">
                {formatNumber(item.count)} <span className="text-mute">· {formatPct(item.pct)}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// ------------------------------------------------------------ ranked bars

/** Ranked list rendered as labelled progress bars with the share of the total. */
export function HorizontalBars({
  items,
  color,
}: {
  items: { label: string; count: number; color?: string | null; sublabel?: string | null }[];
  color?: string;
}) {
  const max = Math.max(1, ...items.map((item) => item.count));
  const total = items.reduce((sum, item) => sum + item.count, 0) || 1;
  return (
    <ul className="space-y-3">
      {items.map((item, index) => (
        <li key={`${item.label}-${index}`} className="group">
          <div className="mb-1 flex items-baseline justify-between gap-3 text-[13px]">
            <span className="min-w-0 truncate text-ink/85">
              <span className="mr-2 inline-block w-4 text-right text-xs tabular-nums text-mute">{index + 1}</span>
              {item.label}
              {item.sublabel && <span className="ml-1.5 text-xs text-mute">{item.sublabel}</span>}
            </span>
            <span className="shrink-0 tabular-nums">
              <span className="font-semibold text-ink">{formatNumber(item.count)}</span>
              <span className="ml-1.5 text-xs text-mute">{formatPct((item.count / total) * 100)}</span>
            </span>
          </div>
          <div className="ml-6 h-2 rounded-full bg-soft">
            <div
              className="h-2 rounded-full transition-[width] duration-500 group-hover:opacity-80"
              style={{ width: `${(item.count / max) * 100}%`, backgroundColor: item.color ?? color ?? (index === 0 ? ACCENT : INK) }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------- heatmap

function heatColor(ratio: number): string {
  return ratio > 0.85 ? INK : `rgba(95, 205, 60, ${0.08 + ratio * 0.85})`;
}

export function WeekHourHeatmap({ cells }: { cells: HeatCell[] }) {
  const max = Math.max(1, ...cells.map((cell) => cell.count));
  const lookup = new Map(cells.map((cell) => [`${cell.weekday}-${cell.hour}`, cell.count]));
  const hours = Array.from({ length: 24 }, (_, hour) => hour);
  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full border-separate border-spacing-[3px] text-[10px]">
          <thead>
            <tr>
              <th />
              {hours.map((hour) => (
                <th key={hour} className="font-normal text-mute">
                  {hour % 3 === 0 ? hour : ""}
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
                  return (
                    <td
                      key={hour}
                      title={`${t(`weekday.${weekday}` as "weekday.1")}, ${String(hour).padStart(2, "0")}:00 — ${formatNumber(count)}`}
                      className="h-6 min-w-5 rounded-md transition hover:ring-2 hover:ring-ink/30"
                      style={{ backgroundColor: heatColor(count / max) }}
                    />
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex items-center justify-end gap-2 text-[11px] text-mute">
        Kam
        {[0.05, 0.25, 0.5, 0.75, 1].map((ratio) => (
          <span key={ratio} className="h-3 w-5 rounded" style={{ backgroundColor: heatColor(ratio) }} />
        ))}
        Ko‘p
      </div>
    </div>
  );
}
