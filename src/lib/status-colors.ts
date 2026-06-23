/**
 * Statische Tailwind-Klassen-Maps für Status-Farben.
 *
 * Tailwind v4 kompiliert nur Klassen, die LITERAL im Quelltext stehen —
 * interpolierte Namen wie `text-${color}-400` erzeugen KEINE CSS-Regel und
 * fallen stumm auf un-gestylte Elemente zurück. Jede Status→Farbe-Zuordnung
 * läuft deshalb über diese Maps.
 *
 * Die vier bedeutungstragenden Status (blue=info, amber=warning, red=danger,
 * emerald=success) routen über die `--ds-*`-Signal-Tokens — dieselbe
 * Harvey-kalibrierte Palette wie das Cockpit, automatisch AA in Light + Dark.
 * Die rohen `-400`-Klassen (rose/violet/orange/gray) bleiben für rein
 * kategoriale Farben, die keinen Status-Sinn tragen.
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
  blue: "text-[color:var(--ds-info-text)]",
  amber: "text-[color:var(--ds-warning-text)]",
  red: "text-[color:var(--ds-danger-text)]",
  rose: "text-rose-400",
  emerald: "text-[color:var(--ds-success-text)]",
  violet: "brand-text",
  orange: "text-orange-400",
  gray: "text-gray-400",
};

export const STATUS_BG: Record<StatusColor, string> = {
  blue: "bg-[color:var(--ds-info-bg)]",
  amber: "bg-[color:var(--ds-warning-bg)]",
  red: "bg-[color:var(--ds-danger-bg)]",
  rose: "bg-rose-500/10",
  emerald: "bg-[color:var(--ds-success-bg)]",
  violet: "brand-soft",
  orange: "bg-orange-500/10",
  gray: "bg-gray-500/10",
};

export const STATUS_BORDER: Record<StatusColor, string> = {
  blue: "border-[color:var(--ds-info-border)]",
  amber: "border-[color:var(--ds-warning-border)]",
  red: "border-[color:var(--ds-danger-border)]",
  rose: "border-rose-500/20",
  emerald: "border-[color:var(--ds-success-border)]",
  violet: "brand-border",
  orange: "border-orange-500/20",
  gray: "border-gray-500/20",
};

/** Kombinierte Badge-Klassen (bg + text + border) für einen Status. */
export function statusBadgeClasses(color: StatusColor): string {
  return `${STATUS_BG[color]} ${STATUS_TEXT[color]} ${STATUS_BORDER[color]}`;
}
