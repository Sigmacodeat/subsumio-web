// Billing plans — single source of truth for the checkout layer.
// Prices must stay in sync with src/content/site.ts PRICING (marketing copy).
// Stripe price IDs come from env so test/live modes switch without code changes.

import type { Plan } from "@/lib/auth/store";

export interface BillablePlan {
  id: Exclude<Plan, "free" | "enterprise">;
  name: string;
  /** EUR per month, for display + sanity checks. */
  monthlyEur: number;
  /** Env var holding the Stripe price ID. */
  stripePriceEnv: string;
  pages: number;
  seats: number;
}

export const BILLABLE_PLANS: Record<"pro" | "team", BillablePlan> = {
  pro: {
    id: "pro",
    name: "Pro",
    monthlyEur: 190,
    stripePriceEnv: "STRIPE_PRICE_PRO",
    pages: 25_000,
    seats: 1,
  },
  team: {
    id: "team",
    name: "Team",
    monthlyEur: 390,
    stripePriceEnv: "STRIPE_PRICE_TEAM",
    pages: 100_000,
    seats: 5,
  },
};

export function isBillingConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export function stripePriceId(plan: "pro" | "team"): string | null {
  return process.env[BILLABLE_PLANS[plan].stripePriceEnv] ?? null;
}
