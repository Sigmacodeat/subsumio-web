/**
 * Statische Tailwind-Klassen-Maps für Status-Farben.
 *
 * Tailwind v4 kompiliert nur Klassen, die LITERAL im Quelltext stehen —
 * interpolierte Namen wie `text-${color}-400` erzeugen KEINE CSS-Regel und
 * fallen stumm auf un-gestylte Elemente zurück. Jede Status→Farbe-Zuordnung
 * läuft deshalb über diese Maps.
 */

export type StatusColor =
  | "blue"
  | "amber"
  | "red"
  | "rose"
  | "emerald"
  | "violet"
  | "orange"
  | "gray";

export const STATUS_TEXT: Record<StatusColor, string> = {
  blue: "text-blue-400",
  amber: "text-amber-400",
  red: "text-red-400",
  rose: "text-rose-400",
  emerald: "text-emerald-400",
  violet: "brand-text",
  orange: "text-orange-400",
  gray: "text-gray-400",
};

export const STATUS_BG: Record<StatusColor, string> = {
  blue: "bg-blue-500/10",
  amber: "bg-amber-500/10",
  red: "bg-red-500/10",
  rose: "bg-rose-500/10",
  emerald: "bg-emerald-500/10",
  violet: "brand-soft",
  orange: "bg-orange-500/10",
  gray: "bg-gray-500/10",
};

export const STATUS_BORDER: Record<StatusColor, string> = {
  blue: "border-blue-500/20",
  amber: "border-amber-500/20",
  red: "border-red-500/20",
  rose: "border-rose-500/20",
  emerald: "border-emerald-500/20",
  violet: "brand-border",
  orange: "border-orange-500/20",
  gray: "border-gray-500/20",
};

/** Kombinierte Badge-Klassen (bg + text + border) für einen Status. */
export function statusBadgeClasses(color: StatusColor): string {
  return `${STATUS_BG[color]} ${STATUS_TEXT[color]} ${STATUS_BORDER[color]}`;
}
