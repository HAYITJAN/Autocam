import { ChevronLeft, ChevronRight, ExternalLink, ImageOff, Maximize2, Minus, Plus, RotateCcw, Video, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";

import { mediaUrl } from "@/lib/api";
import { cn, formatClock } from "@/lib/format";
import type { EvidenceKind, EvidenceOut } from "@/lib/types";

import { EVIDENCE_LABELS } from "./filters";

/** Slots shown even when the item is missing, so the absence of evidence is explicit. */
const SLOTS: EvidenceKind[] = ["FULL_FRAME", "VEHICLE", "PLATE", "CONTEXT", "VIDEO"];
const MIN_ZOOM = 1;
const MAX_ZOOM = 6;

const isVideo = (item: EvidenceOut) => item.kind === "VIDEO" || item.mime_type.startsWith("video/");

function Thumb({ item, onOpen, onExpired, className }: { item: EvidenceOut; onOpen: () => void; onExpired?: () => void; className?: string }) {
  return (
    <button type="button" onClick={onOpen} className={cn("group relative overflow-hidden rounded-xl bg-ink/90 ring-1 ring-line", className)}>
      {isVideo(item) ? (
        <span className="flex h-full w-full items-center justify-center text-white/80">
          <Video className="h-6 w-6" />
        </span>
      ) : (
        <img
          src={mediaUrl(item.thumbnail_url)}
          alt={EVIDENCE_LABELS[item.kind]}
          loading="lazy"
          onError={onExpired}
          className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
        />
      )}
      <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent px-2 pb-1.5 pt-5 text-left text-[11px] font-medium text-white">
        {EVIDENCE_LABELS[item.kind]}
      </span>
      <span className="absolute right-1.5 top-1.5 rounded-full bg-black/50 p-1 text-white opacity-0 transition group-hover:opacity-100">
        <Maximize2 className="h-3 w-3" />
      </span>
    </button>
  );
}

function MissingSlot({ kind, className }: { kind: EvidenceKind; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-line bg-soft text-center text-[11px] text-mute", className)}>
      {kind === "VIDEO" ? <Video className="h-4 w-4" /> : <ImageOff className="h-4 w-4" />}
      <span>{EVIDENCE_LABELS[kind]}</span>
      <span className="text-[10px]">mavjud emas</span>
    </div>
  );
}

/**
 * Evidence of one violation event. `full` shows a large primary frame with the
 * remaining slots below; `compact` is a 2-column grid for drawers.
 */
export function EvidenceGallery({
  evidence,
  variant = "full",
  onExpired,
}: {
  evidence: EvidenceOut[];
  variant?: "full" | "compact";
  /** Signed URLs are short-lived; called when an image fails so the caller can refetch. */
  onExpired?: () => void;
}) {
  const [open, setOpen] = useState<number | null>(null);
  const byKind = new Map(evidence.map((item) => [item.kind, item]));
  const primary = byKind.get("FULL_FRAME") ?? evidence.find((item) => !isVideo(item));
  const openItem = (item: EvidenceOut) => setOpen(evidence.indexOf(item));

  if (evidence.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-line bg-soft px-4 py-8 text-center text-[13px] text-mute">
        <ImageOff className="h-6 w-6" />
        Bu hodisa uchun dalil fayllari hali yuklanmagan
      </div>
    );
  }

  return (
    <>
      {variant === "full" && primary && (
        <figure className="mb-3">
          <button type="button" onClick={() => openItem(primary)} className="group relative block w-full overflow-hidden rounded-2xl bg-ink">
            <img
              src={mediaUrl(primary.file_url)}
              alt={EVIDENCE_LABELS[primary.kind]}
              onError={onExpired}
              className="aspect-video w-full object-contain transition duration-300 group-hover:scale-[1.01]"
            />
            <span className="absolute left-1/2 top-1/2 inline-flex -translate-x-1/2 -translate-y-1/2 items-center gap-1.5 rounded-full bg-white/90 px-3.5 py-2 text-xs font-semibold text-ink opacity-0 shadow transition group-hover:opacity-100">
              <Maximize2 className="h-3.5 w-3.5" /> Kattalashtirish
            </span>
          </button>
          <figcaption className="mt-2 flex flex-wrap gap-x-3 text-xs text-mute">
            <span className="font-medium text-ink">{EVIDENCE_LABELS[primary.kind]}</span>
            <span>{formatClock(primary.captured_at)}</span>
            {primary.width && primary.height && (
              <span>
                {primary.width}×{primary.height}
              </span>
            )}
          </figcaption>
        </figure>
      )}
      <div className={cn("grid gap-2", variant === "full" ? "grid-cols-3 sm:grid-cols-5" : "grid-cols-2")}>
        {SLOTS.filter((kind) => variant === "full" || byKind.has(kind) || kind !== "VIDEO").map((kind) => {
          const item = byKind.get(kind);
          const size = variant === "full" ? "aspect-[4/3]" : "aspect-video";
          return item ? (
            <Thumb key={kind} item={item} onOpen={() => openItem(item)} onExpired={onExpired} className={size} />
          ) : (
            <MissingSlot key={kind} kind={kind} className={size} />
          );
        })}
      </div>
      {open !== null && <Lightbox items={evidence} index={open} onIndex={setOpen} onClose={() => setOpen(null)} />}
    </>
  );
}

/** Fullscreen viewer: wheel / buttons zoom, drag to pan, double-click toggles 2×, arrows switch items. */
export function Lightbox({ items, index, onIndex, onClose }: { items: EvidenceOut[]; index: number; onIndex: (index: number) => void; onClose: () => void }) {
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const item = items[index];

  const resetView = useCallback(() => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  }, []);
  const zoomBy = useCallback((factor: number) => {
    setZoom((current) => {
      const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, current * factor));
      if (next === MIN_ZOOM) setOffset({ x: 0, y: 0 });
      return next;
    });
  }, []);
  const go = useCallback(
    (step: number) => {
      onIndex((index + step + items.length) % items.length);
      resetView();
    },
    [index, items.length, onIndex, resetView],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      else if (event.key === "ArrowRight") go(1);
      else if (event.key === "ArrowLeft") go(-1);
      else if (event.key === "+" || event.key === "=") zoomBy(1.25);
      else if (event.key === "-") zoomBy(0.8);
      else if (event.key === "0") resetView();
    };
    window.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [go, onClose, resetView, zoomBy]);

  if (!item) return null;

  const onPointerDown = (event: ReactPointerEvent) => {
    if (zoom <= 1) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, y: event.clientY, ox: offset.x, oy: offset.y };
  };
  const onPointerMove = (event: ReactPointerEvent) => {
    if (!drag.current) return;
    setOffset({ x: drag.current.ox + event.clientX - drag.current.x, y: drag.current.oy + event.clientY - drag.current.y });
  };
  const onPointerUp = () => {
    drag.current = null;
  };

  const control = "flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20 disabled:opacity-30";

  return createPortal(
    <div className="fixed inset-0 z-[60] flex flex-col bg-black/90 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={EVIDENCE_LABELS[item.kind]}>
      <div className="flex items-center gap-3 px-5 py-3 text-white">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{EVIDENCE_LABELS[item.kind]}</p>
          <p className="text-xs text-white/60">
            {index + 1} / {items.length} · {formatClock(item.captured_at)}
            {item.width && item.height ? ` · ${item.width}×${item.height}` : ""}
          </p>
        </div>
        {!isVideo(item) && (
          <>
            <button type="button" className={control} onClick={() => zoomBy(0.8)} disabled={zoom <= MIN_ZOOM} aria-label="Kichiklashtirish">
              <Minus className="h-4 w-4" />
            </button>
            <span className="w-12 text-center text-xs tabular-nums text-white/80">{Math.round(zoom * 100)}%</span>
            <button type="button" className={control} onClick={() => zoomBy(1.25)} disabled={zoom >= MAX_ZOOM} aria-label="Kattalashtirish">
              <Plus className="h-4 w-4" />
            </button>
            <button type="button" className={control} onClick={resetView} aria-label="Asl o‘lcham">
              <RotateCcw className="h-4 w-4" />
            </button>
          </>
        )}
        <a href={mediaUrl(item.file_url)} target="_blank" rel="noreferrer" className={control} aria-label="Yangi oynada ochish">
          <ExternalLink className="h-4 w-4" />
        </a>
        <button type="button" className={control} onClick={onClose} aria-label="Yopish">
          <X className="h-5 w-5" />
        </button>
      </div>

      <div
        className={cn("relative flex flex-1 items-center justify-center overflow-hidden", zoom > 1 ? "cursor-grab active:cursor-grabbing" : "cursor-zoom-in")}
        onWheel={(event) => zoomBy(event.deltaY < 0 ? 1.15 : 0.87)}
        onDoubleClick={() => (zoom > 1 ? resetView() : setZoom(2))}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onClick={(event) => event.target === event.currentTarget && zoom === 1 && onClose()}
      >
        {isVideo(item) ? (
          <video src={mediaUrl(item.file_url)} controls autoPlay className="max-h-full max-w-full" />
        ) : (
          <img
            src={mediaUrl(item.file_url)}
            alt={EVIDENCE_LABELS[item.kind]}
            draggable={false}
            className="max-h-[calc(100vh-11rem)] max-w-[92vw] select-none object-contain transition-transform duration-75"
            style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})` }}
          />
        )}
        {items.length > 1 && (
          <>
            <button type="button" className={cn(control, "absolute left-4 top-1/2 h-11 w-11 -translate-y-1/2")} onClick={() => go(-1)} aria-label="Oldingi">
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button type="button" className={cn(control, "absolute right-4 top-1/2 h-11 w-11 -translate-y-1/2")} onClick={() => go(1)} aria-label="Keyingi">
              <ChevronRight className="h-5 w-5" />
            </button>
          </>
        )}
      </div>

      <div className="flex justify-center gap-2 overflow-x-auto px-5 py-3">
        {items.map((entry, position) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => {
              onIndex(position);
              resetView();
            }}
            className={cn("h-14 w-20 shrink-0 overflow-hidden rounded-lg ring-2 transition", position === index ? "ring-accent-400" : "opacity-60 ring-transparent hover:opacity-100")}
          >
            {isVideo(entry) ? (
              <span className="flex h-full items-center justify-center bg-white/10 text-white">
                <Video className="h-4 w-4" />
              </span>
            ) : (
              <img src={mediaUrl(entry.thumbnail_url)} alt={EVIDENCE_LABELS[entry.kind]} className="h-full w-full object-cover" />
            )}
          </button>
        ))}
      </div>
    </div>,
    document.body,
  );
}
