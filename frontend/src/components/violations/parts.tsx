import {
  ArrowLeftRight,
  Gauge,
  OctagonAlert,
  Smartphone,
  Split,
  SquareParking,
  TrafficCone,
  TriangleAlert,
  UserX,
  type LucideIcon,
} from "lucide-react";

import { cn, formatConfidence } from "@/lib/format";
import { categoryColor } from "@/lib/palette";
import type { VehicleRef } from "@/lib/types";

/** Icon names stored on violation types (lucide kebab-case). */
const TYPE_ICONS: Record<string, LucideIcon> = {
  "traffic-cone": TrafficCone,
  gauge: Gauge,
  "square-parking": SquareParking,
  "arrow-left-right": ArrowLeftRight,
  "octagon-alert": OctagonAlert,
  split: Split,
  "user-x": UserX,
  smartphone: Smartphone,
};

export function TypeIcon({ code, icon, color, className }: { code: string; icon: string | null | undefined; color: string | null; className?: string }) {
  const Icon = (icon && TYPE_ICONS[icon]) || TriangleAlert;
  const tint = categoryColor(code, color);
  return (
    <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-full", className)} style={{ backgroundColor: `${tint}1f`, color: tint }}>
      <Icon className="h-[17px] w-[17px]" />
    </span>
  );
}

/** Swatches for colour names produced by the recognition service; unknown names get a neutral grey. */
const VEHICLE_COLORS: Record<string, string> = {
  Oq: "#ecebe6",
  Qora: "#1f2023",
  Kumush: "#c3c6cb",
  Kulrang: "#7b8087",
  "Ko‘k": "#2f5fb3",
  Qizil: "#b8383a",
  Jigarrang: "#6b4a35",
  Sariq: "#e9c33f",
  Yashil: "#3f8f4a",
};

export function vehicleName(vehicle: Pick<VehicleRef, "brand" | "model"> | null | undefined): string {
  return [vehicle?.brand, vehicle?.model].filter(Boolean).join(" ") || "Noma’lum model";
}

export function ColorDot({ color, className }: { color: string | null | undefined; className?: string }) {
  if (!color) return null;
  return (
    <span
      title={color}
      className={cn("inline-block h-3 w-3 shrink-0 rounded-full ring-1 ring-ink/15", className)}
      style={{ backgroundColor: VEHICLE_COLORS[color] ?? "#9aa0a6" }}
    />
  );
}

export function VehicleLabel({ vehicle }: { vehicle: VehicleRef | null }) {
  if (!vehicle) return <span className="text-mute">—</span>;
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap text-[13px] text-ink">
      <ColorDot color={vehicle.color} />
      {vehicleName(vehicle)}
      {vehicle.color && <span className="text-mute">· {vehicle.color}</span>}
    </span>
  );
}

export function confidenceTone(value: number): string {
  if (value >= 0.9) return "text-accent-700";
  if (value >= 0.75) return "text-amber-600";
  return "text-rose-600";
}

export function ConfidenceMeter({ value }: { value: number }) {
  const bar = value >= 0.9 ? "bg-accent-500" : value >= 0.75 ? "bg-amber-400" : "bg-rose-500";
  return (
    <span className="inline-flex items-center gap-2">
      <span className="h-1.5 w-12 overflow-hidden rounded-full bg-soft">
        <span className={cn("block h-full rounded-full", bar)} style={{ width: `${Math.round(value * 100)}%` }} />
      </span>
      <span className={cn("w-9 text-right text-xs font-semibold tabular-nums", confidenceTone(value))}>{formatConfidence(value)}</span>
    </span>
  );
}
