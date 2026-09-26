/**
 * Darstellungs-/Barrierefreiheits-Einstellungen (Schriftgröße, Kontrast,
 * Bewegung). Persistenz in localStorage unter `subsumio-a11y-prefs`; die
 * Anwendung erfolgt über `data-font-scale`, `data-contrast` und `data-motion`
 * auf `<html>` — gelesen von `src/app/a11y-preferences.css`.
 *
 * Vor dem ersten Rendern setzt `A11Y_INIT_SCRIPT` (theme-init-script.ts)
 * dieselben Attribute flackerfrei; dieses Modul ist die typisierte Quelle für
 * Dashboard-Seiten und Tests. Das Farbschema (`subsumio-theme`) bleibt beim
 * bestehenden Mechanismus im Dashboard-Layout und wird hier nur verlinkt.
 *
 * Kein Server-Endpunkt: `/api/auth/me` kennt nur `name` und `locale`; ein
 * geräteübergreifender Abgleich braucht ein Feld im Benutzer-Store und ist
 * als Folgearbeit vermerkt (siehe Einstellungen → Darstellung).
 */

export const A11Y_STORAGE_KEY = "subsumio-a11y-prefs";
/** Wird nach jeder Änderung ausgelöst, damit offene Tabs/Hook-Konsumenten nachziehen. */
export const A11Y_CHANGE_EVENT = "subsumio:a11y-change";

export const FONT_SCALES = ["100", "112", "125"] as const;
export type FontScale = (typeof FONT_SCALES)[number];

export const CONTRASTS = ["standard", "high"] as const;
export type Contrast = (typeof CONTRASTS)[number];

/** `system` = Betriebssystem entscheidet (prefers-reduced-motion). */
export const MOTIONS = ["system", "reduce", "allow"] as const;
export type Motion = (typeof MOTIONS)[number];

export interface A11yPrefs {
  fontScale: FontScale;
  contrast: Contrast;
  motion: Motion;
}

export const DEFAULT_A11Y_PREFS: A11yPrefs = {
  fontScale: "100",
  contrast: "standard",
  motion: "system",
};

function pick<T extends readonly string[]>(
  allowed: T,
  value: unknown,
  fallback: T[number]
): T[number] {
  const v = typeof value === "number" ? String(value) : value;
  return typeof v === "string" && (allowed as readonly string[]).includes(v)
    ? (v as T[number])
    : fallback;
}

/** Tolerantes Parsen: kaputtes JSON, fremde Werte oder alte Formate → Standard. */
export function parseA11yPrefs(raw: string | null | undefined): A11yPrefs {
  if (!raw) return { ...DEFAULT_A11Y_PREFS };
  try {
    const obj = JSON.parse(raw) as Record<string, unknown> | null;
    if (!obj || typeof obj !== "object") return { ...DEFAULT_A11Y_PREFS };
    return {
      fontScale: pick(FONT_SCALES, obj.fontScale, DEFAULT_A11Y_PREFS.fontScale),
      contrast: pick(CONTRASTS, obj.contrast, DEFAULT_A11Y_PREFS.contrast),
      motion: pick(MOTIONS, obj.motion, DEFAULT_A11Y_PREFS.motion),
    };
  } catch {
    return { ...DEFAULT_A11Y_PREFS };
  }
}

export function isDefaultA11yPrefs(prefs: A11yPrefs): boolean {
  return (
    prefs.fontScale === DEFAULT_A11Y_PREFS.fontScale &&
    prefs.contrast === DEFAULT_A11Y_PREFS.contrast &&
    prefs.motion === DEFAULT_A11Y_PREFS.motion
  );
}

/** Liest die gespeicherten Einstellungen; ohne Browser/Storage → Standard. */
export function readA11yPrefs(): A11yPrefs {
  try {
    if (typeof localStorage === "undefined") return { ...DEFAULT_A11Y_PREFS };
    return parseA11yPrefs(localStorage.getItem(A11Y_STORAGE_KEY));
  } catch {
    return { ...DEFAULT_A11Y_PREFS };
  }
}

/**
 * Setzt die data-Attribute auf dem Wurzelelement. Standardwerte entfernen das
 * Attribut, damit die Basis-Styles ohne Sonderfall gelten.
 */
export function applyA11yPrefs(prefs: A11yPrefs, root: HTMLElement | null = rootElement()): void {
  if (!root) return;
  if (prefs.fontScale === "100") root.removeAttribute("data-font-scale");
  else root.setAttribute("data-font-scale", prefs.fontScale);

  if (prefs.contrast === "high") root.setAttribute("data-contrast", "high");
  else root.removeAttribute("data-contrast");

  if (prefs.motion === "system") root.removeAttribute("data-motion");
  else root.setAttribute("data-motion", prefs.motion);
}

/** Speichert, wendet an und benachrichtigt (storage-Event deckt andere Tabs ab). */
export function writeA11yPrefs(prefs: A11yPrefs): void {
  try {
    if (isDefaultA11yPrefs(prefs)) localStorage.removeItem(A11Y_STORAGE_KEY);
    else localStorage.setItem(A11Y_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Privater Modus / blockierter Storage: Anwendung trotzdem für diese Sitzung.
  }
  applyA11yPrefs(prefs);
  try {
    window.dispatchEvent(new Event(A11Y_CHANGE_EVENT));
  } catch {
    // kein window (SSR) — nichts zu tun
  }
}

function rootElement(): HTMLElement | null {
  return typeof document === "undefined" ? null : document.documentElement;
}
