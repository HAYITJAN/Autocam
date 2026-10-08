import { ArrowUpRight } from "lucide-react";
import { Link } from "react-router-dom";

import { HorizontalBars, HatchedColumns } from "@/components/charts";
import { formatConfidence, formatNumber, formatPct, formatRelative } from "@/lib/format";
import { tDynamic } from "@/lib/i18n";
import { categoryColor } from "@/lib/palette";
import type { CameraStat, StatusCount, TypeCount, ViolationStatus, ViolationTypeStat } from "@/lib/types";

import { TypeIcon } from "./parts";

const STATUS_COLORS: Record<ViolationStatus, string> = {
  NEW: "#4fb0e6",
  UNDER_REVIEW: "#f5b740",
  CONFIRMED: "#6fd14a",
  REJECTED: "#f0566a",
  ARCHIVED: "#a8a8a3",
};

export function statusItems(byStatus: StatusCount[]): TypeCount[] {
  const total = byStatus.reduce((sum, item) => sum + item.count, 0) || 1;
  return byStatus
    .filter((item) => item.count > 0)
    .map((item) => ({
      code: item.status,
      name: tDynamic("violation.status", item.status),
      color: STATUS_COLORS[item.status],
      count: item.count,
      pct: (item.count / total) * 100,
    }));
}

export function pendingCount(byStatus: StatusCount[]): number {
  return byStatus.filter((item) => item.status === "NEW" || item.status === "UNDER_REVIEW").reduce((sum, item) => sum + item.count, 0);
}

/** A violation type with its event count; links to the events of that type. */
export function TypeCard({ stat, to, size = "md" }: { stat: ViolationTypeStat; to: string; size?: "md" | "lg" }) {
  const color = categoryColor(stat.code, stat.color);
  return (
    <Link to={to} className="group card flex flex-col gap-3 p-4 transition hover:-translate-y-0.5 hover:shadow-lg">
      <div className="flex items-start gap-3">
        <TypeIcon code={stat.code} icon={stat.icon} color={stat.color} />
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-[13px] font-semibold leading-snug text-ink">{stat.name}</p>
          {!stat.is_active && <p className="text-[11px] text-mute">Aniqlash o‘chirilgan</p>}
        </div>
        <ArrowUpRight className="h-4 w-4 shrink-0 text-mute transition group-hover:text-ink" />
      </div>
      {size === "lg" && stat.description && <p className="line-clamp-2 text-xs text-mute">{stat.description}</p>}
      <div className="flex items-end justify-between gap-2">
        <span className="text-[26px] font-semibold leading-none tracking-tight text-ink">{formatNumber(stat.count)}</span>
        <span className="text-xs font-medium text-mute">{formatPct(stat.pct)}</span>
      </div>
      <div className="h-1.5 rounded-full bg-soft">
        <div className="h-1.5 rounded-full" style={{ width: `${Math.min(100, stat.pct)}%`, backgroundColor: color }} />
      </div>
      <div className="grid grid-cols-2 gap-2 text-[11px] text-mute">
        <span>
          <b className="font-semibold text-ink">{formatNumber(stat.unique_vehicles)}</b> avtomobil
        </span>
        <span className="text-right">
          <b className="font-semibold text-amber-600">{formatNumber(stat.pending)}</b> kutilmoqda
        </span>
        {size === "lg" && (
          <>
            <span>
              AI: <b className="font-semibold text-ink">{stat.avg_confidence !== null ? formatConfidence(stat.avg_confidence) : "—"}</b>
            </span>
            <span className="text-right">{stat.last_at ? formatRelative(stat.last_at) : "—"}</span>
          </>
        )}
      </div>
    </Link>
  );
}

export function HourChart({ byHour, height = 220 }: { byHour: number[]; height?: number }) {
  const data = byHour.map((value, hour) => ({ label: String(hour).padStart(2, "0"), value }));
  return <HatchedColumns data={data} height={height} showAverage />;
}

export function CameraBars({ cameras }: { cameras: CameraStat[] }) {
  return (
    <HorizontalBars
      items={cameras.map((camera) => ({
        label: camera.code,
        sublabel: camera.district ? `${camera.name} · ${camera.district}` : camera.name,
        count: camera.count,
      }))}
    />
  );
}
