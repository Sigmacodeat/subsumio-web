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
    monthlyEur: 890,
    stripePriceEnv: "STRIPE_PRICE_PRO",
    pages: 50_000,
    seats: 1,
  },
  team: {
    id: "team",
    name: "Team",
    monthlyEur: 1290,
    stripePriceEnv: "STRIPE_PRICE_TEAM",
    pages: 200_000,
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

// Display copy shown on the in-app billing page (/dashboard/billing).
// Must stay in sync with the canonical plan limits (src/lib/plans.ts PLAN_LIMITS)
// and the marketing copy (src/content/site.ts PRICING).
export const BILLING_PLANS_DISPLAY: BillingPlanDisplay[] = [
  {
    id: "free",
    name: "Community",
    price: "0 €",
    features: [
      "Self-hosted — dein Server, deine Keys",
      "100 KI-Anfragen/Mon. inklusive",
      "5 GB lokaler Speicher",
      "Akten-Q&A mit seitengenauen Zitaten",
      "Fristenverwaltung (ZPO/BGB/ABGB)",
      "Community-Support",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    price: "890 €/Nutzer/Mon.",
    features: [
      "Voll verwaltet — keine API-Keys nötig",
      "1.000 KI-Anfragen/Nutzer/Mon. inklusive",
      "75 GB Cloud-Speicher pro Nutzer",
      "300 WhatsApp-Nachrichten/Mon. inklusive",
      "Dream Cycle: Deduplizierung, Zitate, Widersprüche",
      "Live-Verbrauchsanzeige — transparente Mehrkosten",
      "Priorisierter Support",
      "Mehrverbrauch: 0,45 €/Anfrage · 0,25 €/WA",
    ],
    highlight: true,
  },
  {
    id: "team",
    name: "Team",
    price: "1.290 €/Nutzer/Mon.",
    features: [
      "Alles aus Pro",
      "Geteiltes Kanzleiwissen",
      "4.000 KI-Anfragen/Nutzer/Mon. inklusive",
      "200 GB Cloud-Speicher pro Nutzer",
      "1.000 WhatsApp-Nachrichten/Mon. inklusive",
      "Rollenbasierte Zugriffe pro Akte und Nutzer",
      "Admin- und Nutzungsanalyse",
      "Onboarding-Session inklusive",
      "Mehrverbrauch: 0,40 €/Anfrage · 0,20 €/WA",
    ],
  },
];

export function isBillingConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export function stripePriceId(plan: "pro" | "team"): string | null {
  return process.env[BILLABLE_PLANS[plan].stripePriceEnv] ?? null;
}

/** Reverse lookup: given a Stripe price ID, which plan does it belong to? */
export function planForPriceId(priceId: string | null | undefined): "pro" | "team" | null {
  if (!priceId) return null;
  for (const plan of Object.keys(BILLABLE_PLANS) as Array<"pro" | "team">) {
    if (stripePriceId(plan) === priceId) return plan;
  }
  return null;
}
