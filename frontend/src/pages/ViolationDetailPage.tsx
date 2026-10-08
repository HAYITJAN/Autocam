import { ArrowLeft, ArrowRight, Car } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";

import { useVehicleViolations, useViolation, useViolationComment } from "@/api/queries";
import { ViolationActions, workflowActions } from "@/components/ViolationActions";
import { Card, CardHeader, Field, PageHeader, PlateNumber, QueryView, SeverityBadge, TypeChip, ViolationStatusBadge } from "@/components/ui";
import { useEvidenceRefresh, VehicleFields } from "@/components/violations/EventDrawer";
import { EvidenceGallery } from "@/components/violations/EvidenceGallery";
import { directionLabel } from "@/components/violations/filters";
import { ColorDot, ConfidenceMeter, TypeIcon, vehicleName } from "@/components/violations/parts";
import { cn, formatClock, formatDate, formatDateTime, formatNumber } from "@/lib/format";
import { t, tDynamic } from "@/lib/i18n";
import type { TrafficLightState, ViolationDetail } from "@/lib/types";

const LIGHT_LABELS: Record<TrafficLightState, string> = { RED: "Qizil", YELLOW: "Sariq", GREEN: "Yashil", UNKNOWN: "Noma’lum" };

function CommentBox({ id }: { id: number }) {
  const comment = useViolationComment(id);
  const [text, setText] = useState("");
  return (
    <form
      className="flex gap-2 border-t border-line p-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (text.trim()) comment.mutate(text.trim(), { onSuccess: () => setText("") });
      }}
    >
      <input className="input" placeholder={t("violation.addComment")} value={text} onChange={(event) => setText(event.target.value)} />
      <button type="submit" className="btn-secondary" disabled={comment.isPending || !text.trim()}>
        {t("common.save")}
      </button>
    </form>
  );
}

function Fact({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0 bg-white px-5 py-4", className)}>
      <dt className="text-[11px] font-semibold uppercase tracking-wider text-mute">{label}</dt>
      <dd className="mt-1.5 text-[14px] font-medium text-ink">{children}</dd>
    </div>
  );
}

/** The eight facts an operator needs first, in a fixed order. */
function KeyFacts({ v }: { v: ViolationDetail }) {
  const vehicle = v.vehicle;
  return (
    <Card className="overflow-hidden">
      <dl className="grid gap-px bg-line sm:grid-cols-2 xl:grid-cols-4">
        <Fact label="Qoidabuzarlik">
          <TypeChip name={v.type.name_uz} code={v.type.code} color={v.type.color} />
        </Fact>
        <Fact label="Avtomobil">
          <div className="flex flex-wrap items-center gap-2">
            <PlateNumber value={vehicle?.plate_display ?? v.plate_number} />
            <span className="inline-flex items-center gap-1.5 text-[13px]">
              <ColorDot color={vehicle?.color} />
              {vehicle ? vehicleName(vehicle) : "—"}
              {vehicle?.color && <span className="text-mute">· {vehicle.color}</span>}
            </span>
          </div>
        </Fact>
        <Fact label="Vaqt">
          {formatDate(v.occurred_at)} <span className="tabular-nums text-ink/70">{formatClock(v.occurred_at)}</span>
        </Fact>
        <Fact label="Kamera">
          <Link to={`/cameras/${v.camera.id}`} className="hover:underline">
            <span className="font-mono text-[13px]">{v.camera.code}</span>
          </Link>
          <span className="block truncate text-xs font-normal text-mute">{v.camera.name}</span>
        </Fact>
        <Fact label="Manzil">
          <span className="line-clamp-2">{v.address ?? v.location?.name ?? "—"}</span>
          {v.location && <span className="block text-xs font-normal text-mute">{v.location.district.name}</span>}
        </Fact>
        <Fact label="Yo‘nalish">{directionLabel(v.direction)}</Fact>
        <Fact label="AI aniqlik">
          <ConfidenceMeter value={v.ai_confidence} />
        </Fact>
        <Fact label="Status">
          <ViolationStatusBadge status={v.status} />
        </Fact>
      </dl>
    </Card>
  );
}

function VehicleHistory({ vehicleId, currentId }: { vehicleId: number; currentId: number }) {
  const query = useVehicleViolations(vehicleId, 1, 6);
  return (
    <QueryView query={query}>
      {(data) => (
        <ul className="divide-y divide-line">
          {data.items.map((item) => (
            <li key={item.id}>
              <Link
                to={`/violations/${item.id}`}
                className={cn("flex items-center gap-3 px-5 py-2.5 text-[13px] transition hover:bg-soft", item.id === currentId && "bg-accent-50")}
              >
                <span className="flex-1">
                  <TypeChip name={item.type.name_uz} code={item.type.code} color={item.type.color} />
                </span>
                <span className="text-xs text-mute">{formatDateTime(item.occurred_at)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </QueryView>
  );
}

export default function ViolationDetailPage() {
  const id = Number(useParams().id);
  const query = useViolation(id);
  const refreshEvidence = useEvidenceRefresh(query.refetch);

  return (
    <QueryView query={query}>
      {(v) => (
        <div className="space-y-5">
          <PageHeader
            crumbs={[
              { label: "Bosh sahifa", to: "/" },
              { label: "Qoidabuzarliklar", to: "/violations" },
              { label: v.type.name_uz, to: `/violations/types/${v.type.code}` },
              { label: v.code },
            ]}
            title={
              <span className="inline-flex items-center gap-3">
                <TypeIcon code={v.type.code} icon={v.type.icon} color={v.type.color} className="h-11 w-11" />
                {v.type.name_uz}
              </span>
            }
            subtitle={`#${v.code} · ${formatDateTime(v.occurred_at)} · ${v.camera.code}`}
            actions={
              <>
                <SeverityBadge severity={v.type.severity} />
                <ViolationStatusBadge status={v.status} />
                <Link to="/violations" className="btn-secondary">
                  <ArrowLeft className="h-4 w-4" /> Ro‘yxatga qaytish
                </Link>
              </>
            }
          />

          <KeyFacts v={v} />

          <div className="grid gap-5 xl:grid-cols-3">
            <div className="space-y-5 xl:col-span-2">
              <Card>
                <CardHeader title="Dalillar" subtitle="Kadrni bosing — kattalashtirish va zoom" />
                <div className="p-5 pt-2">
                  <EvidenceGallery evidence={v.evidence} onExpired={refreshEvidence} />
                </div>
              </Card>

              <Card>
                <CardHeader title={t("violation.timeline")} />
                <ol className="space-y-4 p-5">
                  {v.events.map((event) => (
                    <li key={event.id} className="flex gap-3">
                      <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-accent-500" />
                      <div className="text-sm">
                        <div className="font-medium text-ink">
                          {tDynamic("violation.event", event.event_type)}
                          {event.to_status && (
                            <>
                              {" → "}
                              <ViolationStatusBadge status={event.to_status} />
                            </>
                          )}
                        </div>
                        <div className="text-xs text-mute">
                          {formatDateTime(event.created_at)} · {event.actor?.full_name ?? "AI tizimi"}
                        </div>
                        {event.comment && <p className="mt-1 rounded bg-soft px-2 py-1 text-ink/80">{event.comment}</p>}
                      </div>
                    </li>
                  ))}
                </ol>
                <CommentBox id={v.id} />
              </Card>
            </div>

            <div className="space-y-5">
              {workflowActions(v).length > 0 && (
                <Card>
                  <CardHeader title="Amallar" />
                  <ViolationActions violation={v} className="p-4" />
                </Card>
              )}
              <Card>
                <CardHeader title="Avtomobil" to={v.vehicle ? `/vehicles/${v.vehicle.id}` : undefined} />
                <div className="px-5 pb-3">
                  <VehicleFields v={v} title={null} />
                </div>
              </Card>
              {v.vehicle && v.vehicle.total_violations > 1 && (
                <Card>
                  <CardHeader title="Shu avtomobil qoidabuzarliklari" subtitle={`Jami ${formatNumber(v.vehicle.total_violations)} ta`} />
                  <VehicleHistory vehicleId={v.vehicle.id} currentId={v.id} />
                  <div className="border-t border-line p-3">
                    <Link to={`/vehicles/${v.vehicle.id}`} className="btn-secondary w-full">
                      <Car className="h-4 w-4" /> To‘liq tarix <ArrowRight className="h-4 w-4" />
                    </Link>
                  </div>
                </Card>
              )}
              <Card>
                <CardHeader title="Texnik ma’lumotlar" />
                <dl className="divide-y divide-line px-5 pb-3">
                  {v.detected_speed !== null && (
                    <Field label={t("violation.speed")}>
                      {v.detected_speed.toFixed(0)} km/soat (chegara {v.speed_limit ?? "—"})
                    </Field>
                  )}
                  {v.traffic_light_state && <Field label={t("violation.light")}>{LIGHT_LABELS[v.traffic_light_state]}</Field>}
                  {v.track_id && <Field label="Trek ID">{v.track_id}</Field>}
                  <Field label="Qo‘shimcha signallar">{v.duplicate_count > 0 ? `${formatNumber(v.duplicate_count)} ta birlashtirilgan` : "yo‘q"}</Field>
                  <Field label="Qayd etilgan">{formatDateTime(v.created_at)}</Field>
                  <Field label={t("violation.assigned")}>{v.assigned_to?.full_name ?? "—"}</Field>
                  {v.reviewed_by && (
                    <Field label="Ko‘rib chiqdi">
                      {v.reviewed_by.full_name}, {formatDateTime(v.reviewed_at)}
                    </Field>
                  )}
                  {v.rejection_reason && <Field label={t("violation.rejectReason")}>{v.rejection_reason}</Field>}
                </dl>
              </Card>
            </div>
          </div>
        </div>
      )}
    </QueryView>
  );
}
