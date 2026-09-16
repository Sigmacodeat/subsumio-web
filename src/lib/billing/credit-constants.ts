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
  | "frist_engine";

export const CREDIT_COSTS: Record<CreditOperation, number> = {
  think: 1,
  document_analysis: 2,
  subsumption: 3,
  agent: 5,
  deadline_detect: 1,
  frist_engine: 0,
};

/**
 * Startguthaben der 14-Tage-Testphase. The marketing promise is "14 Tage voller
 * Zugriff, keine Kreditkarte" — a fresh account must be able to ask the
 * assistant, analyse a document and run the deadline detector without buying
 * a pack first. 100 credits ≈ the "Standard" pack; every credit-gated
 * operation costs 1–5 (see CREDIT_COSTS). Granted once per owner on first use
 * (see ensureTrialCredits) and expires after TRIAL_DAYS.
 */
export const TRIAL_CREDITS = 100;
export const TRIAL_DAYS = 14;

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
