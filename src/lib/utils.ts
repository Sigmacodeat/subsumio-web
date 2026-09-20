import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Parses a date value; a bare `YYYY-MM-DD` is a calendar day in local time, not UTC midnight. */
export function parseDateValue(date: string | Date | null | undefined): Date | null {
  if (date === null || date === undefined || date === "") return null;
  if (date instanceof Date) return Number.isNaN(date.getTime()) ? null : date;
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date.trim());
  const d = day ? new Date(Number(day[1]), Number(day[2]) - 1, Number(day[3])) : new Date(date);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** `TT.MM.JJJJ`; unparseable values render as "—" instead of "Invalid Date". */
export function formatDate(date: string | Date | null | undefined): string {
  const d = parseDateValue(date);
  if (!d) return "—";
  return new Intl.DateTimeFormat("de-AT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
}

/** `TT.MM.JJJJ, HH:MM` */
export function formatDateTime(date: string | Date | null | undefined): string {
  const d = parseDateValue(date);
  if (!d) return "—";
  return new Intl.DateTimeFormat("de-AT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

/** Whole calendar days from today to `date` (negative = past). */
export function daysUntil(
  date: string | Date | null | undefined,
  now: Date = new Date()
): number | null {
  const d = parseDateValue(date);
  if (!d) return null;
  const a = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const b = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return Math.round((b - a) / 86_400_000);
}

/** Relative wording for deadlines: "heute", "morgen", "in 5 Tagen", "seit 2 Tagen überfällig". */
export function formatDaysUntil(days: number | null): string {
  if (days === null) return "";
  if (days === 0) return "heute";
  if (days === 1) return "morgen";
  if (days === -1) return "seit gestern überfällig";
  if (days < 0) return `seit ${-days} Tagen überfällig`;
  return `in ${days} Tagen`;
}

export function formatRelativeTime(date: string | Date): string {
  const d = parseDateValue(date);
  if (!d) return "—";
  const diff = Date.now() - d.getTime();
  const minutes = Math.floor(diff / 60_000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 7) return formatDate(d);
  if (days > 1) return `vor ${days} Tagen`;
  if (days === 1) return "gestern";
  if (hours > 0) return hours === 1 ? "vor 1 Stunde" : `vor ${hours} Stunden`;
  if (minutes > 0) return minutes === 1 ? "vor 1 Minute" : `vor ${minutes} Minuten`;
  return "gerade eben";
}

export function truncate(str: string, n: number): string {
  return str.length > n ? str.slice(0, n - 1) + "…" : str;
}

export function encodeSlugPath(slug: string): string {
  return slug.split("/").map(encodeURIComponent).join("/");
}

export function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Amount in euros as lawyers expect it: "1.234,50 €" (de-AT) / "€1,234.50" (en). */
export function formatEur(amount: number, lang: "de" | "en" | string = "de"): string {
  const value = Number.isFinite(amount) ? amount : 0;
  return new Intl.NumberFormat(lang === "en" ? "en-GB" : "de-AT", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}
