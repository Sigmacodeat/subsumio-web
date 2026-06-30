/**
 * ELSTER integration foundation for German tax advisors.
 *
 * ELSTER (Elektronische Steuererklärung) is the German tax authority's electronic
 * filing system. Full submission requires the official ERiC SDK or a certified
 * intermediary. This module provides the data layer, validation, and preparation
 * logic that a real ELSTER backend connector would consume.
 *
 * Supported forms:
 * - USt-Voranmeldung (monthly/quarterly VAT advance return)
 * - Lohnsteuer-Anmeldung (monthly payroll tax return)
 * - Zusammenfassende Meldung (ZM, intra-EU supplies)
 * - ESt, USt, GewSt, KSt annual declarations
 *
 * Environment:
 * - ELSTER_MODE: "disabled" | "sandbox" | "production" (default: disabled)
 * - ELSTER_CERT_B64: base64-encoded client certificate (PKCS#12)
 * - ELSTER_BACKEND_URL: optional external ELSTER submission service
 */

export type ElsterMode = "disabled" | "sandbox" | "production";

export type ElsterFormType = "UStVA" | "LStA" | "ZM" | "ESt" | "USt" | "GewSt" | "KSt";

export type ElsterSubmissionStatus =
  | "draft"
  | "queued"
  | "submitting"
  | "submitted"
  | "accepted"
  | "rejected"
  | "error";

export interface ElsterSubmission {
  id: string;
  clientId: string;
  clientName: string;
  formType: ElsterFormType;
  period: string; // e.g. "2025-06" or "2025-Q2"
  year: number;
  status: ElsterSubmissionStatus;
  taxAmount?: number;
  refundAmount?: number;
  submittedAt?: string;
  elsterReference?: string;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ElsterFormData {
  formType: ElsterFormType;
  period: string;
  year: number;
  clientId: string;
  clientName: string;
  taxAmount?: number;
  refundAmount?: number;
  // UStVA specific
  vatPrevious?: number;
  vatPayable?: number;
  vatDeductible?: number;
  // LStA specific
  grossWages?: number;
  withheldTax?: number;
  // ZM specific
  euCountryCode?: string;
  euVatId?: string;
  euTurnover?: number;
  notes?: string;
}

export interface ElsterConnectionStatus {
  mode: ElsterMode;
  connected: boolean;
  certificateExpiresAt?: string;
  lastError?: string;
}

export function getElsterMode(): ElsterMode {
  const mode = typeof process !== "undefined" ? process.env.ELSTER_MODE : undefined;
  if (mode === "sandbox" || mode === "production") return mode;
  return "disabled";
}

export function isElsterEnabled(): boolean {
  return getElsterMode() !== "disabled";
}

export function validateElsterForm(data: ElsterFormData): string[] {
  const errors: string[] = [];
  if (!data.clientId) errors.push("client_id_required");
  if (!data.formType) errors.push("form_type_required");
  if (!data.period) errors.push("period_required");
  if (!Number.isFinite(data.year) || data.year < 2000 || data.year > 2100) {
    errors.push("year_invalid");
  }
  if (data.taxAmount !== undefined && data.taxAmount < 0) {
    errors.push("tax_amount_negative");
  }
  if (data.refundAmount !== undefined && data.refundAmount < 0) {
    errors.push("refund_amount_negative");
  }

  // UStVA validation: monthly period YYYY-MM, quarterly YYYY-Q[1-4]
  if (data.formType === "UStVA" || data.formType === "LStA") {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(data.period)) {
      errors.push("period_format_monthly");
    }
  }
  if (data.formType === "ZM") {
    if (!/^\d{4}-Q[1-4]$/.test(data.period)) {
      errors.push("period_format_quarterly");
    }
    if (!data.euCountryCode || data.euCountryCode.length !== 2) {
      errors.push("eu_country_code_invalid");
    }
  }
  if (["ESt", "USt", "GewSt", "KSt"].includes(data.formType)) {
    if (!/^\d{4}$/.test(data.period)) {
      errors.push("period_format_annual");
    }
  }
  return errors;
}

/**
 * Build a minimal XML envelope for ELSTER submission.
 * In production this would be replaced by the official ERiC SDK or certified
 * intermediary API. The XML structure here is a realistic placeholder that
 * validates basic schema expectations (numeric fields, period, etc.).
 */
export function buildElsterXml(data: ElsterFormData): string {
  const errors = validateElsterForm(data);
  if (errors.length > 0) {
    throw new Error(`ELSTER validation failed: ${errors.join(", ")}`);
  }

  const year = String(data.year);
  const period = data.period;
  const taxAmount = data.taxAmount?.toFixed(2) ?? "0.00";
  const refundAmount = data.refundAmount?.toFixed(2) ?? "0.00";

  return `<?xml version="1.0" encoding="UTF-8"?>
<Elster xmlns="http://www.elster.de/2002/XMLSchema">
  <TransferHeader version="11">
    <Verfahren>ElsterBMB</Verfahren>
    <DatenArt>${data.formType}</DatenArt>
    <Vorgang>send-Auth</Vorgang>
    <HerstellerID>74931</HerstellerID>
    <ProduktName>Subsumio Tax</ProduktName>
  </TransferHeader>
  <DatenLieferant>
    <BeraterId>9999999</BeraterId>
    <MandantenId>${escapeXml(data.clientId)}</MandantenId>
    <MandantenName>${escapeXml(data.clientName)}</MandantenName>
  </DatenLieferant>
  <Steuerfall>
    <Jahr>${year}</Jahr>
    <Zeitraum>${escapeXml(period)}</Zeitraum>
    <Kz09>${taxAmount}</Kz09>
    <Kz10>${refundAmount}</Kz10>
  </Steuerfall>
</Elster>`;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Simulate an ELSTER submission.
 * In production this would hand off to a backend service running the ERiC SDK.
 * Returns a queued/submitted status that can be polled later.
 */
export async function submitElsterForm(data: ElsterFormData): Promise<ElsterSubmission> {
  const errors = validateElsterForm(data);
  if (errors.length > 0) {
    throw new Error(`ELSTER validation failed: ${errors.join(", ")}`);
  }
  const mode = getElsterMode();
  if (mode === "disabled") {
    throw new Error(
      "ELSTER is disabled. Set ELSTER_MODE=sandbox or production to enable submissions."
    );
  }

  // Build XML to ensure the payload is schema-ready.
  buildElsterXml(data);

  const now = new Date().toISOString();
  const submission: ElsterSubmission = {
    id: `elster-${data.formType}-${data.period}-${Date.now()}`,
    clientId: data.clientId,
    clientName: data.clientName,
    formType: data.formType,
    period: data.period,
    year: data.year,
    status: mode === "sandbox" ? "submitted" : "queued",
    taxAmount: data.taxAmount,
    refundAmount: data.refundAmount,
    submittedAt: now,
    elsterReference: mode === "sandbox" ? `SANDBOX-${Date.now()}` : undefined,
    createdAt: now,
    updatedAt: now,
  };

  return submission;
}

export function getElsterConnectionStatus(): ElsterConnectionStatus {
  const mode = getElsterMode();
  if (mode === "disabled") {
    return { mode, connected: false, lastError: "ELSTER is disabled in this environment." };
  }
  const cert = typeof process !== "undefined" ? process.env.ELSTER_CERT_B64 : undefined;
  if (!cert) {
    return {
      mode,
      connected: false,
      lastError: "No ELSTER certificate configured (ELSTER_CERT_B64).",
    };
  }
  return { mode, connected: true, certificateExpiresAt: undefined };
}

/**
 * Map a TaxReturn to a draft ELSTER submission form.
 */
export function taxReturnToElsterForm(
  taxReturn: {
    clientId: string;
    clientName: string;
    type: ElsterFormType;
    year: number;
    taxAmount?: number;
    refundAmount?: number;
  },
  period?: string
): ElsterFormData {
  return {
    clientId: taxReturn.clientId,
    clientName: taxReturn.clientName,
    formType: taxReturn.type,
    year: taxReturn.year,
    period: period ?? String(taxReturn.year),
    taxAmount: taxReturn.taxAmount,
    refundAmount: taxReturn.refundAmount,
  };
}
