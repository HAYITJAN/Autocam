import { ArrowLeft, CalendarDays, Clock3, History, TriangleAlert, Video } from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";

import { useVehicle, useVehicleStatus, useVehicleViolations } from "@/api/queries";
import { DonutChart } from "@/components/charts";
import {
  Card,
  CardHeader,
  Field,
  KpiTile,
  PageHeader,
  Pagination,
  PlateNumber,
  QueryView,
  TypeChip,
  VehicleStatusBadge,
  ViolationStatusBadge,
} from "@/components/ui";
import { EventDrawer } from "@/components/violations/EventDrawer";
import { ConfidenceMeter } from "@/components/violations/parts";
import { ApiError } from "@/lib/api";
import { cn, formatClock, formatDate, formatDateTime, formatNumber, formatRelative } from "@/lib/format";
import { t } from "@/lib/i18n";
import { categoryColor } from "@/lib/palette";
import type { VehicleDetail, VehicleStatus, ViolationListItem } from "@/lib/types";
import { useHasPermission } from "@/stores/auth";

const STATUSES: VehicleStatus[] = ["NORMAL", "WATCHLIST", "BLACKLIST"];

function StatusForm({ vehicle }: { vehicle: VehicleDetail }) {
  const mutation = useVehicleStatus(vehicle.id);
  const [status, setStatus] = useState<VehicleStatus>(vehicle.status);
  const [reason, setReason] = useState(vehicle.status_reason ?? "");
  return (
    <form
      className="space-y-2 border-t border-line p-4"
      onSubmit={(event) => {
        event.preventDefault();
        mutation.mutate({ status, reason: reason.trim() || undefined });
      }}
    >
      <div className="text-sm font-medium text-ink/80">{t("vehicle.changeStatus")}</div>
      <select className="input" value={status} onChange={(event) => setStatus(event.target.value as VehicleStatus)}>
        {STATUSES.map((value) => (
          <option key={value} value={value}>
            {t(`vehicle.status.${value}`)}
          </option>
        ))}
      </select>
      <input className="input" placeholder={t("vehicle.reason")} value={reason} onChange={(event) => setReason(event.target.value)} />
      <button type="submit" className="btn-primary w-full" disabled={mutation.isPending}>
        {t("common.save")}
      </button>
      {mutation.isError && (
        <p className="text-sm text-red-600">{mutation.error instanceof ApiError ? mutation.error.message : t("common.error")}</p>
      )}
    </form>
  );
}

export default function VehicleDetailPage() {
  const id = Number(useParams().id);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<number | null>(null);
  const vehicle = useVehicle(id);
  const violations = useVehicleViolations(id, page, 20);
  const canEdit = useHasPermission("violations.review");

  return (
    <QueryView query={vehicle}>
      {(v) => (
        <div className="space-y-5">
          <PageHeader
            crumbs={[{ label: "Bosh sahifa", to: "/" }, { label: t("nav.vehicles"), to: "/vehicles" }, { label: v.plate_display }]}
            title={<PlateNumber value={v.plate_display} />}
            subtitle={[v.brand, v.model, v.color, v.country].filter(Boolean).join(" · ") || undefined}
            actions={
              <>
                <VehicleStatusBadge status={v.status} />
                <Link to="/vehicles" className="btn-secondary">
                  <ArrowLeft className="h-4 w-4" /> Avtomobillar
                </Link>
              </>
            }
          />

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiTile icon={TriangleAlert} tone="red" label="Jami qoidabuzarliklar" value={formatNumber(v.violations_count)} hint={`${formatNumber(v.total_detections)} ta o‘tishdan`} />
            <KpiTile
              icon={History}
              tone="slate"
              label="Birinchi qoidabuzarlik"
              value={<span>{formatDate(v.first_violation_at)}</span>}
              hint={v.first_violation_at ? formatClock(v.first_violation_at) : undefined}
            />
            <KpiTile
              icon={Clock3}
              tone="amber"
              label="Oxirgi qoidabuzarlik"
              value={<span>{formatDate(v.last_violation_at)}</span>}
              hint={v.last_violation_at ? formatRelative(v.last_violation_at) : undefined}
            />
            <KpiTile icon={Video} tone="blue" label="Kameralar" value={formatNumber(v.violation_cameras)} hint="qoidabuzarlik qayd etgan kameralar" />
          </div>

          <div className="grid gap-5 xl:grid-cols-3">
            <Card>
              <CardHeader title="Ma’lumotlar" />
              <dl className="divide-y divide-line px-5 pb-3">
                <Field label={t("vehicle.type")}>{v.vehicle_type?.name_uz ?? "—"}</Field>
                <Field label={t("vehicle.detections")}>{v.total_detections}</Field>
                <Field label={t("vehicle.violations")}>{v.total_violations}</Field>
                <Field label="Birinchi marta">{formatDateTime(v.first_seen_at)}</Field>
                <Field label={t("vehicle.lastSeen")}>{formatDateTime(v.last_seen_at)}</Field>
                <Field label={t("vehicle.lastCamera")}>{v.last_camera?.code ?? "—"}</Field>
                {v.status_reason && <Field label={t("vehicle.reason")}>{v.status_reason}</Field>}
              </dl>
              {canEdit && <StatusForm vehicle={v} />}
            </Card>
            <Card className="xl:col-span-2">
              <CardHeader title="Qoidabuzarlik turlari" />
              <div className="p-4">
                <DonutChart items={v.violations_by_type} total={v.total_violations} height={200} />
              </div>
            </Card>
          </div>

          <Card>
            <CardHeader title="Qoidabuzarliklar tarixi" subtitle={`Jami ${formatNumber(v.violations_count)} ta hodisa — yangidan eskiga`} />
            <QueryView query={violations} isEmpty={(data) => data.items.length === 0}>
              {(data) => (
                <>
                  <ViolationTimeline items={data.items} onSelect={setSelected} selected={selected} />
                  <Pagination meta={data.meta} onPage={setPage} />
                </>
              )}
            </QueryView>
          </Card>
          {selected !== null && <EventDrawer id={selected} onClose={() => setSelected(null)} />}
        </div>
      )}
    </QueryView>
  );
}

/** Events grouped by local day; clicking one opens its evidence in the drawer. */
function ViolationTimeline({ items, selected, onSelect }: { items: ViolationListItem[]; selected: number | null; onSelect: (id: number) => void }) {
  const days: { day: string; items: ViolationListItem[] }[] = [];
  for (const item of items) {
    const day = formatDate(item.occurred_at);
    const last = days.at(-1);
    if (last?.day === day) last.items.push(item);
    else days.push({ day, items: [item] });
  }
  return (
    <div className="space-y-5 px-5 py-4">
      {days.map((group) => (
        <section key={group.day}>
          <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold text-mute">
            <CalendarDays className="h-3.5 w-3.5" /> {group.day}
            <span className="font-normal">· {group.items.length} ta</span>
          </h3>
          <ol className="relative ml-1.5 space-y-1 border-l border-line pl-5">
            {group.items.map((item) => (
              <li key={item.id} className="relative">
                <span
                  className="absolute -left-[26px] top-3.5 h-2.5 w-2.5 rounded-full ring-4 ring-white"
                  style={{ backgroundColor: categoryColor(item.type.code, item.type.color) }}
                />
                <button
                  type="button"
                  onClick={() => onSelect(item.id)}
                  className={cn(
                    "flex w-full flex-wrap items-center gap-x-4 gap-y-1 rounded-xl px-3 py-2.5 text-left transition hover:bg-soft",
                    selected === item.id && "bg-accent-50",
                  )}
                >
                  <span className="w-16 text-[13px] font-semibold tabular-nums text-ink">{formatClock(item.occurred_at)}</span>
                  <span className="min-w-44 flex-1">
                    <TypeChip name={item.type.name_uz} code={item.type.code} color={item.type.color} />
                  </span>
                  <span className="min-w-40 text-xs text-mute">
                    <span className="font-mono font-semibold text-ink/80">{item.camera.code}</span> · {item.location_name ?? item.camera.name}
                  </span>
                  <ConfidenceMeter value={item.ai_confidence} />
                  <ViolationStatusBadge status={item.status} />
                </button>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}
