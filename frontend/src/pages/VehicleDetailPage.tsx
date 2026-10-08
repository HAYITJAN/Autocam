import { ArrowLeft } from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";

import { useVehicle, useVehicleStatus, useVehicleViolations } from "@/api/queries";
import { DonutChart } from "@/components/charts";
import {
  Card,
  CardHeader,
  Field,
  PageHeader,
  Pagination,
  PlateNumber,
  QueryView,
  TypeChip,
  VehicleStatusBadge,
  ViolationStatusBadge,
} from "@/components/ui";
import { ApiError } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { t } from "@/lib/i18n";
import type { VehicleDetail, VehicleStatus } from "@/lib/types";
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
  const vehicle = useVehicle(id);
  const violations = useVehicleViolations(id, page);
  const canEdit = useHasPermission("violations.review");

  return (
    <QueryView query={vehicle}>
      {(v) => (
        <div className="space-y-5">
          <PageHeader
            crumbs={[{ label: "Bosh sahifa", to: "/" }, { label: t("nav.vehicles"), to: "/vehicles" }, { label: v.plate_display }]}
            title={<PlateNumber value={v.plate_display} />}
            subtitle={[v.brand, v.model, v.color].filter(Boolean).join(" · ") || undefined}
            actions={
              <>
                <VehicleStatusBadge status={v.status} />
                <Link to="/vehicles" className="btn-secondary">
                  <ArrowLeft className="h-4 w-4" /> Avtomobillar
                </Link>
              </>
            }
          />

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
            <CardHeader title={t("nav.violations")} />
            <QueryView query={violations} isEmpty={(data) => data.items.length === 0}>
              {(data) => (
                <>
                  <ul className="divide-y divide-line">
                    {data.items.map((item) => (
                      <li key={item.id}>
                        <Link to={`/violations/${item.id}`} className="flex items-center gap-4 px-5 py-3 hover:bg-soft">
                          <span className="w-40 text-sm text-ink/70">{formatDateTime(item.occurred_at)}</span>
                          <span className="flex-1">
                            <TypeChip name={item.type.name_uz} code={item.type.code} color={item.type.color} />
                          </span>
                          <span className="font-mono text-xs text-mute">{item.camera.code}</span>
                          <ViolationStatusBadge status={item.status} />
                        </Link>
                      </li>
                    ))}
                  </ul>
                  <Pagination meta={data.meta} onPage={setPage} />
                </>
              )}
            </QueryView>
          </Card>
        </div>
      )}
    </QueryView>
  );
}
