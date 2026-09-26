/**
 * Client-safe credit constants — no Node.js imports (pg, fs, etc.).
 * Imported by client components (pricing-page.tsx) to avoid pulling
 * server-only modules into the client bundle.
 */

export type CreditOperation =
  | "think"
  | "document_analysis"
  | "subsumption"
  | "agent"
  | "deadline_detect"
  | "frist_engine"
  | "case_scan";

export const CREDIT_COSTS: Record<CreditOperation, number> = {
  think: 1,
  document_analysis: 2,
  subsumption: 3,
  agent: 5,
  deadline_detect: 1,
  frist_engine: 0,
  // One matter in an on-demand case scan: a capped supervisor run (like "agent").
  case_scan: 5,
};

/**
 * Startguthaben der 30-Tage-Testphase. The marketing promise is "30 Tage voller
 * Zugriff, keine Kreditkarte" — a fresh account must be able to ask the
 * assistant, analyse a document and run the deadline detector without buying
 * a pack first. 100 credits ≈ the "Standard" pack; every credit-gated
 * operation costs 1–5 (see CREDIT_COSTS). Granted once per owner on first use
 * (see ensureTrialCredits) and expires after TRIAL_DAYS.
 */
export const TRIAL_CREDITS = 100;
/** Length of the free trial — the single source; src/lib/billing/trial.ts and
 *  every "30 Tage" in the website copy follow it (checked by price-drift.test.ts). */
export const TRIAL_DAYS = 30;

/** Validity of purchased credit packs, from the purchase date. The single
 *  source for the expiry the billing code sets and for the pricing page,
 *  FAQ and AGB § 4 (checked by price-drift.test.ts). */
export const CREDIT_VALIDITY_DAYS = 365;
/** Same validity in months, as the copy states it ("12 Monate"). */
export const CREDIT_VALIDITY_MONTHS = 12;

export interface CreditPack {
  id: string;
  name: string;
  credits: number;
  priceEur: number;
  /** Env var holding the Stripe price ID for this pack. */
  stripePriceEnv: string;
  savingsPct: number;
}

export const CREDIT_PACKS: CreditPack[] = [
  {
    id: "starter",
    name: "Starter",
    credits: 50,
    priceEur: 49,
    stripePriceEnv: "STRIPE_PRICE_CREDITS_50",
    savingsPct: 2,
  },
  {
    id: "standard",
    name: "Standard",
    credits: 100,
    priceEur: 89,
    stripePriceEnv: "STRIPE_PRICE_CREDITS_100",
    savingsPct: 11,
  },
  {
    id: "pro",
    name: "Pro",
    credits: 500,
    priceEur: 399,
    stripePriceEnv: "STRIPE_PRICE_CREDITS_500",
    savingsPct: 20,
  },
  {
    id: "firm",
    name: "Firm",
    credits: 2000,
    priceEur: 1499,
    stripePriceEnv: "STRIPE_PRICE_CREDITS_2000",
    savingsPct: 25,
  },
];

export function getCreditPack(packId: string): CreditPack | undefined {
  return CREDIT_PACKS.find((p) => p.id === packId);
}
