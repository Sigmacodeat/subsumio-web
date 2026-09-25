import { api, ApiRequestError } from "./api";

export interface KanzleiSettings {
  kanzleiName: string;
  anwaltName: string;
  kanzleiAdresse?: string;
  kanzleiEmail?: string;
  kanzleiTelefon?: string;
  kammerNummer?: string;
  ustId: string;
  stundensatz: string;
  abrechnungstakt?: string;
  bankName?: string;
  iban?: string;
  bic?: string;
  zahlungszielTage?: string;
  rechnungFooter?: string;
  tarifModell?: "rvg" | "ratg" | "custom";
  rechtsgebietSaetze: Record<string, number>;
  // DATEV-Export
  datevKontenrahmen?: "SKR03" | "SKR04" | "SKR49";
  datevBeraterNr?: string;
  datevMandantenNr?: string;
  // E-Mail
  smtpHost?: string;
  smtpPort?: string;
  smtpUser?: string;
  smtpPassword?: string;
  smtpSecure?: boolean;
  emailFrom?: string;
  // Invoice header / branding (legacy invoice-template.ts compatibility)
  street?: string;
  city?: string;
  zip?: string;
  country?: string;
  website?: string;
  taxNumber?: string;
  logoUrl?: string;
  // Security: org-level 2FA enforcement
  require2FA?: boolean;
  // Aktenzeichen-Nummernkreis: optional firm prefix for auto-allocated
  // case numbers (e.g. "MK" → "MK-26-0042"). Read by
  // api/legal/case-number/allocate when the caller passes no prefix.
  aktenzeichenPrefix?: string;
  // C1: Rechtsraum — jurisdiction for holiday-aware deadline calculation
  rechtsraumCountry?: "DE" | "AT" | "CH";
  rechtsraumState?: string;
  // E-Invoice: Kleinunternehmer (§19 UStG) — no VAT on invoices
  kleinunternehmer?: boolean;
  // E-Invoice: default profile for ZUGFeRD generation
  eInvoiceProfile?: "BASIC" | "COMFORT" | "EXTENDED";
  // Buchhaltungsexport (BMD/RZL, src/lib/fibu-export/): Konten sind pro
  // Kanzlei individuell und müssen mit dem Steuerberater abgestimmt
  // werden — kein sinnvoller Standardwert möglich.
  fibuDebitorKonto?: string;
  fibuErloesKonto?: string;
  /** Nur für BMD: USt-Satz (als "20") → BMD-Steuercode. Pro BMD-Mandant konfiguriert, kein Standardwert. */
  fibuBmdSteuercode20?: string;
  fibuBmdSteuercode13?: string;
  fibuBmdSteuercode10?: string;
  // Öffentliche Terminbuchung (/termin + api/booking/public): Opt-in —
  // ohne bookingEnabled antwortet die öffentliche Route 404.
  bookingEnabled?: boolean;
  bookingStart?: string;
  bookingEnd?: string;
  bookingSlotMinutes?: number;
  // Fristen-Erinnerungen & Eskalation (cron/deadline-reminders +
  // cron/deadlines). Stages als CSV "7,3,1,0" — Tage vor der Frist.
  // Leer/unleserlich fällt auf den Standard zurück, nie auf "keine Mail".
  deadlineReminderStages?: string;
  // Überfällige Notfristen bekommen eine eigene Eskalations-Mail (default an).
  deadlineNotfristEscalation?: boolean;
  // Zusätzlicher Eskalations-Empfänger (z. B. Kanzleiinhaber/in), der bei
  // überfälligen Notfristen immer mitinformiert wird.
  deadlineEscalationEmail?: string;
  // Papierkorb-Retention (DSGVO-Löschkonzept): tombstoned/archivierte Einträge
  // werden nach Ablauf endgültig gelöscht (Engine-Soft-Delete → Autopilot-Purge).
  // false = nie automatisch löschen. Default: an.
  trashAutoPurge?: boolean;
  // Tage im Papierkorb bis zur endgültigen Löschung. Default 30,
  // geclampt auf 7–3650 — nie "sofort", nie unendlich.
  trashRetentionDays?: number;
  // Autopilot (cron/autopilot): automatische Vorschläge zu neuen Eingängen,
  // nahenden Fristen und hochgeladenen Dokumenten — nie selbst abgeschlossen,
  // jedes Ergebnis braucht die Freigabe eines Anwalts (approval_required).
  // Opt-in pro Kanzlei, Standard AUS — die Kanzlei sieht Autopilot nie
  // ungefragt loslaufen. undefined/false = aus.
  autopilotEnabled?: boolean;
}

export const TRASH_RETENTION_DEFAULT_DAYS = 30;
export const TRASH_RETENTION_MIN_DAYS = 7;
export const TRASH_RETENTION_MAX_DAYS = 3650;

/**
 * Sanitizes the configured trash retention. Unreadable or out-of-range values
 * fall back to the 30-day default — never to "purge immediately" and never to
 * "keep forever" unless trashAutoPurge is explicitly false.
 */
export function normalizeTrashRetentionDays(value: unknown): number {
  const n = typeof value === "number" ? value : parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(n)) return TRASH_RETENTION_DEFAULT_DAYS;
  return Math.min(Math.max(Math.round(n), TRASH_RETENTION_MIN_DAYS), TRASH_RETENTION_MAX_DAYS);
}

export const KANZLEI_SETTINGS_SLUG = "legal/settings/kanzlei";

export const DEFAULT_KANZLEI_SETTINGS: KanzleiSettings = {
  kanzleiName: "",
  anwaltName: "",
  ustId: "",
  stundensatz: "200",
  abrechnungstakt: "15",
  zahlungszielTage: "14",
  rechnungFooter: "Bitte überweisen Sie den Betrag unter Angabe der Rechnungsnummer.",
  tarifModell: "custom",
  rechtsgebietSaetze: {
    allgemein: 200,
    vertragsrecht: 220,
    prozessrecht: 250,
    arbeitsrecht: 230,
    datenschutz: 280,
    steuerrecht: 260,
  },
};

/** Plausibility bound for an hourly rate in EUR (a 220 250 €/h typo once got through). */
export const MAX_HOURLY_RATE_EUR = 5000;

/** Keep the stored hourly rate a sane positive integer string; fall back to the default. */
export function clampHourlyRate(
  value: unknown,
  fallback = DEFAULT_KANZLEI_SETTINGS.stundensatz
): string {
  const n = typeof value === "number" ? value : parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return String(Math.min(Math.round(n), MAX_HOURLY_RATE_EUR));
}

export function normalizeKanzleiSettings(input?: Partial<KanzleiSettings> | null): KanzleiSettings {
  const merged = {
    ...DEFAULT_KANZLEI_SETTINGS,
    ...(input ?? {}),
    rechtsgebietSaetze: {
      ...DEFAULT_KANZLEI_SETTINGS.rechtsgebietSaetze,
      ...(input?.rechtsgebietSaetze ?? {}),
    },
  };
  return {
    ...merged,
    stundensatz: clampHourlyRate(merged.stundensatz),
    // Stored values are clamped too — a "2" saved in the UI must not read as
    // 2 days anywhere; the effective floor is 7.
    trashRetentionDays:
      merged.trashRetentionDays === undefined
        ? undefined
        : normalizeTrashRetentionDays(merged.trashRetentionDays),
  };
}

export function readLocalKanzleiSettings(): KanzleiSettings {
  if (typeof window === "undefined") return DEFAULT_KANZLEI_SETTINGS;
  try {
    const raw = window.localStorage.getItem("kanzlei_settings");
    return normalizeKanzleiSettings(raw ? JSON.parse(raw) : null);
  } catch {
    return DEFAULT_KANZLEI_SETTINGS;
  }
}

export function writeLocalKanzleiSettings(settings: KanzleiSettings) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem("kanzlei_settings", JSON.stringify(settings));
}

export async function loadKanzleiSettings(): Promise<KanzleiSettings> {
  const local = readLocalKanzleiSettings();
  try {
    const page = await api.brain.getPage(KANZLEI_SETTINGS_SLUG);
    return normalizeKanzleiSettings(page.frontmatter as Partial<KanzleiSettings>);
  } catch {
    return local;
  }
}

/**
 * Like `loadKanzleiSettings`, but a failed read THROWS instead of quietly
 * falling back to browser-local or default settings. Deadline calculation
 * depends on the Rechtsraum: a silent fallback would compute a German firm's
 * deadline with the Austrian engine. Only a settings page that does not exist
 * yet (404 — never configured) resolves, to the local/default settings.
 */
export async function loadKanzleiSettingsStrict(): Promise<KanzleiSettings> {
  try {
    const page = await api.brain.getPage(KANZLEI_SETTINGS_SLUG);
    return normalizeKanzleiSettings(page.frontmatter as Partial<KanzleiSettings>);
  } catch (err) {
    if (err instanceof ApiRequestError && err.status === 404) return readLocalKanzleiSettings();
    throw err;
  }
}

export async function saveKanzleiSettings(settings: KanzleiSettings): Promise<void> {
  const normalized = normalizeKanzleiSettings(settings);
  await api.brain.createPage({
    slug: KANZLEI_SETTINGS_SLUG,
    title: "Kanzlei-Einstellungen",
    type: "kanzlei_settings",
    content:
      "Zentrale Kanzlei-Stammdaten für Rechnungen, Honorarverwaltung und Verfahrensdokumentation.",
    frontmatter: {
      type: "kanzlei_settings",
      ...normalized,
      updated_at: new Date().toISOString(),
    },
  });
  writeLocalKanzleiSettings(normalized);
}

/**
 * Statutory VAT rate for the firm's invoices, as a fraction.
 *
 * Keyed on the firm's country, never on the fee model: an Austrian firm on a
 * custom tariff was billed with the German 19 % before. Kleinunternehmer
 * (§ 6 Abs 1 Z 27 UStG / § 19 UStG) issue invoices without VAT.
 */
export function vatRateFor(settings?: Partial<KanzleiSettings> | null): number {
  if (settings?.kleinunternehmer) return 0;
  switch ((settings?.country ?? "AT").toUpperCase()) {
    case "DE":
      return 0.19;
    case "CH":
      return 0.081;
    default:
      return 0.2;
  }
}
