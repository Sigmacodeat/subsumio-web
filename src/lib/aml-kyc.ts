/**
 * AML/KYC Intake Data Model — P1-AML-001
 * ========================================
 * AML/KYC Intake-Datenmodell und Review-Status an bestehenden
 * Intake-/Conflict-Flow anbinden.
 *
 * Umfasst:
 *   - KYC Customer Profile (Identifikation, Risiko-Klassifizierung)
 *   - AML Risk Assessment (Risk Scoring, Screening)
 *   - Compliance Review Status (Workflow für Compliance-Officer)
 *   - PEP/Sanction Screening Results
 *   - Source of Funds Verification
 *   - Enhanced Due Diligence (EDD) für High-Risk Clients
 */

export type KYCRiskLevel = "low" | "medium" | "high" | "prohibited";
export type KYCStatus = "pending" | "in_review" | "approved" | "rejected" | "enhanced_due_diligence";
export type CustomerType = "individual" | "legal_entity" | "trust" | "partnership";
export type IDDocumentType = "passport" | "id_card" | "drivers_license" | "residence_permit" | "commercial_register" | "tax_id";
export type ScreeningResult = "clear" | "match" | "potential_match" | "false_positive";

export interface KYCIdentityDocument {
  type: IDDocumentType;
  number: string;
  issuing_country: string;
  issuing_authority?: string;
  issued_at: string;
  expires_at?: string;
  verified: boolean;
  verified_at?: string;
  verified_by?: string;
}

export interface KYCContactInfo {
  email: string;
  phone?: string;
  address_line_1: string;
  address_line_2?: string;
  city: string;
  postal_code: string;
  country: string;
}

export interface KYCCustomerProfile {
  id: string;
  case_slug: string;
  brain_id: string;
  org_id: string;
  customer_type: CustomerType;
  /** For individuals */
  first_name?: string;
  last_name?: string;
  date_of_birth?: string;
  place_of_birth?: string;
  nationality?: string;
  /** For legal entities */
  company_name?: string;
  registration_number?: string;
  registered_address?: string;
  beneficial_owners?: BeneficialOwner[];
  /** Contact */
  contact: KYCContactInfo;
  /** Identity documents */
  identity_documents: KYCIdentityDocument[];
  /** Risk assessment */
  risk_level: KYCRiskLevel;
  risk_score: number;
  risk_factors: string[];
  /** Screening results */
  pep_screening: ScreeningResult;
  sanctions_screening: ScreeningResult;
  adverse_media_screening: ScreeningResult;
  screening_checked_at?: string;
  /** Source of funds */
  source_of_funds?: string;
  source_of_funds_verified: boolean;
  source_of_funds_documents?: string[];
  /** Status */
  status: KYCStatus;
  reviewed_by?: string;
  reviewed_at?: string;
  review_notes?: string;
  rejection_reason?: string;
  /** EDD */
  edd_required: boolean;
  edd_completed: boolean;
  edd_documents?: string[];
  /** Audit */
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface BeneficialOwner {
  first_name: string;
  last_name: string;
  date_of_birth: string;
  nationality: string;
  ownership_percentage: number;
  is_pep: boolean;
}

export interface AMLRiskAssessment {
  id: string;
  customer_id: string;
  risk_level: KYCRiskLevel;
  risk_score: number;
  factors: RiskFactor[];
  assessed_by: string;
  assessed_at: string;
  next_review_date: string;
}

export interface RiskFactor {
  category: string;
  description: string;
  weight: number;
  score: number;
}

// ── Risk Scoring ──────────────────────────────────────────────────────

export const RISK_FACTOR_WEIGHTS: Record<string, number> = {
  high_risk_country: 30,
  pep_exposure: 25,
  cash_intensive: 20,
  complex_ownership: 15,
  cross_border: 10,
  new_customer: 5,
  high_value_transaction: 10,
  unverified_source_of_funds: 20,
  adverse_media: 15,
  sanctions_match: 100,
};

export const HIGH_RISK_COUNTRIES: string[] = [
  "AF", "KP", "IR", "SY", "SS", "MM",
];

export function calculateRiskScore(factors: RiskFactor[]): number {
  return Math.min(100, factors.reduce((sum, f) => sum + f.score * f.weight / 100, 0));
}

export function scoreToRiskLevel(score: number): KYCRiskLevel {
  if (score >= 80) return "prohibited";
  if (score >= 50) return "high";
  if (score >= 25) return "medium";
  return "low";
}

export function requiresEDD(riskLevel: KYCRiskLevel, pepScreening: ScreeningResult): boolean {
  return riskLevel === "high" || pepScreening === "match";
}

// ── Factory ───────────────────────────────────────────────────────────

export function createKYCProfile(params: {
  case_slug: string;
  brain_id: string;
  org_id: string;
  customer_type: CustomerType;
  contact: KYCContactInfo;
  created_by: string;
  first_name?: string;
  last_name?: string;
  company_name?: string;
}): KYCCustomerProfile {
  const now = new Date().toISOString();
  return {
    id: `kyc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    case_slug: params.case_slug,
    brain_id: params.brain_id,
    org_id: params.org_id,
    customer_type: params.customer_type,
    first_name: params.first_name,
    last_name: params.last_name,
    company_name: params.company_name,
    contact: params.contact,
    identity_documents: [],
    risk_level: "low",
    risk_score: 0,
    risk_factors: [],
    pep_screening: "clear",
    sanctions_screening: "clear",
    adverse_media_screening: "clear",
    source_of_funds_verified: false,
    status: "pending",
    edd_required: false,
    edd_completed: false,
    created_by: params.created_by,
    created_at: now,
    updated_at: now,
  };
}

// ── Validation ────────────────────────────────────────────────────────

export interface KYCValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export function validateKYCProfile(profile: KYCCustomerProfile): KYCValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!profile.id) errors.push("ID is required");
  if (!profile.case_slug) errors.push("case_slug is required");
  if (!profile.brain_id) errors.push("brain_id is required");

  if (profile.customer_type === "individual") {
    if (!profile.first_name) errors.push("Individual requires first_name");
    if (!profile.last_name) errors.push("Individual requires last_name");
    if (!profile.date_of_birth) errors.push("Individual requires date_of_birth");
  }

  if (profile.customer_type === "legal_entity") {
    if (!profile.company_name) errors.push("Legal entity requires company_name");
    if (!profile.registration_number) errors.push("Legal entity requires registration_number");
  }

  if (profile.identity_documents.length === 0) {
    errors.push("At least one identity document is required");
  }

  if (profile.sanctions_screening === "match" && profile.status === "approved") {
    errors.push("Cannot approve customer with sanctions match");
  }

  if (profile.risk_level === "prohibited" && profile.status !== "rejected") {
    errors.push("prohibited risk level requires rejection");
  }

  if (profile.edd_required && !profile.edd_completed && profile.status === "approved") {
    errors.push("Cannot approve without completing EDD");
  }

  if (profile.source_of_funds_verified === false && profile.risk_level === "high") {
    warnings.push("High-risk customer should have verified source of funds");
  }

  return { valid: errors.length === 0, errors, warnings };
}

// ── Labels ────────────────────────────────────────────────────────────

export const RISK_LEVEL_LABELS: Record<KYCRiskLevel, string> = {
  low: "Niedrig",
  medium: "Mittel",
  high: "Hoch",
  prohibited: "Verboten",
};

export const KYC_STATUS_LABELS: Record<KYCStatus, string> = {
  pending: "Ausstehend",
  in_review: "In Prüfung",
  approved: "Freigegeben",
  rejected: "Abgelehnt",
  enhanced_due_diligence: "Verstärkte Sorgfaltspflicht",
};
