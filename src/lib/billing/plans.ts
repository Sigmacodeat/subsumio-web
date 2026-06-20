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

export const BILLING_PLANS_DISPLAY: BillingPlanDisplay[] = [
  {
    id: "free",
    name: "Free",
    price: "0 €",
    features: [
      "200 Seiten",
      "1 GB Dateispeicher",
      "100 Queries/Monat",
      "1 Brain",
      "Community-Support",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    price: "890 €/Monat",
    features: [
      "1.000 KI-Anfragen/Mon. inklusive",
      "75 GB Cloud-Speicher",
      "300 WhatsApp-Nachrichten/Mon. inklusive",
      "Fair-Use WhatsApp- & Dokumenten-Import",
      "24/7 Dream Cycle (Dedupe, Zitate, Widersprüche)",
      "Live-Verbrauchsanzeige — transparente Mehrkosten",
      "Mehrverbrauch: 0,45 €/Anfrage · 0,25 €/WA",
      "Priorisierter Support",
    ],
    highlight: true,
  },
  {
    id: "team",
    name: "Team",
    price: "1.290 €/Seat/Monat",
    features: [
      "Alles aus Pro",
      "Geteiltes Firmen-Gedächtnis",
      "4.000 KI-Anfragen/Seat/Mon. inklusive",
      "200 GB Cloud-Speicher pro Seat",
      "1.000 WhatsApp-Nachrichten/Mon. inklusive",
      "Zugriff pro Nutzer gescoped — fuzz-getestet, null Leaks",
      "Admin & Nutzungs-Analytics",
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
