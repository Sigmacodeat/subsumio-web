import { api } from "./api";

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
  // C1: Rechtsraum — jurisdiction for holiday-aware deadline calculation
  rechtsraumCountry?: "DE" | "AT" | "CH";
  rechtsraumState?: string;
  // E-Invoice: Kleinunternehmer (§19 UStG) — no VAT on invoices
  kleinunternehmer?: boolean;
  // E-Invoice: default profile for ZUGFeRD generation
  eInvoiceProfile?: "BASIC" | "COMFORT" | "EXTENDED";
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
  return { ...merged, stundensatz: clampHourlyRate(merged.stundensatz) };
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
