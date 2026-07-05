/**
 * RSV / drebis — Legal Insurance Provider Interface
 * ===================================================
 * Provider interface for coverage inquiry and status retrieval.
 * drebis as first implementation (partnership needed — structured email fallback until then).
 */

export interface LegalInsuranceProvider {
  name: string;
  inquireCoverage(input: {
    case_slug: string;
    client_name: string;
    client_email?: string;
    insurance_number?: string;
    matter: string;
    legal_area: string;
    dispute_value?: number;
  }): Promise<CoverageResult>;
  checkStatus(reference: string): Promise<CoverageStatus>;
}

export interface CoverageResult {
  reference: string;
  covered: boolean;
  coverage_amount?: number;
  deductible?: number;
  conditions?: string[];
  requires_pre_approval: boolean;
  valid_until?: string;
}

export interface CoverageStatus {
  reference: string;
  status: "pending" | "approved" | "partially_approved" | "denied" | "expired";
  approved_amount?: number;
  notes?: string;
}

export interface RSVCaseData {
  id: string;
  case_slug: string;
  client_name: string;
  insurance_provider: string;
  insurance_number?: string;
  coverage_reference?: string;
  coverage_status: CoverageStatus["status"] | "not_inquired";
  coverage_amount?: number;
  deductible?: number;
  conditions?: string[];
  inquired_at?: string;
  decided_at?: string;
  created_at: string;
  updated_at: string;
}

export function createRSVCaseData(input: {
  case_slug: string;
  client_name: string;
  insurance_provider: string;
  insurance_number?: string;
}): RSVCaseData {
  const now = new Date().toISOString();
  return {
    id: `rsv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    case_slug: input.case_slug,
    client_name: input.client_name,
    insurance_provider: input.insurance_provider,
    insurance_number: input.insurance_number,
    coverage_status: "not_inquired",
    created_at: now,
    updated_at: now,
  };
}

export function buildCoverageInquiryEmail(
  data: RSVCaseData,
  matter: string,
  legalArea: string,
  disputeValue?: number
): { subject: string; body: string } {
  const subject = `Deckungsanfrage — ${data.client_name} — ${data.case_slug}`;
  const body = [
    "Sehr geehrte Damen und Herren,",
    "",
    `hiermit bitten wir um Prüfung der Deckung für folgende Angelegenheit:`,
    "",
    `Mandant: ${data.client_name}`,
    `Versicherungsschein-Nr.: ${data.insurance_number ?? "nicht bekannt"}`,
    `Aktenzeichen (intern): ${data.case_slug}`,
    `Rechtsgebiet: ${legalArea}`,
    `Gegenstand: ${matter}`,
    disputeValue ? `Streitwert: ${disputeValue.toFixed(2)} EUR` : "",
    "",
    "Wir bitten um zeitnahe Bestätigung der Deckungszusage.",
    "",
    "Mit freundlichen Grüßen",
  ]
    .filter(Boolean)
    .join("\n");

  return { subject, body };
}
