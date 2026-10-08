import { Check, ChevronDown, Search, X, type LucideIcon } from "lucide-react";
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";

import { cn } from "@/lib/format";

export interface SelectOption {
  value: string;
  label: string;
  /** Secondary text shown on the right of the option (code, count…). */
  hint?: string;
  /** Colour dot before the label (types, statuses). */
  color?: string;
}

interface Position {
  left: number;
  width: number;
  top?: number;
  bottom?: number;
  maxHeight: number;
}

const SEARCH_THRESHOLD = 8;
const MENU_MIN_WIDTH = 248;
const GAP = 6;

/**
 * Styled replacement for the native `<select>`. With a `placeholder` the empty
 * value is a selectable "all" option and a clear button appears once something is chosen.
 * The menu is portalled, so it is never clipped by cards with `overflow-hidden`.
 */
export function Select({
  value,
  onChange,
  options,
  placeholder,
  icon: Icon,
  size = "md",
  searchable,
  clearable = true,
  className,
  menuClassName,
  disabled,
  "aria-label": ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  icon?: LucideIcon;
  size?: "sm" | "md";
  searchable?: boolean;
  clearable?: boolean;
  className?: string;
  menuClassName?: string;
  disabled?: boolean;
  "aria-label"?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [position, setPosition] = useState<Position | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const listId = useId();

  const items = useMemo<SelectOption[]>(() => (placeholder !== undefined ? [{ value: "", label: placeholder }, ...options] : options), [options, placeholder]);
  const withSearch = searchable ?? options.length > SEARCH_THRESHOLD;
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return needle ? items.filter((item) => item.label.toLocaleLowerCase().includes(needle) || item.hint?.toLocaleLowerCase().includes(needle)) : items;
  }, [items, query]);
  const selected = items.find((item) => item.value === value);
  const isSet = value !== "" && selected !== undefined;

  const place = useCallback(() => {
    const rect = trigger.current?.getBoundingClientRect();
    if (!rect) return;
    const below = window.innerHeight - rect.bottom - GAP - 12;
    const above = rect.top - GAP - 12;
    const flip = below < 220 && above > below;
    const width = Math.max(rect.width, size === "sm" ? 96 : MENU_MIN_WIDTH);
    const left = Math.min(rect.left, window.innerWidth - width - 8);
    setPosition(
      flip
        ? { left, width, bottom: window.innerHeight - rect.top + GAP, maxHeight: Math.min(340, above) }
        : { left, width, top: rect.bottom + GAP, maxHeight: Math.min(340, below) },
    );
  }, [size]);

  const close = useCallback((focusTrigger = true) => {
    setOpen(false);
    setQuery("");
    if (focusTrigger) trigger.current?.focus();
  }, []);

  const openMenu = () => {
    if (disabled) return;
    place();
    setActive(Math.max(0, items.findIndex((item) => item.value === value)));
    setOpen(true);
  };

  const choose = (option: SelectOption | undefined) => {
    if (!option) return;
    if (option.value !== value) onChange(option.value);
    close();
  };

  useLayoutEffect(() => {
    if (!open) return;
    if (withSearch) search.current?.focus();
    else menu.current?.focus();
  }, [open, withSearch]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!menu.current?.contains(target) && !trigger.current?.contains(target)) close(false);
    };
    const onScroll = (event: Event) => {
      if (!menu.current?.contains(event.target as Node)) place();
    };
    document.addEventListener("pointerdown", onPointer);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open, close, place]);

  useEffect(() => {
    if (!open) return;
    menu.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  useEffect(() => setActive(0), [query]);

  const onMenuKey = (event: KeyboardEvent) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((index) => Math.min(filtered.length - 1, index + 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((index) => Math.max(0, index - 1));
    } else if (event.key === "Home") {
      event.preventDefault();
      setActive(0);
    } else if (event.key === "End") {
      event.preventDefault();
      setActive(filtered.length - 1);
    } else if (event.key === "Enter") {
      event.preventDefault();
      choose(filtered[active]);
    } else if (event.key === "Escape") {
      event.preventDefault();
      close();
    } else if (event.key === "Tab") {
      close(false);
    }
  };

  const onTriggerKey = (event: KeyboardEvent) => {
    if (["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) {
      event.preventDefault();
      openMenu();
    }
  };

  const small = size === "sm";

  return (
    <>
      <div className={cn("relative", className)}>
        <button
          ref={trigger}
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-haspopup="listbox"
          aria-label={ariaLabel ?? placeholder}
          disabled={disabled}
          onClick={() => (open ? close() : openMenu())}
          onKeyDown={onTriggerKey}
          className={cn(
            "flex w-full items-center gap-2 rounded-full border bg-white text-left outline-none transition",
            small ? "h-8 px-3 text-xs" : "h-10 px-4 text-[13px]",
            open ? "border-ink ring-4 ring-ink/5" : isSet ? "border-ink/40" : "border-line hover:border-ink/25",
            disabled && "cursor-not-allowed opacity-50",
          )}
        >
          {Icon && <Icon className={cn("shrink-0 text-mute", small ? "h-3.5 w-3.5" : "h-4 w-4")} />}
          {selected?.color && <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: selected.color }} />}
          <span className={cn("min-w-0 flex-1 truncate", isSet || placeholder === undefined ? "font-medium text-ink" : "text-ink/60")}>
            {selected?.label ?? placeholder ?? "—"}
          </span>
          {clearable && placeholder !== undefined && isSet ? (
            <span
              role="button"
              tabIndex={-1}
              aria-label="Tozalash"
              onClick={(event) => {
                event.stopPropagation();
                onChange("");
              }}
              className="-mr-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-mute hover:bg-soft hover:text-ink"
            >
              <X className="h-3.5 w-3.5" />
            </span>
          ) : (
            <ChevronDown className={cn("shrink-0 text-mute transition-transform", small ? "h-3.5 w-3.5" : "h-4 w-4", open && "rotate-180")} />
          )}
        </button>
      </div>

      {open &&
        position &&
        createPortal(
          <div
            ref={menu}
            tabIndex={-1}
            onKeyDown={onMenuKey}
            className={cn("dropdown-in fixed z-[70] flex flex-col overflow-hidden rounded-2xl border border-line bg-white p-1.5 shadow-[0_16px_40px_-12px_rgba(18,18,18,0.25)] outline-none", menuClassName)}
            style={{ left: position.left, width: position.width, top: position.top, bottom: position.bottom, maxHeight: position.maxHeight }}
          >
            {withSearch && (
              <div className="relative mb-1.5 shrink-0">
                <Search className="pointer-events-none absolute left-3 top-2.5 h-3.5 w-3.5 text-mute" />
                <input
                  ref={search}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Qidirish…"
                  className="h-9 w-full rounded-xl bg-soft pl-8 pr-3 text-[13px] text-ink outline-none placeholder:text-mute focus:ring-2 focus:ring-ink/10"
                />
              </div>
            )}
            <ul id={listId} role="listbox" className="min-h-0 flex-1 overflow-y-auto">
              {filtered.length === 0 && <li className="px-3 py-6 text-center text-[13px] text-mute">Hech narsa topilmadi</li>}
              {filtered.map((item, index) => {
                const isSelected = item.value === value;
                return (
                  <li
                    key={item.value || "__all"}
                    role="option"
                    aria-selected={isSelected}
                    data-index={index}
                    onPointerEnter={() => setActive(index)}
                    onClick={() => choose(item)}
                    className={cn(
                      "flex cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2 text-[13px] transition-colors",
                      index === active && "bg-soft",
                      isSelected ? "font-semibold text-ink" : "text-ink/80",
                      item.value === "" && placeholder !== undefined && "text-mute",
                    )}
                  >
                    {item.color && <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />}
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    {item.hint && <span className="shrink-0 text-[11px] text-mute">{item.hint}</span>}
                    <Check className={cn("h-4 w-4 shrink-0 text-ink", !isSelected && "invisible")} />
                  </li>
                );
              })}
            </ul>
          </div>,
          document.body,
        )}
    </>
  );
}
