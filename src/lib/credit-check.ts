/**
 * Mandanten-Bonitätsprüfung (Credit Check)
 * ==========================================
 * Optional credit check via Creditreform API at intake.
 * Opt-in, GDPR notice required in UI.
 */

export type CreditCheckStatus = "pending" | "completed" | "failed" | "opted_out";

export type CreditRiskLevel = "low" | "medium" | "high" | "unknown";

export interface CreditCheckResult {
  id: string;
  case_slug?: string;
  client_name: string;
  client_company?: string;
  status: CreditCheckStatus;
  risk_level: CreditRiskLevel;
  score?: number;
  credit_limit?: number;
  payment_behavior?: "good" | "average" | "poor" | "unknown";
  negative_features?: string[];
  checked_at?: string;
  provider: "creditreform" | "manual" | "opted_out";
  gdpr_consent: boolean;
  notes?: string;
  created_at: string;
}

export function createCreditCheck(input: {
  case_slug?: string;
  client_name: string;
  client_company?: string;
  gdpr_consent: boolean;
  provider?: CreditCheckResult["provider"];
}): CreditCheckResult {
  const now = new Date().toISOString();
  return {
    id: `credit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    case_slug: input.case_slug,
    client_name: input.client_name,
    client_company: input.client_company,
    status: input.gdpr_consent ? "pending" : "opted_out",
    risk_level: "unknown",
    provider: input.provider ?? "manual",
    gdpr_consent: input.gdpr_consent,
    created_at: now,
  };
}

export function interpretCreditScore(score: number): {
  risk_level: CreditRiskLevel;
  payment_behavior: CreditCheckResult["payment_behavior"];
} {
  if (score >= 90) return { risk_level: "low", payment_behavior: "good" };
  if (score >= 70) return { risk_level: "low", payment_behavior: "average" };
  if (score >= 50) return { risk_level: "medium", payment_behavior: "average" };
  if (score >= 30) return { risk_level: "high", payment_behavior: "poor" };
  return { risk_level: "high", payment_behavior: "poor" };
}

export const GDPR_NOTICE_DE =
  "Zur Durchführung der Bonitätsprüfung werden Daten des Mandanten an einen Auskunftei-Partner (Creditreform) übermittelt. " +
  "Der Mandant willigt hierin ausdrücklich ein. Die Einwilligung kann jederzeit widerrufen werden.";
