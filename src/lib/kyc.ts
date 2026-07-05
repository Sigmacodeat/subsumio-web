/**
 * GwG/KYC-Automatisierung (§ 1 GwG, § 3 GwG)
 * ============================================
 * Provider interface for identity verification (IDnow etc.),
 * Transparenzregister query flow, risk score at mandate,
 * follow-up for document expiry via existing wiedervorlage route.
 */

export type KYCRiskLevel = "low" | "medium" | "high";

export type KYCStatus = "pending" | "in_progress" | "verified" | "failed" | "expired";

export interface KYCVerification {
  id: string;
  case_slug: string;
  client_name: string;
  client_email?: string;
  status: KYCStatus;
  provider: "idnow" | "video_ident" | "post_ident" | "manual";
  provider_reference?: string;
  verified_at?: string;
  expires_at?: string;
  risk_level: KYCRiskLevel;
  risk_factors: string[];
  transparenzregister_checked: boolean;
  transparenzregister_result?: {
    found: boolean;
    registered_persons?: string[];
    legal_form?: string;
  };
  pep_check: boolean;
  pep_match?: boolean;
  notes?: string;
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
  checkStatus(reference: string): Promise<{
    status: KYCStatus;
    verified_at?: string;
  }>;
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

  const level: KYCRiskLevel = factors.length >= 3 ? "high" : factors.length >= 1 ? "medium" : "low";

  return { level, factors };
}

export function createKYCVerification(input: {
  case_slug: string;
  client_name: string;
  client_email?: string;
  provider?: KYCVerification["provider"];
  risk_level?: KYCRiskLevel;
  risk_factors?: string[];
}): KYCVerification {
  const now = new Date().toISOString();
  return {
    id: `kyc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    case_slug: input.case_slug,
    client_name: input.client_name,
    client_email: input.client_email,
    status: "pending",
    provider: input.provider ?? "manual",
    risk_level: input.risk_level ?? "low",
    risk_factors: input.risk_factors ?? [],
    transparenzregister_checked: false,
    pep_check: false,
    created_at: now,
    updated_at: now,
  };
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
