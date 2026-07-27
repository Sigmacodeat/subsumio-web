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
    name: "Solo",
    monthlyEur: 179,
    stripePriceEnv: "STRIPE_PRICE_SOLO",
    pages: 50_000,
    seats: 1,
  },
  team: {
    id: "team",
    name: "Kanzlei",
    monthlyEur: 999,
    stripePriceEnv: "STRIPE_PRICE_KANZLEI",
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
    name: "Solo",
    price: "179 €/Monat",
    features: [
      "Voll verwaltet — keine API-Keys nötig",
      "1 Nutzer",
      "1.000 KI-Anfragen/Mon. inklusive",
      "75 GB Cloud-Speicher pro Nutzer",
      "Dream Cycle: Deduplizierung, Zitate, Widersprüche",
      "Live-Verbrauchsanzeige — transparente Mehrkosten",
      "Priorisierter Support",
      "Ohne Massen-Ingest und Team-Administration",
    ],
    highlight: true,
  },
  {
    id: "team",
    name: "Kanzlei",
    price: "999 €/Monat · 5 Nutzer inklusive",
    features: [
      "Alles aus Solo für 5 Nutzer",
      "Geteiltes Kanzleiwissen",
      "4.000 KI-Anfragen/Nutzer/Mon. inklusive",
      "200 GB Cloud-Speicher pro Nutzer",
      "1.000 WhatsApp-Nachrichten/Mon. inklusive",
      "Rollenbasierte Zugriffe pro Akte und Nutzer",
      "Admin- und Nutzungsanalyse",
      "Onboarding-Session inklusive",
      "Massen-Ingest und WhatsApp-Workflows",
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
