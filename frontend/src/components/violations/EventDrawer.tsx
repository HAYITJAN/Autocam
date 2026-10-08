import { ArrowRight, Car, X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";

import { useViolation } from "@/api/queries";
import { ViolationActions } from "@/components/ViolationActions";
import { Field, PlateNumber, QueryView, TypeChip, VehicleStatusBadge, ViolationStatusBadge } from "@/components/ui";
import { formatClock, formatDate, formatNumber } from "@/lib/format";
import type { TrafficLightState, ViolationDetail } from "@/lib/types";

import { EvidenceGallery } from "./EvidenceGallery";
import { directionLabel } from "./filters";
import { ColorDot, ConfidenceMeter, vehicleName } from "./parts";

const LIGHT_LABELS: Record<TrafficLightState, string> = { RED: "Qizil", YELLOW: "Sariq", GREEN: "Yashil", UNKNOWN: "Noma’lum" };

function Section({ title, children }: { title: string | null; children: ReactNode }) {
  return (
    <section>
      {title && <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-mute">{title}</h3>}
      <dl className="divide-y divide-line">{children}</dl>
    </section>
  );
}

/** Refetches the event when signed media links expire (at most once per minute). */
export function useEvidenceRefresh(refetch: () => unknown) {
  const last = useRef(0);
  return () => {
    if (Date.now() - last.current < 60_000) return;
    last.current = Date.now();
    void refetch();
  };
}

export function EventFields({ v }: { v: ViolationDetail }) {
  return (
    <Section title="Qoidabuzarlik">
      <Field label="Turi">
        <TypeChip name={v.type.name_uz} code={v.type.code} color={v.type.color} />
      </Field>
      <Field label="Sana">{formatDate(v.occurred_at)}</Field>
      <Field label="Vaqt">{formatClock(v.occurred_at)}</Field>
      <Field label="Kamera">
        <span className="font-mono text-xs">{v.camera.code}</span> · {v.camera.name}
      </Field>
      <Field label="Manzil">{v.address ?? v.location?.name ?? "—"}</Field>
      <Field label="Tuman">{v.location?.district.name ?? v.district_name ?? "—"}</Field>
      <Field label="Yo‘nalish">{directionLabel(v.direction)}</Field>
      <Field label="AI aniqlik">
        <ConfidenceMeter value={v.ai_confidence} />
      </Field>
      {v.detected_speed !== null && (
        <Field label="Tezlik">
          {v.detected_speed.toFixed(0)} km/soat
          {v.speed_limit !== null && <span className="text-mute"> / {v.speed_limit} ruxsat</span>}
        </Field>
      )}
      {v.traffic_light_state && <Field label="Svetofor">{LIGHT_LABELS[v.traffic_light_state]}</Field>}
      {v.duplicate_count > 0 && <Field label="Qo‘shimcha signallar">{formatNumber(v.duplicate_count)} ta (birlashtirilgan)</Field>}
      <Field label="Status">
        <ViolationStatusBadge status={v.status} />
      </Field>
    </Section>
  );
}

export function VehicleFields({ v, title = "Avtomobil" }: { v: ViolationDetail; title?: string | null }) {
  const vehicle = v.vehicle;
  return (
    <Section title={title}>
      <Field label="Davlat raqami">
        <PlateNumber value={vehicle?.plate_display ?? v.plate_number} />
      </Field>
      <Field label="Model">{vehicle ? vehicleName(vehicle) : "—"}</Field>
      <Field label="Rangi">
        <span className="inline-flex items-center gap-2">
          <ColorDot color={vehicle?.color} />
          {vehicle?.color ?? "—"}
        </span>
      </Field>
      <Field label="Turi">{v.vehicle_type?.name_uz ?? "—"}</Field>
      {vehicle && (
        <>
          <Field label="Davlat">{vehicle.country}</Field>
          <Field label="Holati">
            <VehicleStatusBadge status={vehicle.status} />
          </Field>
          <Field label="Jami qoidabuzarliklari">
            <Link to={`/vehicles/${vehicle.id}`} className="underline decoration-ink/20 underline-offset-2 hover:decoration-ink">
              {formatNumber(vehicle.total_violations)} ta
            </Link>
          </Field>
        </>
      )}
    </Section>
  );
}

/** Right-side drawer with the essentials of one violation event. */
export function EventDrawer({ id, onClose }: { id: number; onClose: () => void }) {
  const query = useViolation(id);
  const refreshEvidence = useEvidenceRefresh(query.refetch);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !document.querySelector("[aria-modal='true']")) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end">
      <button type="button" className="absolute inset-0 bg-ink/25 backdrop-blur-[1px]" onClick={onClose} aria-label="Yopish" />
      <aside className="drawer-in relative flex h-full w-full max-w-[480px] flex-col bg-white shadow-2xl" aria-label="Qoidabuzarlik tafsiloti">
        <QueryView query={query}>
          {(v) => (
            <>
              <div className="flex items-start gap-3 border-b border-line px-5 py-4">
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-xs text-mute">#{v.code}</p>
                  <h2 className="mt-0.5 truncate text-lg font-semibold tracking-tight text-ink">{v.type.name_uz}</h2>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    <PlateNumber value={v.vehicle?.plate_display ?? v.plate_number} />
                    <ViolationStatusBadge status={v.status} />
                  </div>
                </div>
                <button type="button" onClick={onClose} className="icon-btn h-9 w-9" aria-label="Yopish">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
                <EvidenceGallery evidence={v.evidence} variant="compact" onExpired={refreshEvidence} />
                <EventFields v={v} />
                <VehicleFields v={v} />
                <ViolationActions violation={v} />
              </div>
              <div className="grid grid-cols-2 gap-2 border-t border-line px-5 py-3">
                {v.vehicle ? (
                  <Link to={`/vehicles/${v.vehicle.id}`} className="btn-secondary">
                    <Car className="h-4 w-4" /> Avtomobil tarixi
                  </Link>
                ) : (
                  <span />
                )}
                <Link to={`/violations/${v.id}`} className="btn-primary">
                  To‘liq sahifa <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </>
          )}
        </QueryView>
      </aside>
    </div>,
    document.body,
  );
}
