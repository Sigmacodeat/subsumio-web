/**
 * RCIID Billing — Automatische Abrechnung forensischer Untersuchungen.
 *
 * Forensische Untersuchungen durch RCIID werden als Auslagen (ExpenseEntry)
 * auf die Mandantenrechnung gebucht.
 *
 * Abrechnungsmodi:
 *   1. Flatrate: Fester Betrag aus RCIID pricing
 *   2. RVG-Auslage: Als Auslage für Gutachten/Sachverständige (VV 7002 Nr. 12)
 *
 * Integration:
 *   - ExpenseEntry in CaseFrontmatter.expenses[]
 *   - Automatische Zuordnung zur nächsten Rechnung
 *   - Audit-Log: rciid.billing_auto
 */

import type { ExpenseEntry } from "./legal-types";
import type { RciidCase, RciidCaseStatus } from "./rciid";

export type RciidBillingMode = "flat" | "rvg_auslage" | "hourly";

export interface RciidBillingConfig {
  mode: RciidBillingMode;
  /** Default flat fee if RCIID doesn't return pricing. */
  defaultFlatFee?: number;
  /** Default currency. */
  currency?: string;
  /** VAT rate for the expense (default: 0 — Auslagen are often net). */
  vatRate?: number;
  /** RVG Auslagenpauschale (VV 7002) — default 20 EUR. */
  rvgAuslagenpauschale?: number;
  /** Markup percentage on RCIID pricing (0 = pass-through, 0.15 = 15% markup). */
  markupPercent?: number;
}

const DEFAULT_CONFIG: Required<RciidBillingConfig> = {
  mode: "flat",
  defaultFlatFee: 2500,
  currency: "EUR",
  vatRate: 0,
  rvgAuslagenpauschale: 20,
  markupPercent: 0,
};

/**
 * Calculate the forensics fee based on RCIID pricing and billing config.
 */
export function calculateForensicsFee(
  rciidCase: Pick<RciidCase, "pricing">,
  config?: Partial<RciidBillingConfig>
): { amount: number; currency: string; type: "flat" | "hourly"; description: string } {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const pricing = rciidCase.pricing;

  if (cfg.mode === "rvg_auslage") {
    // RVG Auslagenpauschale VV 7002 — flat expense
    return {
      amount: cfg.rvgAuslagenpauschale,
      currency: cfg.currency,
      type: "flat",
      description: "Auslagenpauschale VV 7002 (forensische Untersuchung)",
    };
  }

  if (pricing && pricing.amount > 0) {
    const amount = pricing.amount * (1 + cfg.markupPercent);
    return {
      amount: Math.round(amount * 100) / 100,
      currency: pricing.currency || cfg.currency,
      type: pricing.type,
      description: `Forensische Untersuchung RCIID (${pricing.type === "hourly" ? "Stundenbasis" : "Pauschale"})`,
    };
  }

  // Fallback to default flat fee
  const amount = cfg.defaultFlatFee * (1 + cfg.markupPercent);
  return {
    amount: Math.round(amount * 100) / 100,
    currency: cfg.currency,
    type: "flat",
    description: "Forensische Krypto-Untersuchung (Pauschale)",
  };
}

/**
 * Create an ExpenseEntry for a completed RCIID investigation.
 * This expense is automatically added to the case's expenses array
 * and will appear on the next invoice.
 */
export function createForensicsExpense(
  caseSlug: string,
  rciidCase: Pick<RciidCase, "case_id" | "pricing" | "status">,
  config?: Partial<RciidBillingConfig>
): ExpenseEntry {
  const fee = calculateForensicsFee(rciidCase, config);
  const cfg = { ...DEFAULT_CONFIG, ...config };

  return {
    id: `rciid-expense-${rciidCase.case_id}-${Date.now()}`,
    description: `RCIID Krypto-Forensik (Case ${rciidCase.case_id}) — ${fee.description}`,
    date: new Date().toISOString().slice(0, 10),
    amount: fee.amount,
    vat_rate: cfg.vatRate,
    billable: true,
    billed: false,
  };
}

/**
 * Determine if a case is ready for auto-billing.
 * Only completed cases with pricing should be billed.
 */
export function isReadyForBilling(status: RciidCaseStatus): boolean {
  return status === "completed";
}

/**
 * Format a forensics expense description for the invoice.
 */
export function formatExpenseDescription(
  rciidCaseId: string,
  walletCount: number,
  fee: { amount: number; currency: string; type: string }
): string {
  return `RCIID Krypto-Forensik (${rciidCaseId}) — ${walletCount} Wallet(s) untersucht, ${fee.type === "hourly" ? "Stundenbasis" : "Pauschale"} ${fee.amount.toFixed(2)} ${fee.currency}`;
}

/**
 * Calculate the total billing amount including VAT.
 */
export function calculateTotalWithVat(
  amount: number,
  vatRate: number
): { net: number; vat: number; gross: number } {
  const net = Math.round(amount * 100) / 100;
  const vat = Math.round(net * vatRate * 100) / 100;
  const gross = Math.round((net + vat) * 100) / 100;
  return { net, vat, gross };
}
