/**
 * Kanzlei-Branding für Rechnungen.
 * Legacy-Kompatibilitätsschicht für alte Rechnungsexporte. Die Stammdaten
 * liegen zentral als Brain-Page in `kanzlei-settings.ts`.
 */

import {
  loadKanzleiSettings,
  normalizeKanzleiSettings,
  readLocalKanzleiSettings,
  saveKanzleiSettings as saveCanonicalKanzleiSettings,
  type KanzleiSettings as CanonicalKanzleiSettings,
} from "./kanzlei-settings";

export interface KanzleiSettings {
  name: string;
  street: string;
  city: string;
  zip: string;
  country: string;
  phone: string;
  email: string;
  website: string;
  ustId: string;
  taxNumber: string;
  bankName: string;
  iban: string;
  bic: string;
  logoUrl?: string;
}

export function getKanzleiSettings(): KanzleiSettings {
  return toInvoiceSettings(readLocalKanzleiSettings());
}

export async function loadInvoiceTemplateSettings(): Promise<KanzleiSettings> {
  return toInvoiceSettings(await loadKanzleiSettings());
}

export async function saveKanzleiSettings(settings: KanzleiSettings): Promise<void> {
  const current = normalizeKanzleiSettings(await loadKanzleiSettings());
  await saveCanonicalKanzleiSettings({
    ...current,
    kanzleiName: settings.name,
    kanzleiAdresse: [settings.street, `${settings.zip} ${settings.city}`.trim(), settings.country].filter(Boolean).join("\n"),
    kanzleiTelefon: settings.phone,
    kanzleiEmail: settings.email,
    ustId: settings.ustId,
    bankName: settings.bankName,
    iban: settings.iban,
    bic: settings.bic,
    street: settings.street,
    city: settings.city,
    zip: settings.zip,
    country: settings.country,
    website: settings.website,
    taxNumber: settings.taxNumber,
    logoUrl: settings.logoUrl,
  });
}

function toInvoiceSettings(settings: CanonicalKanzleiSettings): KanzleiSettings {
  const addressLines = (settings.kanzleiAdresse || "").split("\n").map((line) => line.trim()).filter(Boolean);
  return {
    name: settings.kanzleiName || "Kanzlei",
    street: settings.street || addressLines[0] || "",
    city: settings.city || "",
    zip: settings.zip || "",
    country: settings.country || addressLines[addressLines.length - 1] || "Deutschland",
    phone: settings.kanzleiTelefon || "",
    email: settings.kanzleiEmail || "",
    website: settings.website || "",
    ustId: settings.ustId || "",
    taxNumber: settings.taxNumber || "",
    bankName: settings.bankName || "",
    iban: settings.iban || "",
    bic: settings.bic || "",
    logoUrl: settings.logoUrl,
  };
}

/** Rechnungskopf als Text-Block für jsPDF */
export function renderInvoiceHeader(settings: KanzleiSettings): string {
  return [
    settings.name,
    settings.street,
    `${settings.zip} ${settings.city}`,
    `Tel: ${settings.phone}`,
    `E-Mail: ${settings.email}`,
    `USt-IdNr: ${settings.ustId}`,
  ].join("\n");
}

/** Bankverbindung als Text-Block */
export function renderBankDetails(settings: KanzleiSettings): string {
  return [
    "Bankverbindung:",
    settings.bankName,
    `IBAN: ${settings.iban}`,
    `BIC: ${settings.bic}`,
  ].join("\n");
}
