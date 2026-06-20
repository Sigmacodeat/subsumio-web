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
    monthlyEur: 290,
    stripePriceEnv: "STRIPE_PRICE_PRO",
    pages: 25_000,
    seats: 1,
  },
  team: {
    id: "team",
    name: "Team",
    monthlyEur: 490,
    stripePriceEnv: "STRIPE_PRICE_TEAM",
    pages: 100_000,
    seats: 5,
  },
};

export interface BillingPlanDisplay {
  id: string;
  name: string;
  price: string;
  features: string[];
  highlight?: boolean;
}

export const BILLING_PLANS_DISPLAY: BillingPlanDisplay[] = [
  {
    id: "free",
    name: "Free",
    price: "0 €",
    features: ["200 Seiten", "1 GB Dateispeicher", "100 Queries/Monat", "1 Brain", "Community-Support"],
  },
  {
    id: "pro",
    name: "Pro",
    price: "290 €/Monat",
    features: [
      "25.000 Seiten · 50 GB Cloud-Speicher",
      "2.000 KI-Anfragen/Mon. inklusive",
      "Fair-Use WhatsApp- & Dokumenten-Import",
      "24/7 Dream Cycle (Dedupe, Zitate, Widersprüche)",
      "Live-Verbrauchsanzeige — transparente Mehrkosten",
      "Priorisierter Support",
    ],
    highlight: true,
  },
  {
    id: "team",
    name: "Team",
    price: "490 €/Seat/Monat",
    features: [
      "Alles aus Pro",
      "Geteiltes Firmen-Gedächtnis",
      "10.000 KI-Anfragen/Seat/Mon. inklusive",
      "250 GB Cloud-Speicher pro Seat",
      "Zugriff pro Nutzer gescoped — fuzz-getestet, null Leaks",
      "Admin & Nutzungs-Analytics",
      "Onboarding-Session inklusive",
    ],
  },
];

export function isBillingConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export function stripePriceId(plan: "pro" | "team"): string | null {
  return process.env[BILLABLE_PLANS[plan].stripePriceEnv] ?? null;
}
