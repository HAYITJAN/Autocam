import type { UseQueryResult } from "@tanstack/react-query";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Inbox,
  Info,
  Loader2,
  X,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";

import { ApiError } from "@/lib/api";
import { cn, formatNumber } from "@/lib/format";
import { t, tDynamic } from "@/lib/i18n";
import type {
  CameraStatus,
  PageMeta,
  Severity,
  TimeRange,
  VehicleStatus,
  ViolationStatus,
} from "@/lib/types";

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <section className={cn("card", className)}>{children}</section>;
}

export function CardHeader({ title, action, subtitle }: { title: string; action?: ReactNode; subtitle?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
      <div className="min-w-0">
        <h2 className="truncate text-[15px] font-semibold text-navy-900">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-slate-400">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-[22px] font-bold leading-tight tracking-tight text-navy-900">{title}</h1>
        {subtitle && <p className="mt-1 text-[13px] text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-3">{actions}</div>}
    </div>
  );
}

export const ICON_TONES = {
  blue: "bg-brand-600 shadow-brand-600/30",
  green: "bg-emerald-500 shadow-emerald-500/30",
  red: "bg-rose-500 shadow-rose-500/30",
  amber: "bg-amber-400 shadow-amber-400/30",
  violet: "bg-violet-500 shadow-violet-500/30",
  sky: "bg-sky-500 shadow-sky-500/30",
  pink: "bg-pink-500 shadow-pink-500/30",
  slate: "bg-slate-400 shadow-slate-400/30",
} as const;

export type IconTone = keyof typeof ICON_TONES;

export function IconBadge({ icon: Icon, tone, className }: { icon: LucideIcon; tone: IconTone; className?: string }) {
  return (
    <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] text-white shadow-md", ICON_TONES[tone], className)}>
      <Icon className="h-[18px] w-[18px]" />
    </div>
  );
}

/** Compact KPI used in page headers: coloured icon, value, label, optional delta and sparkline. */
export function KpiTile({
  icon: Icon,
  tone,
  label,
  value,
  delta,
  deltaPositiveIsGood = true,
  hint,
  spark,
  className,
}: {
  icon: LucideIcon;
  tone: IconTone;
  label: string;
  value: ReactNode;
  delta?: number | null;
  deltaPositiveIsGood?: boolean;
  hint?: ReactNode;
  spark?: ReactNode;
  className?: string;
}) {
  const hasDelta = delta !== null && delta !== undefined;
  const good = hasDelta ? (delta >= 0) === deltaPositiveIsGood : null;
  return (
    <div className={cn("card relative flex min-w-[170px] flex-col px-4 py-3.5", className)}>
      <span className="absolute right-3 top-3 text-slate-300" title={label}>
        <Info className="h-4 w-4" />
      </span>
      <div className="flex items-center gap-3 pr-5">
        <IconBadge icon={Icon} tone={tone} />
        <p className="truncate text-xl font-bold leading-tight tracking-tight text-navy-900">{value}</p>
      </div>
      <p className="mt-2.5 truncate text-[13px] text-slate-500">{label}</p>
      {hasDelta || hint || spark ? (
        <div className="mt-1 flex items-end justify-between gap-2">
          <p className="flex min-w-0 items-center gap-1.5 text-[11px]">
            {hasDelta && (
              <span className={cn("rounded-md px-1.5 py-0.5 font-semibold", good ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600")}>
                {delta >= 0 ? "↑" : "↓"} {Math.abs(delta).toFixed(1)}%
              </span>
            )}
            {hint && <span className="truncate text-slate-400">{hint}</span>}
          </p>
          {spark && <div className="w-20 shrink-0">{spark}</div>}
        </div>
      ) : null}
    </div>
  );
}

export interface TabItem<T extends string> {
  value: T;
  label: string;
  count?: number;
  tone?: "blue" | "green" | "red" | "amber" | "violet";
}

const COUNT_TONES = {
  blue: "bg-brand-50 text-brand-700",
  green: "bg-emerald-50 text-emerald-600",
  red: "bg-rose-50 text-rose-600",
  amber: "bg-amber-50 text-amber-600",
  violet: "bg-violet-50 text-violet-600",
} as const;

export function CountTabs<T extends string>({
  items,
  value,
  onChange,
}: {
  items: TabItem<T>[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="segmented">
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            onClick={() => onChange(item.value)}
            className={cn("segmented-item px-3.5 py-2 text-[13px]", active && "segmented-active")}
          >
            {item.label}
            {item.count !== undefined && (
              <span className={cn("rounded-md px-1.5 py-px text-[11px] font-semibold", COUNT_TONES[item.tone ?? "blue"])}>
                {formatNumber(item.count)}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function SidePanel({ title, badge, onClose, children }: { title: ReactNode; badge?: ReactNode; onClose: () => void; children: ReactNode }) {
  return (
    <aside className="card flex max-h-[calc(100vh-7rem)] flex-col overflow-hidden xl:sticky xl:top-20">
      <div className="flex items-center gap-2 border-b border-line px-4 py-3.5">
        <h2 className="min-w-0 flex-1 truncate text-[15px] font-bold text-navy-900">{title}</h2>
        {badge}
        <button type="button" onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="close">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">{children}</div>
    </aside>
  );
}

type Tone = "green" | "red" | "amber" | "blue" | "slate" | "violet";

const toneClasses: Record<Tone, string> = {
  green: "bg-emerald-50 text-emerald-600",
  red: "bg-rose-50 text-rose-600",
  amber: "bg-amber-50 text-amber-600",
  blue: "bg-brand-50 text-brand-600",
  slate: "bg-slate-100 text-slate-500",
  violet: "bg-violet-50 text-violet-600",
};

export function Badge({ tone = "slate", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-md px-2 py-0.5 text-[11px] font-semibold",
        toneClasses[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

const cameraTone: Record<CameraStatus, Tone> = { ONLINE: "green", OFFLINE: "red", WARNING: "amber", MAINTENANCE: "slate" };
const violationTone: Record<ViolationStatus, Tone> = {
  NEW: "blue",
  UNDER_REVIEW: "amber",
  CONFIRMED: "green",
  REJECTED: "red",
  ARCHIVED: "slate",
};
const vehicleTone: Record<VehicleStatus, Tone> = { NORMAL: "slate", WATCHLIST: "amber", BLACKLIST: "red" };
const severityTone: Record<Severity, Tone> = { LOW: "slate", MEDIUM: "blue", HIGH: "amber", CRITICAL: "red" };

export const CameraStatusBadge = ({ status }: { status: CameraStatus }) => (
  <Badge tone={cameraTone[status]}>
    <span className="h-1.5 w-1.5 rounded-full bg-current" />
    {tDynamic("camera.status", status)}
  </Badge>
);

export const ViolationStatusBadge = ({ status }: { status: ViolationStatus }) => (
  <Badge tone={violationTone[status]}>{tDynamic("violation.status", status)}</Badge>
);

export const VehicleStatusBadge = ({ status }: { status: VehicleStatus }) => (
  <Badge tone={vehicleTone[status]}>{tDynamic("vehicle.status", status)}</Badge>
);

export const SeverityBadge = ({ severity }: { severity: Severity }) => (
  <Badge tone={severityTone[severity]}>{tDynamic("severity", severity)}</Badge>
);

export function TypeChip({ name, color }: { name: string; color: string | null }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-sm">
      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color ?? "#94a3b8" }} />
      {name}
    </span>
  );
}

export function PlateNumber({ value }: { value: string | null }) {
  if (!value) return <span className="text-slate-400">—</span>;
  return (
    <span className="inline-block whitespace-nowrap rounded border border-slate-300 bg-white px-1.5 py-0.5 font-mono text-xs font-semibold tracking-wider text-slate-800">
      {value}
    </span>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn("h-5 w-5 animate-spin text-brand-600", className)} />;
}

export function LoadingBlock({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center justify-center gap-2 py-10 text-sm text-slate-500", className)}>
      <Spinner /> {t("common.loading")}
    </div>
  );
}

export function ErrorBlock({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const message = error instanceof ApiError ? error.message : t("common.error");
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-10 text-center text-sm text-slate-600">
      <AlertTriangle className="h-6 w-6 text-amber-500" />
      <p>{message}</p>
      {onRetry && (
        <button type="button" className="btn-secondary" onClick={onRetry}>
          {t("common.retry")}
        </button>
      )}
    </div>
  );
}

export function EmptyBlock({ message = t("common.empty") }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-10 text-sm text-slate-500">
      <Inbox className="h-6 w-6 text-slate-400" />
      {message}
    </div>
  );
}

/** Renders loading / error states and hands successful data to `children`. */
export function QueryView<T>({
  query,
  children,
  isEmpty,
  className,
}: {
  query: UseQueryResult<T>;
  children: (data: T) => ReactNode;
  isEmpty?: (data: T) => boolean;
  className?: string;
}) {
  if (query.isPending) return <LoadingBlock className={className} />;
  if (query.isError) return <ErrorBlock error={query.error} onRetry={() => void query.refetch()} />;
  if (isEmpty?.(query.data)) return <EmptyBlock />;
  return <>{children(query.data)}</>;
}

function pageWindow(page: number, pages: number): (number | "…")[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, index) => index + 1);
  const result: (number | "…")[] = [1];
  const start = Math.max(2, page - 1);
  const end = Math.min(pages - 1, page + 1);
  if (start > 2) result.push("…");
  for (let index = start; index <= end; index += 1) result.push(index);
  if (end < pages - 1) result.push("…");
  result.push(pages);
  return result;
}

export function Pagination({ meta, onPage }: { meta: PageMeta; onPage: (page: number) => void }) {
  const from = meta.total === 0 ? 0 : (meta.page - 1) * meta.page_size + 1;
  const to = Math.min(meta.page * meta.page_size, meta.total);
  const pageButton = "flex h-7 min-w-7 items-center justify-center rounded-md px-1.5 text-xs font-medium transition";
  const arrow = cn(pageButton, "text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-40 disabled:hover:bg-transparent");
  const lastPage = Math.max(meta.pages, 1);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3 text-xs text-slate-500">
      <span>
        {formatNumber(from)}–{formatNumber(to)} / {formatNumber(meta.total)} ta natija
      </span>
      <div className="flex items-center gap-0.5">
        <button type="button" className={arrow} disabled={meta.page <= 1} onClick={() => onPage(1)} aria-label="first">
          <ChevronsLeft className="h-4 w-4" />
        </button>
        <button type="button" className={arrow} disabled={meta.page <= 1} onClick={() => onPage(meta.page - 1)} aria-label={t("common.prev")}>
          <ChevronLeft className="h-4 w-4" />
        </button>
        {pageWindow(meta.page, lastPage).map((item, index) =>
          item === "…" ? (
            <span key={`gap-${index}`} className="px-1 text-slate-400">
              …
            </span>
          ) : (
            <button
              key={item}
              type="button"
              onClick={() => onPage(item)}
              className={cn(
                pageButton,
                item === meta.page ? "bg-brand-600 text-white shadow-sm shadow-brand-600/30" : "text-slate-600 hover:bg-slate-100",
              )}
            >
              {item}
            </button>
          ),
        )}
        <button type="button" className={arrow} disabled={meta.page >= meta.pages} onClick={() => onPage(meta.page + 1)} aria-label={t("common.next")}>
          <ChevronRight className="h-4 w-4" />
        </button>
        <button type="button" className={arrow} disabled={meta.page >= meta.pages} onClick={() => onPage(lastPage)} aria-label="last">
          <ChevronsRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export function RangeTabs({ value, onChange }: { value: TimeRange; onChange: (range: TimeRange) => void }) {
  const ranges: TimeRange[] = ["24h", "7d", "30d"];
  return (
    <div className="segmented">
      {ranges.map((range) => (
        <button
          key={range}
          type="button"
          onClick={() => onChange(range)}
          className={cn("segmented-item px-2.5 py-1", value === range && "segmented-active")}
        >
          {t(`range.${range}`)}
        </button>
      ))}
    </div>
  );
}

export function StatTile({ label, value, tone = "slate" }: { label: string; value: ReactNode; tone?: Tone }) {
  return (
    <div className="card px-4 py-3.5">
      <p className="text-xs text-slate-500">{label}</p>
      <p
        className={cn(
          "mt-1 text-xl font-bold tracking-tight text-navy-900",
          tone === "green" && "text-emerald-600",
          tone === "red" && "text-rose-600",
          tone === "amber" && "text-amber-500",
          tone === "blue" && "text-brand-600",
          tone === "violet" && "text-violet-600",
        )}
      >
        {value}
      </p>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-2 text-sm">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-right font-medium text-slate-800">{children}</dd>
    </div>
  );
}

export function NoPermission() {
  return <EmptyBlock message={t("common.noPermission")} />;
}

export function ComingSoon({ title }: { title: string }) {
  return (
    <>
      <PageHeader title={title} />
      <Card>
        <EmptyBlock message={t("common.comingSoon")} />
      </Card>
    </>
  );
}
