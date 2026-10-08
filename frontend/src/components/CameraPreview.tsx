import { VideoOff } from "lucide-react";
import { useMemo, type ReactNode } from "react";

import { cn } from "@/lib/format";
import type { CameraStatus } from "@/lib/types";

// Decorative road scene shown until the AI service provides a real MJPEG/HLS stream.

const CAR_COLORS = ["#f8fafc", "#1e293b", "#94a3b8", "#b91c1c", "#1d4ed8", "#e2e8f0", "#475569", "#ca8a04"];
const LANES_TOP = [139, 153, 167, 181];
const LANES_BOTTOM = [30, 115, 205, 290];

function rng(seed: number) {
  let state = (seed * 2654435761) >>> 0 || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return ((state >>> 0) % 10_000) / 10_000;
  };
}

interface Car {
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
}

function buildScene(seed: number) {
  const random = rng(seed);
  const buildings = Array.from({ length: 14 }, (_, index) => ({
    x: index * 24 - 6 + random() * 8,
    w: 16 + random() * 14,
    h: 18 + random() * 42,
    shade: 0.35 + random() * 0.35,
  }));
  const cars: Car[] = [];
  const count = 5 + Math.floor(random() * 6);
  for (let index = 0; index < count; index += 1) {
    const lane = Math.floor(random() * 4);
    const depth = 0.08 + random() * 0.88;
    const top = LANES_TOP[lane] ?? 160;
    const bottom = LANES_BOTTOM[lane] ?? 160;
    const w = 5 + depth * 34;
    cars.push({
      x: top + (bottom - top) * depth - w / 2,
      y: 72 + depth * 100,
      w,
      h: w * 0.62,
      color: CAR_COLORS[Math.floor(random() * CAR_COLORS.length)] ?? "#e2e8f0",
    });
  }
  cars.sort((a, b) => a.y - b.y);
  return { buildings, cars, crosswalk: random() > 0.45 };
}

export function CameraPreview({
  seed,
  status,
  className,
  children,
}: {
  seed: number;
  status: CameraStatus;
  className?: string;
  children?: ReactNode;
}) {
  const scene = useMemo(() => buildScene(seed), [seed]);
  const offline = status === "OFFLINE";

  return (
    <div className={cn("relative aspect-video overflow-hidden bg-slate-900", className)}>
      {offline ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-gradient-to-br from-slate-800 to-slate-950 text-slate-300">
          <VideoOff className="h-7 w-7" />
          <span className="text-xs">Kamera aloqasi yo‘q</span>
        </div>
      ) : (
        <svg viewBox="0 0 320 180" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full" aria-hidden>
          <defs>
            <linearGradient id={`sky-${seed}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#a9c8e8" />
              <stop offset="1" stopColor="#e6eef6" />
            </linearGradient>
            <linearGradient id={`road-${seed}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#6b7280" />
              <stop offset="1" stopColor="#374151" />
            </linearGradient>
          </defs>
          <rect width="320" height="72" fill={`url(#sky-${seed})`} />
          {scene.buildings.map((building, index) => (
            <rect
              key={index}
              x={building.x}
              y={72 - building.h}
              width={building.w}
              height={building.h}
              fill="#64748b"
              opacity={building.shade}
            />
          ))}
          <rect y="70" width="320" height="110" fill="#8b9a7b" />
          <polygon points="0,180 0,120 128,72 192,72 320,120 320,180" fill="#a3a3a3" />
          <polygon points="12,180 132,72 188,72 308,180" fill={`url(#road-${seed})`} />
          {[0, 1, 2, 3, 4, 5, 6].map((index) => (
            <ellipse key={`tl-${index}`} cx={8 + index * 17} cy={100 - index * 4.5} rx={9 - index} ry={13 - index * 1.2} fill="#3f6f3a" opacity="0.9" />
          ))}
          {[0, 1, 2, 3, 4, 5, 6].map((index) => (
            <ellipse key={`tr-${index}`} cx={312 - index * 17} cy={100 - index * 4.5} rx={9 - index} ry={13 - index * 1.2} fill="#3f6f3a" opacity="0.9" />
          ))}
          <line x1="160" y1="72" x2="160" y2="180" stroke="#facc15" strokeWidth="1.6" />
          <line x1="146" y1="72" x2="72" y2="180" stroke="#f8fafc" strokeWidth="1.2" strokeDasharray="7 7" />
          <line x1="174" y1="72" x2="248" y2="180" stroke="#f8fafc" strokeWidth="1.2" strokeDasharray="7 7" />
          {scene.crosswalk &&
            Array.from({ length: 11 }, (_, index) => (
              <rect key={`cw-${index}`} x={34 + index * 23} y="160" width="12" height="16" fill="#f1f5f9" opacity="0.85" />
            ))}
          {scene.cars.map((car, index) => (
            <g key={`car-${index}`}>
              <rect x={car.x} y={car.y} width={car.w} height={car.h} rx={car.w * 0.18} fill={car.color} />
              <rect x={car.x + car.w * 0.14} y={car.y + car.h * 0.12} width={car.w * 0.72} height={car.h * 0.34} rx={car.w * 0.08} fill="#0f172a" opacity="0.65" />
              <rect x={car.x + car.w * 0.06} y={car.y + car.h * 0.72} width={car.w * 0.16} height={car.h * 0.12} fill="#fde68a" />
              <rect x={car.x + car.w * 0.78} y={car.y + car.h * 0.72} width={car.w * 0.16} height={car.h * 0.12} fill="#fde68a" />
            </g>
          ))}
        </svg>
      )}
      {children}
    </div>
  );
}
