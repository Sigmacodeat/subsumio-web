// Subsumio pricing. Signup deep-links carry ?industry=legal so the product
// provisions the legal workspace.

import type { Lang, PricingTier } from "./site";

export interface VerticalPricing {
  title: string;
  sub: string;
  tiers: PricingTier[];
}

// industry key (signupIndustry) → bespoke pricing. Only verticals with a real
// override live here; everything else uses the global PRICING.
export const VERTICAL_PRICING: Record<Lang, Partial<Record<string, VerticalPricing>>> = {
  en: {
    legal: {
      title: "Pricing for law firms",
      sub: "Per seat, billed annually. Case synthesis, WhatsApp copilot and compliance infrastructure — on EU infrastructure you control.",
      tiers: [
        {
          id: "starter",
          name: "Starter",
          price: "€299",
          period: "/seat/mo",
          blurb:
            "Solo practitioners exploring AI-assisted case work. Monthly billing, cancel any time. Up to 2 seats.",
          features: [
            "Managed EU hosting — no API keys",
            "Case Q&A with page-level citations",
            "300 AI queries/mo · 25 GB",
            "100 WhatsApp messages/mo",
            "ZPO deadlines + §43a conflict check",
            "Email support",
            "Overage: €0.025/query · €0.20/WA msg",
          ],
          cta: "Try Starter",
          href: "/signup",
        },
        {
          id: "solo",
          name: "Professional",
          price: "€690",
          period: "/seat/mo",
          blurb: "Solo and small firms up to 4 seats. The full case brain, fully managed.",
          features: [
            "Managed EU hosting — no API keys",
            "Case Q&A with page-level citations",
            "1,500 AI queries/seat/mo · 50 GB/seat",
            "500 WhatsApp messages/mo (firm total)",
            "WhatsApp matter copilot + voice notes",
            "ZPO/BGB deadlines + §43a conflict check",
            "beA intake · RVG fee calculator",
            "Priority support",
            "Overage: €0.025/query · €0.20/WA msg",
          ],
          cta: "Start Professional",
          href: "/signup",
        },
        {
          id: "kanzlei",
          name: "Kanzlei",
          price: "€990",
          period: "/seat/mo",
          blurb: "One shared firm brain, scoped per lawyer. From 5 seats.",
          features: [
            "Everything in Professional",
            "8,000 AI queries/seat/mo · 150 GB/seat",
            "2,000 WhatsApp messages/mo (firm total)",
            "Shared matter memory + firm-wide conflict checks",
            "Time tracking, expenses, invoicing & DATEV export",
            "Four-eyes approval + full audit trail",
            "Onboarding & dedicated support",
            "Overage: €0.018/query · €0.12/WA msg",
          ],
          cta: "Start Kanzlei",
          href: "/signup",
          highlight: true,
        },
        {
          id: "ent",
          name: "Enterprise",
          price: "from €1,490",
          period: "/seat/mo",
          blurb: "Compliance-grade, on your infrastructure or EU cloud. From 20 seats.",
          features: [
            "Unlimited AI queries & WhatsApp (Fair Use)",
            "EU cloud or on-premise deployment",
            "DPA, SLA, SSO/SAML",
            "DMS / RA-MICRO / Advoware import",
            "Maximum-recall search mode",
            "Dedicated CSM · custom retention & storage",
          ],
          cta: "Talk to us",
          href: "mailto:hello@subsum.eu",
        },
      ],
    },
  },
  de: {
    legal: {
      title: "Preise für Kanzleien",
      sub: "Pro Seat, jährliche Abrechnung. Akten-Synthese, WhatsApp-Copilot und Compliance-Infrastruktur — auf EU-Infrastruktur, die du kontrollierst.",
      tiers: [
        {
          id: "starter",
          name: "Starter",
          price: "299 €",
          period: "/Seat/Mon.",
          blurb:
            "Für Einzelanwälte, die KI-gestützte Aktenarbeit erkunden. Monatlich kündbar. Bis 2 Seats.",
          features: [
            "Verwaltetes EU-Hosting — keine API-Keys",
            "Akten-Q&A mit seitengenauen Zitaten",
            "300 KI-Anfragen/Mon. · 25 GB",
            "100 WhatsApp-Nachrichten/Mon.",
            "ZPO-Fristen + Kollisionsprüfung §43a",
            "E-Mail-Support",
            "Mehrverbrauch: 0,025 €/Anfrage · 0,20 €/WA",
          ],
          cta: "Starter testen",
          href: "/signup",
        },
        {
          id: "solo",
          name: "Professional",
          price: "690 €",
          period: "/Seat/Mon.",
          blurb: "Einzel- und Kleinkanzleien bis 4 Seats. Das volle Akten-Gehirn, voll verwaltet.",
          features: [
            "Verwaltetes EU-Hosting — keine API-Keys",
            "Akten-Q&A mit seitengenauen Zitaten",
            "1.500 KI-Anfragen/Seat/Mon. · 50 GB/Seat",
            "500 WhatsApp-Nachrichten/Mon. (Kanzleigesamt)",
            "WhatsApp-Akten-Copilot + Sprachnotizen",
            "ZPO/BGB-Fristen + Kollisionsprüfung §43a",
            "beA-Eingang · RVG-Rechner",
            "Priorisierter Support",
            "Mehrverbrauch: 0,025 €/Anfrage · 0,20 €/WA",
          ],
          cta: "Professional starten",
          href: "/signup",
        },
        {
          id: "kanzlei",
          name: "Kanzlei",
          price: "990 €",
          period: "/Seat/Mon.",
          blurb: "Ein gemeinsames Kanzlei-Gehirn, pro Anwalt gescoped. Ab 5 Seats.",
          features: [
            "Alles aus Professional",
            "8.000 KI-Anfragen/Seat/Mon. · 150 GB/Seat",
            "2.000 WhatsApp-Nachrichten/Mon. (Kanzleigesamt)",
            "Geteiltes Akten-Gedächtnis + kanzleiweite Kollisionsprüfung",
            "Zeiterfassung, Auslagen, Rechnungen & DATEV-Export",
            "Vier-Augen-Freigabe + vollständiger Audit-Trail",
            "Onboarding & dedizierter Support",
            "Mehrverbrauch: 0,018 €/Anfrage · 0,12 €/WA",
          ],
          cta: "Kanzlei starten",
          href: "/signup",
          highlight: true,
        },
        {
          id: "ent",
          name: "Enterprise",
          price: "ab 1.490 €",
          period: "/Seat/Mon.",
          blurb: "Compliance-Grade, auf deiner Infrastruktur oder EU-Cloud. Ab 20 Seats.",
          features: [
            "Unbegrenzte KI-Anfragen & WhatsApp (Fair Use)",
            "EU-Cloud oder On-Premise-Deployment",
            "AVV, SLA, SSO/SAML",
            "DMS / RA-MICRO / Advoware-Import",
            "Maximaler Recall-Modus",
            "Dedizierter CSM · individuelle Aufbewahrung & Speicher",
          ],
          cta: "Kontakt aufnehmen",
          href: "mailto:hello@subsum.eu",
        },
      ],
    },
  },
};

export function pricingForIndustry(
  lang: Lang,
  industry: string | null | undefined
): VerticalPricing | null {
  if (industry !== "legal") return null;
  return VERTICAL_PRICING[lang].legal ?? null;
}
