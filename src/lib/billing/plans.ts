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
    // €249/Monat — aligned with saas-pricing.ts (solo plan, 12× markup)
    // Updated from €179 → €249 based on competitive analysis 2026-08-29:
    // 13 unique features, 32-layer pipeline, above Irys ($299) and Legora ($300)
    monthlyEur: 249,
    stripePriceEnv: "STRIPE_PRICE_SOLO",
    pages: 50_000,
    seats: 1,
  },
  team: {
    id: "team",
    name: "Kanzlei",
    // €1.499/Monat für 5 Nutzer → €299/seat — aligned with saas-pricing.ts (kanzlei plan, 18× markup)
    // Updated from €999 → €1.499 based on competitive analysis 2026-08-29:
    // Full pipeline (32 layers + ensemble critic), 13 unique features, DACH-first
    monthlyEur: 1499,
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
    price: "249 €/Monat",
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
    price: "1.499 €/Monat · 5 Nutzer inklusive",
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

// ── Plan Mapping: Stripe (old) ↔ SaaS (new) ────────────────────────────
// The Stripe checkout flow uses legacy plan IDs "pro"/"team" (kept for
// backward compat with existing Stripe subscriptions). The SaaS billing
// system (saas-pricing.ts, billing.ts) uses "solo"/"kanzlei"/"enterprise".
// This mapping bridges the two worlds.

/** Map Stripe plan ID → SaaS PlanTier. */
export function toSaasPlan(
  stripePlan: "pro" | "team" | "enterprise" | "free"
): "solo" | "kanzlei" | "enterprise" | null {
  switch (stripePlan) {
    case "pro":
      return "solo";
    case "team":
      return "kanzlei";
    case "enterprise":
      return "enterprise";
    default:
      return null; // "free" and unknown → no SaaS plan
  }
}

/** Map SaaS PlanTier → Stripe plan ID. */
export function fromSaasPlan(
  saasPlan: "solo" | "kanzlei" | "enterprise"
): "pro" | "team" | "enterprise" {
  switch (saasPlan) {
    case "solo":
      return "pro";
    case "kanzlei":
      return "team";
    case "enterprise":
      return "enterprise";
  }
}

/** Get the SaaS plan for a user, resolving via Stripe plan → SaaS mapping.
 *  Returns null for free/unknown users (no SaaS billing). */
export function saasPlanForUser(plan: string): "solo" | "kanzlei" | "enterprise" | null {
  return toSaasPlan(plan as "pro" | "team" | "enterprise" | "free");
}
