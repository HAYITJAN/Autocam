import { clsx, type ClassValue } from "clsx";
import { formatDistanceToNow } from "date-fns";
import { uz } from "date-fns/locale/uz";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export const DISPLAY_TZ = import.meta.env.VITE_DISPLAY_TIMEZONE || "Asia/Tashkent";

const numberFormat = new Intl.NumberFormat("uz-UZ");
const dateTimeFormat = new Intl.DateTimeFormat("ru-RU", {
  timeZone: DISPLAY_TZ,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});
const dateFormat = new Intl.DateTimeFormat("ru-RU", {
  timeZone: DISPLAY_TZ,
  day: "2-digit",
  month: "2-digit",
});
const timeFormat = new Intl.DateTimeFormat("ru-RU", {
  timeZone: DISPLAY_TZ,
  hour: "2-digit",
  minute: "2-digit",
});

export function formatNumber(value: number | null | undefined): string {
  return value === null || value === undefined ? "—" : numberFormat.format(value);
}

export function formatPct(value: number | null | undefined, digits = 1): string {
  return value === null || value === undefined ? "—" : `${value.toFixed(digits)}%`;
}

export function formatConfidence(fraction: number): string {
  return `${(fraction * 100).toFixed(0)}%`;
}

export function formatDateTime(iso: string | null | undefined): string {
  return iso ? dateTimeFormat.format(new Date(iso)) : "—";
}

export function formatDay(iso: string): string {
  return dateFormat.format(new Date(iso));
}

export function formatTime(iso: string): string {
  return timeFormat.format(new Date(iso));
}

export function formatRelative(iso: string | null | undefined): string {
  return iso ? formatDistanceToNow(new Date(iso), { addSuffix: true, locale: uz }) : "—";
}

/** Buckets come from the API as naive Tashkent-local timestamps. */
export function formatBucket(naiveLocal: string, bucket: string): string {
  const [datePart = "", timePart = ""] = naiveLocal.split("T");
  if (bucket === "hour") return timePart.slice(0, 5);
  const [, month = "", day = ""] = datePart.split("-");
  return `${day}.${month}`;
}

export function toIsoStart(date: string): string {
  return new Date(`${date}T00:00:00`).toISOString();
}

export function toIsoEnd(date: string): string {
  return new Date(`${date}T23:59:59`).toISOString();
}

export function daysAgoInput(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
}
