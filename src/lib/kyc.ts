/**
 * Identifizierung und Geldwäscheprävention nach der RAO.
 *
 *   - § 8a RAO: besondere Sorgfalt bei Immobilien-, Unternehmens-, Vermögens-,
 *     Konto- und Gesellschaftsgeschäften.
 *   - § 8b Abs. 1–5 RAO: Identität der Partei und des wirtschaftlichen
 *     Eigentümers feststellen und prüfen (amtlicher Lichtbildausweis), bei
 *     Ferngeschäft zusätzliche Maßnahmen, Rechtsträger: Auszug aus dem Register
 *     der wirtschaftlichen Eigentümer (WiEReG); Unterlagen aufbewahren.
 *   - § 8b Abs. 6 RAO: Zweck und Art der Geschäftsbeziehung festhalten.
 *   - § 8b Abs. 7 RAO: ohne vollständige Identifizierung kein Auftrag.
 *   - § 8f RAO: Prüfung auf politisch exponierte Personen.
 *   - § 12 Abs. 3 RAO: Aufbewahrung fünf Jahre ab Ende des Auftragsverhältnisses.
 *
 * Sanctions and PEP status are checked by the firm (no list is queried here);
 * the record documents that the check happened, by whom, and against what.
 */

/**
 * The user-facing text of an error response. The KYC routes answer
 * `{ error: "<Text>", code }` (apiError); generic guards answer
 * `{ error: "<code>", message: "<Text>" }`.
 */
export function kycErrorText(
  json: { error?: string; code?: string; message?: string } | null
): string | undefined {
  if (!json) return undefined;
  if (json.code && json.error) return json.error;
  return json.message || undefined;
}

export type KYCRiskLevel = "low" | "medium" | "high";
export type KYCStatus = "pending" | "in_progress" | "verified" | "failed" | "expired";
export type KYCPartyType = "natural" | "legal";

export interface KYCIdentification {
  method?: "persoenlich" | "elektronisch" | "dritter";
  document_type?: "reisepass" | "personalausweis" | "fuehrerschein" | "sonstiger_lichtbildausweis";
  document_number?: string;
  issuing_authority?: string;
  document_valid_until?: string;
  /** § 8b Abs. 2 RAO: date of birth of the natural person, also used for the sanctions check. */
  birth_date?: string;
  /** § 8b Abs. 5: copy of the document retained. */
  copy_retained?: boolean;
  /** Slug der Ausweiskopie im DMS der Akte (§ 8b Abs. 5 — Aufbewahrung). */
  document_file_slug?: string;
  /** § 8b Abs. 3: party not physically present. */
  remote?: boolean;
  additional_measures?: string;
}

export interface KYCBeneficialOwner {
  name: string;
  verified: boolean;
}

export interface KYCHistoryEntry {
  at: string;
  by: string;
  action: "created" | "updated" | "verified" | "failed" | "mandate_ended" | "reopened";
  note?: string;
}

export interface KYCVerification {
  id: string;
  /** Matter or intake the check belongs to. */
  case_slug: string;
  client_name: string;
  client_email?: string;
  party_type?: KYCPartyType;
  status: KYCStatus;
  provider: "idnow" | "video_ident" | "post_ident" | "manual";
  provider_reference?: string;
  /** § 8b Abs. 6 */
  purpose?: string;
  identification?: KYCIdentification;
  /** Rechtsträger: Firmenbuchnummer. */
  register_number?: string;
  /** § 8b Abs. 4a */
  wiereg_extract_obtained?: boolean;
  wiereg_extract_date?: string;
  /** § 8d */
  beneficial_owners?: KYCBeneficialOwner[];
  /** § 8f */
  pep_check: boolean;
  pep_match?: boolean;
  pep_note?: string;
  /** Automatische PEP-Screening-Quelle (z. B. OpenSanctions) — nur gesetzt,
   *  wenn ein externer Check tatsächlich lief. */
  pep_checked_source?: string;
  pep_checked_at?: string;
  pep_candidates?: Array<{
    name: string;
    candidates: Array<{ name: string; score: number; countries: string[] }>;
  }>;
  sanctions_checked?: boolean;
  sanctions_source?: string;
  sanctions_hit?: boolean;
  sanctions_checked_at?: string;
  /** A hit cleared as a documented decision (action `sanctions_clear`). */
  sanctions_cleared_at?: string;
  sanctions_cleared_by?: string;
  sanctions_cleared_reason?: string;
  /** Candidates of the last automatic run; a lawyer decides on each. */
  sanctions_matches?: Array<{
    name: string;
    matches: Array<{
      reference: string;
      matchedName: string;
      primaryName: string;
      programmes: string[];
      birthDates: string[];
      score: number;
      kind: string;
    }>;
  }>;
  risk_level: KYCRiskLevel;
  risk_factors: string[];
  verified_at?: string;
  verified_by?: string;
  failed_reason?: string;
  mandate_ended_at?: string;
  /** § 12 Abs. 3 */
  retain_until?: string;
  /** Same date under the field the retention job reads (cron/trash-purge);
   *  the record — and the ID copy filed with it — is deleted when it passes. */
  retention_until?: string;
  expires_at?: string;
  notes?: string;
  history?: KYCHistoryEntry[];
  /** Kept for older records. */
  transparenzregister_checked: boolean;
  transparenzregister_result?: {
    found: boolean;
    registered_persons?: string[];
    legal_form?: string;
  };
  created_at: string;
  updated_at: string;
}

export interface KYCProvider {
  name: string;
  initiateVerification(input: {
    client_name: string;
    client_email?: string;
    case_slug: string;
  }): Promise<{ reference: string; redirect_url?: string }>;
  checkStatus(reference: string): Promise<{ status: KYCStatus; verified_at?: string }>;
}

export function assessRiskLevel(input: {
  is_pep: boolean;
  is_high_risk_country: boolean;
  cash_intensive: boolean;
  complex_ownership: boolean;
  trust_or_company_structure: boolean;
}): { level: KYCRiskLevel; factors: string[] } {
  const factors: string[] = [];
  if (input.is_pep) factors.push("PEP (politisch exponierte Person)");
  if (input.is_high_risk_country) factors.push("Hochrisikoland");
  if (input.cash_intensive) factors.push("Bargeldintensiv");
  if (input.complex_ownership) factors.push("Komplexe Eigentümerstruktur");
  if (input.trust_or_company_structure) factors.push("Trust/Gesellschaftsstruktur");
  // A PEP always means enhanced due diligence (§ 8f RAO).
  const level: KYCRiskLevel =
    input.is_pep || factors.length >= 3 ? "high" : factors.length >= 1 ? "medium" : "low";
  return { level, factors };
}

export function createKYCVerification(input: {
  case_slug: string;
  client_name: string;
  client_email?: string;
  party_type?: KYCPartyType;
  provider?: KYCVerification["provider"];
  risk_level?: KYCRiskLevel;
  risk_factors?: string[];
  created_by?: string;
}): KYCVerification {
  const now = new Date().toISOString();
  return {
    id: `kyc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    case_slug: input.case_slug,
    client_name: input.client_name,
    client_email: input.client_email,
    party_type: input.party_type ?? "natural",
    status: "pending",
    provider: input.provider ?? "manual",
    risk_level: input.risk_level ?? "low",
    risk_factors: input.risk_factors ?? [],
    transparenzregister_checked: false,
    pep_check: false,
    history: [{ at: now, by: input.created_by ?? "system", action: "created" }],
    created_at: now,
    updated_at: now,
  };
}

/** What is still missing before the check may be completed. Empty = complete. */
export function missingForVerification(v: KYCVerification, today = new Date()): string[] {
  const missing: string[] = [];
  const id = v.identification ?? {};
  if (!v.purpose?.trim()) missing.push("Zweck und Art der Geschäftsbeziehung (§ 8b Abs. 6 RAO)");
  if (!id.document_type || !id.document_number?.trim() || !id.issuing_authority?.trim()) {
    missing.push(
      v.party_type === "legal"
        ? "Lichtbildausweis der vertretungsbefugten Person (Art, Nummer, Behörde)"
        : "Amtlicher Lichtbildausweis: Art, Nummer und ausstellende Behörde (§ 8b Abs. 2 RAO)"
    );
  }
  if (!id.document_valid_until) {
    missing.push("Gültigkeit des Ausweises");
  } else if (new Date(id.document_valid_until) < new Date(today.toISOString().slice(0, 10))) {
    missing.push("Der Ausweis ist abgelaufen");
  }
  if (!id.copy_retained) missing.push("Kopie des Ausweises aufbewahrt (§ 8b Abs. 5 RAO)");
  if (v.party_type !== "legal" && !id.birth_date) {
    missing.push("Geburtsdatum (§ 8b Abs. 2 RAO)");
  }
  if (id.remote && !id.additional_measures?.trim()) {
    missing.push("Zusätzliche Maßnahmen beim Ferngeschäft (§ 8b Abs. 3 RAO)");
  }
  if (v.party_type === "legal") {
    if (!v.wiereg_extract_obtained) {
      missing.push("Auszug aus dem Register der wirtschaftlichen Eigentümer (§ 8b Abs. 4a RAO)");
    }
    const owners = v.beneficial_owners ?? [];
    if (owners.length === 0 || owners.some((o) => !o.name.trim() || !o.verified)) {
      missing.push("Wirtschaftliche Eigentümer festgestellt und geprüft (§ 8d RAO)");
    }
  }
  if (!v.pep_check) missing.push("Prüfung auf politisch exponierte Person (§ 8f RAO)");
  if (v.pep_match && !v.pep_note?.trim()) {
    missing.push("PEP: verstärkte Sorgfalt dokumentieren, insbesondere Herkunft der Mittel");
  }
  if (!v.sanctions_checked || !v.sanctions_source?.trim()) {
    missing.push("Sanktionslistenprüfung mit Angabe der Quelle");
  }
  if (v.sanctions_hit)
    missing.push("Treffer auf einer Sanktionsliste — der Auftrag darf nicht angenommen werden");
  return missing;
}

/** § 12 Abs. 3 RAO: five years from the end of the engagement. */
export function retentionEnd(mandateEndedAt: string): string {
  const d = new Date(mandateEndedAt);
  d.setFullYear(d.getFullYear() + 5);
  return d.toISOString().slice(0, 10);
}

export function isVerified(v: Pick<KYCVerification, "status"> | null | undefined): boolean {
  return v?.status === "verified";
}

export function getExpiringKYC(
  verifications: KYCVerification[],
  daysAhead: number,
  date?: Date
): KYCVerification[] {
  const now = date ?? new Date();
  const cutoff = new Date(now.getTime() + daysAhead * 86400000);
  return verifications.filter((v) => {
    if (v.status !== "verified" || !v.expires_at) return false;
    const expiry = new Date(v.expires_at);
    return expiry > now && expiry <= cutoff;
  });
}
