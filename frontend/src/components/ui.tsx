import type { UseQueryResult } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Folder,
  Inbox,
  Loader2,
  MoveRight,
  X,
  type LucideIcon,
} from "lucide-react";
import { Fragment, type ReactNode } from "react";
import { Link } from "react-router-dom";

import { Select } from "@/components/Select";
import { ApiError } from "@/lib/api";
import { cn, formatNumber } from "@/lib/format";
import { t, tDynamic } from "@/lib/i18n";
import { categoryColor } from "@/lib/palette";
import type { CameraStatus, PageMeta, Severity, TimeRange, VehicleStatus, ViolationStatus } from "@/lib/types";

// ------------------------------------------------------------------ text

/** Renders a figure with its fractional / secondary part dimmed, e.g. 97<dim>.9%</dim> or 41<dim> / 45</dim>. */
export function Figure({ value, className }: { value: ReactNode; className?: string }) {
  if (typeof value !== "string" && typeof value !== "number") return <span className={className}>{value}</span>;
  const text = String(value);
  const match = /^(.*?\d)((?:\.\d+|\s\/\s).*)$/.exec(text);
  if (!match) return <span className={className}>{text}</span>;
  return (
    <span className={className}>
      {match[1]}
      <span className="text-ink/25">{match[2]}</span>
    </span>
  );
}

export function DeltaChip({ value, positiveIsGood = true, suffix = "%" }: { value: number | null | undefined; positiveIsGood?: boolean; suffix?: string }) {
  if (value === null || value === undefined) return null;
  const good = (value >= 0) === positiveIsGood;
  return (
    <span className={good ? "chip-up" : "chip-down"}>
      {value >= 0 ? "+" : "−"}
      {Math.abs(value).toFixed(1)}
      {suffix}
    </span>
  );
}

// ----------------------------------------------------------------- cards

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <section className={cn("card", className)}>{children}</section>;
}

export function ArrowLink({ to, label = t("common.viewAll") }: { to: string; label?: string }) {
  return (
    <Link to={to} className="icon-btn h-9 w-9" title={label} aria-label={label}>
      <ArrowUpRight className="h-4 w-4" />
    </Link>
  );
}

export function CardHeader({ title, action, subtitle, to }: { title: string; action?: ReactNode; subtitle?: string; to?: string }) {
  return (
    <div className="flex items-start justify-between gap-3 px-5 pb-2 pt-5">
      <div className="min-w-0">
        <h2 className="truncate text-[17px] font-semibold tracking-tight text-ink">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-mute">{subtitle}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {action}
        {to && <ArrowLink to={to} />}
      </div>
    </div>
  );
}

export interface Crumb {
  label: string;
  to?: string;
}

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav className="flex flex-wrap items-center gap-1.5 text-xs text-mute" aria-label="breadcrumb">
      {items.map((item, index) => (
        <Fragment key={`${item.label}-${index}`}>
          {index > 0 && <MoveRight className="h-3.5 w-3.5 text-ink/30" />}
          <span className="inline-flex items-center gap-1">
            <Folder className="h-3.5 w-3.5" />
            {item.to ? (
              <Link to={item.to} className="hover:text-ink">
                {item.label}
              </Link>
            ) : (
              <span className="text-ink/60">{item.label}</span>
            )}
          </span>
        </Fragment>
      ))}
    </nav>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
  stats,
  crumbs,
}: {
  title: ReactNode;
  subtitle?: string;
  actions?: ReactNode;
  stats?: ReactNode;
  crumbs?: Crumb[];
}) {
  const trail = crumbs ?? [{ label: "Bosh sahifa", to: "/" }, { label: typeof title === "string" ? title : "" }];
  return (
    <div className="mb-6 space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <Breadcrumbs items={trail} />
          <h1 className="mt-2 text-[30px] font-medium leading-tight tracking-tight text-ink sm:text-[34px]">{title}</h1>
          {subtitle && <p className="mt-1 text-[13px] text-mute">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {stats && <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-[repeat(auto-fit,minmax(200px,1fr))]">{stats}</div>}
    </div>
  );
}

export const ICON_TONES = {
  blue: "bg-ink text-white",
  green: "bg-accent-300 text-ink",
  red: "bg-rose-100 text-rose-600",
  amber: "bg-amber-100 text-amber-600",
  violet: "bg-violet-100 text-violet-600",
  sky: "bg-sky-100 text-sky-600",
  pink: "bg-pink-100 text-pink-600",
  slate: "bg-soft text-ink/70",
} as const;

export type IconTone = keyof typeof ICON_TONES;

export function IconBadge({ icon: Icon, tone, className }: { icon: LucideIcon; tone: IconTone; className?: string }) {
  return (
    <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-full", ICON_TONES[tone], className)}>
      <Icon className="h-[17px] w-[17px]" />
    </div>
  );
}

/** KPI card: label + icon, large figure, delta chip / hint and an optional sparkline. */
export function KpiTile({
  icon,
  tone,
  label,
  value,
  delta,
  deltaPositiveIsGood = true,
  hint,
  spark,
  footer,
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
  /** Extra detail pinned to the bottom of the card (share bars, breakdowns). */
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("card flex min-w-0 flex-col p-5", className)}>
      <div className="flex items-start justify-between gap-3">
        <p className="truncate pt-1 text-[13px] font-medium text-mute">{label}</p>
        <IconBadge icon={icon} tone={tone} />
      </div>
      <p className="mt-1 truncate text-[28px] font-semibold leading-tight tracking-tight text-ink">
        <Figure value={value} />
      </p>
      {delta !== undefined || hint || spark ? (
        <div className="mt-2 flex min-h-6 items-end justify-between gap-2">
          <p className="flex min-w-0 items-center gap-2 text-xs">
            <DeltaChip value={delta} positiveIsGood={deltaPositiveIsGood} />
            {hint && <span className="truncate text-mute">{hint}</span>}
          </p>
          {spark && <div className="w-24 shrink-0">{spark}</div>}
        </div>
      ) : null}
      {footer && <div className="mt-auto pt-3">{footer}</div>}
    </div>
  );
}

export interface SharePart {
  label: string;
  value: number;
  color: string;
}

/** Thin stacked bar with a compact legend, e.g. camera statuses inside a KPI card. */
export function ShareBar({ parts, total }: { parts: SharePart[]; total: number }) {
  const visible = parts.filter((part) => part.value > 0);
  const sum = Math.max(total, 1);
  return (
    <div>
      <div className="flex h-1.5 gap-0.5 overflow-hidden rounded-full bg-soft">
        {visible.map((part) => (
          <span key={part.label} className="h-full rounded-full" style={{ width: `${(part.value / sum) * 100}%`, backgroundColor: part.color }} />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-mute">
        {visible.map((part) => (
          <span key={part.label} className="inline-flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: part.color }} />
            {part.label} <b className="font-semibold text-ink">{formatNumber(part.value)}</b>
          </span>
        ))}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ tabs

export interface TabItem<T extends string> {
  value: T;
  label: string;
  count?: number;
  tone?: "blue" | "green" | "red" | "amber" | "violet";
}

const COUNT_DOTS = {
  blue: "bg-ink",
  green: "bg-accent-500",
  red: "bg-rose-500",
  amber: "bg-amber-400",
  violet: "bg-violet-500",
} as const;

export function CountTabs<T extends string>({ items, value, onChange }: { items: TabItem<T>[]; value: T; onChange: (value: T) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button key={item.value} type="button" onClick={() => onChange(item.value)} className={cn("pill", active && "pill-active")}>
            {item.tone && <span className={cn("h-1.5 w-1.5 rounded-full", active ? "bg-white" : COUNT_DOTS[item.tone])} />}
            {item.label}
            {item.count !== undefined && (
              <span className={cn("text-xs font-semibold", active ? "text-white/60" : "text-mute")}>{formatNumber(item.count)}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function RangeTabs({ value, onChange }: { value: TimeRange; onChange: (range: TimeRange) => void }) {
  const ranges: TimeRange[] = ["24h", "7d", "30d"];
  return (
    <div className="segmented">
      {ranges.map((range) => (
        <button key={range} type="button" onClick={() => onChange(range)} className={cn("segmented-item", value === range && "segmented-active")}>
          {t(`range.${range}`)}
        </button>
      ))}
    </div>
  );
}

// ----------------------------------------------------------------- panel

export function SidePanel({ title, badge, onClose, children }: { title: ReactNode; badge?: ReactNode; onClose: () => void; children: ReactNode }) {
  return (
    <aside className="card flex max-h-[calc(100vh-7rem)] flex-col overflow-hidden xl:sticky xl:top-24">
      <div className="flex items-center gap-2 px-5 pb-3 pt-5">
        <h2 className="min-w-0 flex-1 truncate text-[17px] font-semibold tracking-tight text-ink">{title}</h2>
        {badge}
        <button type="button" onClick={onClose} className="icon-btn h-8 w-8" aria-label="close">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">{children}</div>
    </aside>
  );
}

// ---------------------------------------------------------------- badges

type Tone = "green" | "red" | "amber" | "blue" | "slate" | "violet";

const toneClasses: Record<Tone, string> = {
  green: "bg-accent-100 text-accent-700",
  red: "bg-rose-50 text-rose-600",
  amber: "bg-amber-50 text-amber-700",
  blue: "bg-sky-50 text-sky-700",
  slate: "bg-soft text-mute",
  violet: "bg-violet-50 text-violet-700",
};

export function Badge({ tone = "slate", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-semibold", toneClasses[tone], className)}>
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

export const SeverityBadge = ({ severity }: { severity: Severity }) => <Badge tone={severityTone[severity]}>{tDynamic("severity", severity)}</Badge>;

export function TypeChip({ name, code, color }: { name: string; code?: string; color: string | null }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[13px]">
      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: categoryColor(code, color) }} />
      {name}
    </span>
  );
}

export function PlateNumber({ value }: { value: string | null }) {
  if (!value) return <span className="text-mute">—</span>;
  return (
    <span className="inline-block whitespace-nowrap rounded-md border border-ink/15 bg-white px-1.5 py-0.5 font-mono text-xs font-semibold tracking-wider text-ink">
      {value}
    </span>
  );
}

// ---------------------------------------------------------------- states

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn("h-5 w-5 animate-spin text-ink", className)} />;
}

export function LoadingBlock({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center justify-center gap-2 py-10 text-[13px] text-mute", className)}>
      <Spinner /> {t("common.loading")}
    </div>
  );
}

export function ErrorBlock({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const message = error instanceof ApiError ? error.message : t("common.error");
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-10 text-center text-[13px] text-ink/70">
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
    <div className="flex flex-col items-center justify-center gap-2 py-10 text-[13px] text-mute">
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-soft">
        <Inbox className="h-5 w-5" />
      </span>
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

// ------------------------------------------------------------ pagination

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

export function Pagination({ meta, onPage, extra }: { meta: PageMeta; onPage: (page: number) => void; extra?: ReactNode }) {
  const from = meta.total === 0 ? 0 : (meta.page - 1) * meta.page_size + 1;
  const to = Math.min(meta.page * meta.page_size, meta.total);
  const pageButton = "flex h-8 min-w-8 items-center justify-center rounded-full px-2 text-xs font-semibold transition";
  const arrow = cn(pageButton, "text-mute hover:bg-soft hover:text-ink disabled:opacity-30 disabled:hover:bg-transparent");
  const lastPage = Math.max(meta.pages, 1);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-3.5 text-xs text-mute">
      <div className="flex items-center gap-3">
        {extra}
        <span>
          {formatNumber(from)}–{formatNumber(to)} / {formatNumber(meta.total)} ta natija
        </span>
      </div>
      <div className="flex items-center gap-0.5">
        <button type="button" className={arrow} disabled={meta.page <= 1} onClick={() => onPage(1)} aria-label="first">
          <ChevronsLeft className="h-4 w-4" />
        </button>
        <button type="button" className={arrow} disabled={meta.page <= 1} onClick={() => onPage(meta.page - 1)} aria-label={t("common.prev")}>
          <ChevronLeft className="h-4 w-4" />
        </button>
        {pageWindow(meta.page, lastPage).map((item, index) =>
          item === "…" ? (
            <span key={`gap-${index}`} className="px-1 text-mute">
              …
            </span>
          ) : (
            <button
              key={item}
              type="button"
              onClick={() => onPage(item)}
              className={cn(pageButton, item === meta.page ? "bg-ink text-white" : "text-ink/70 hover:bg-soft")}
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

export function PageSizeSelect({ value, onChange }: { value: number; onChange: (size: number) => void }) {
  return (
    <Select
      size="sm"
      className="w-[84px]"
      aria-label="Sahifadagi qatorlar"
      value={String(value)}
      onChange={(next) => onChange(Number(next))}
      options={[10, 20, 50, 100].map((size) => ({ value: String(size), label: String(size) }))}
    />
  );
}

// ----------------------------------------------------------------- misc

export function StatTile({ label, value, tone = "slate", hint }: { label: string; value: ReactNode; tone?: Tone; hint?: ReactNode }) {
  return (
    <div className="card px-5 py-4">
      <p className="text-[13px] font-medium text-mute">{label}</p>
      <p
        className={cn(
          "mt-1 text-[26px] font-semibold tracking-tight text-ink",
          tone === "green" && "text-accent-600",
          tone === "red" && "text-rose-600",
          tone === "amber" && "text-amber-500",
          tone === "violet" && "text-violet-600",
        )}
      >
        <Figure value={value} />
      </p>
      {hint && <div className="mt-1 text-xs">{hint}</div>}
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-2.5 text-[13px]">
      <dt className="text-mute">{label}</dt>
      <dd className="text-right font-medium text-ink">{children}</dd>
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
