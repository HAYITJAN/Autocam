import { ArrowLeft, ImageOff } from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";

import { useViolation, useViolationComment } from "@/api/queries";
import { ViolationActions } from "@/components/ViolationActions";
import {
  Card,
  CardHeader,
  Field,
  PlateNumber,
  QueryView,
  SeverityBadge,
  TypeChip,
  VehicleStatusBadge,
  ViolationStatusBadge,
} from "@/components/ui";
import { formatConfidence, formatDateTime } from "@/lib/format";
import { t, tDynamic } from "@/lib/i18n";

function CommentBox({ id }: { id: number }) {
  const comment = useViolationComment(id);
  const [text, setText] = useState("");
  return (
    <form
      className="flex gap-2 border-t border-slate-100 p-4"
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

export default function ViolationDetailPage() {
  const id = Number(useParams().id);
  const query = useViolation(id);

  return (
    <QueryView query={query}>
      {(v) => (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-3">
            <Link to="/violations" className="btn-secondary px-2.5">
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div className="flex-1">
              <h1 className="font-mono text-xl font-semibold text-slate-900">{v.code}</h1>
              <p className="text-sm text-slate-500">{formatDateTime(v.occurred_at)}</p>
            </div>
            <ViolationStatusBadge status={v.status} />
          </div>

          <div className="grid gap-5 xl:grid-cols-3">
            <div className="space-y-5 xl:col-span-2">
              <Card>
                <CardHeader title={t("violation.evidence")} />
                <div className="p-4">
                  <div className="flex aspect-video flex-col items-center justify-center gap-2 rounded-lg bg-slate-900 text-sm text-slate-400">
                    <ImageOff className="h-10 w-10 text-slate-600" />
                    {v.evidence.length > 0 ? `${v.evidence.length} ta fayl` : t("violation.noEvidence")}
                  </div>
                </div>
              </Card>

              <Card>
                <CardHeader title={t("violation.timeline")} />
                <ol className="space-y-4 p-5">
                  {v.events.map((event) => (
                    <li key={event.id} className="flex gap-3">
                      <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-brand-500" />
                      <div className="text-sm">
                        <div className="font-medium text-slate-800">
                          {tDynamic("violation.event", event.event_type)}
                          {event.to_status && (
                            <>
                              {" → "}
                              <ViolationStatusBadge status={event.to_status} />
                            </>
                          )}
                        </div>
                        <div className="text-xs text-slate-500">
                          {formatDateTime(event.created_at)} · {event.actor?.full_name ?? "AI tizimi"}
                        </div>
                        {event.comment && <p className="mt-1 rounded bg-slate-50 px-2 py-1 text-slate-700">{event.comment}</p>}
                      </div>
                    </li>
                  ))}
                </ol>
                <CommentBox id={v.id} />
              </Card>
            </div>

            <div className="space-y-5">
              {v.allowed_actions.length > 0 && (
                <Card>
                  <CardHeader title="Amallar" />
                  <ViolationActions violation={v} className="p-4" />
                </Card>
              )}
              <Card>
                <CardHeader title={t("violation.details")} />
                <dl className="divide-y divide-slate-100 px-5 pb-3">
                  <Field label={t("violation.type")}>
                    <TypeChip name={v.type.name_uz} color={v.type.color} />
                  </Field>
                  <Field label="Daraja">
                    <SeverityBadge severity={v.type.severity} />
                  </Field>
                  <Field label={t("violation.plate")}>
                    <PlateNumber value={v.plate_number} />
                  </Field>
                  <Field label={t("violation.confidence")}>{formatConfidence(v.ai_confidence)}</Field>
                  {v.detected_speed !== null && (
                    <Field label={t("violation.speed")}>
                      {v.detected_speed.toFixed(0)} km/soat (chegara {v.speed_limit ?? "—"})
                    </Field>
                  )}
                  {v.traffic_light_state && <Field label={t("violation.light")}>{v.traffic_light_state}</Field>}
                  {v.direction && <Field label={t("violation.direction")}>{v.direction}</Field>}
                  <Field label={t("violation.camera")}>
                    <Link to={`/cameras/${v.camera.id}`} className="text-brand-700 hover:underline">
                      {v.camera.code}
                    </Link>
                  </Field>
                  <Field label={t("camera.location")}>
                    {v.location ? `${v.location.name}, ${v.location.district.name}` : "—"}
                  </Field>
                  <Field label={t("violation.assigned")}>{v.assigned_to?.full_name ?? "—"}</Field>
                  {v.reviewed_by && (
                    <Field label="Ko‘rib chiqdi">
                      {v.reviewed_by.full_name}, {formatDateTime(v.reviewed_at)}
                    </Field>
                  )}
                  {v.rejection_reason && <Field label={t("violation.rejectReason")}>{v.rejection_reason}</Field>}
                </dl>
              </Card>
              {v.vehicle && (
                <Card>
                  <CardHeader title={t("nav.vehicles")} />
                  <dl className="divide-y divide-slate-100 px-5 pb-3">
                    <Field label={t("vehicle.plate")}>
                      <Link to={`/vehicles/${v.vehicle.id}`}>
                        <PlateNumber value={v.vehicle.plate_display} />
                      </Link>
                    </Field>
                    <Field label={t("vehicle.brandModel")}>
                      {[v.vehicle.brand, v.vehicle.model].filter(Boolean).join(" ") || "—"}
                    </Field>
                    <Field label={t("vehicle.color")}>{v.vehicle.color ?? "—"}</Field>
                    <Field label={t("vehicle.violations")}>{v.vehicle.total_violations}</Field>
                    <Field label={t("violation.status")}>
                      <VehicleStatusBadge status={v.vehicle.status} />
                    </Field>
                  </dl>
                </Card>
              )}
            </div>
          </div>
        </div>
      )}
    </QueryView>
  );
}
