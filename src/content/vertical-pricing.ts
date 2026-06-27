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
          price: "€399",
          period: "/seat/mo",
          blurb:
            "Solo practitioners exploring AI-assisted case work. Monthly billing, cancel any time. Up to 2 seats.",
          features: [
            "Managed EU hosting — no API keys",
            "Case Q&A with page-level citations",
            "200 AI queries/mo · 15 GB",
            "50 WhatsApp messages/mo",
            "ZPO deadlines + conflict check (§ 43a BRAO / § 10 RAO / BGFA)",
            "Email support",
            "Overage: €0.55/query · €0.30/WA msg",
          ],
          cta: "Try Starter",
          href: "/signup",
        },
        {
          id: "pro",
          name: "Professional",
          price: "€890",
          period: "/seat/mo",
          blurb: "Solo and small firms up to 4 seats. The full case brain, fully managed.",
          features: [
            "Managed EU hosting — no API keys",
            "Case Q&A with page-level citations",
            "1,000 AI queries/seat/mo · 75 GB/seat",
            "300 WhatsApp messages/mo (firm total)",
            "WhatsApp matter copilot + voice notes",
            "ZPO/BGB/ABGB deadlines + conflict check (§ 43a BRAO / § 10 RAO / BGFA)",
            "beA intake · RVG/BRAG fee calculator",
            "Priority support",
            "Overage: €0.45/query · €0.25/WA msg",
          ],
          cta: "Start Professional",
          href: "/signup",
        },
        {
          id: "team",
          name: "Kanzlei",
          price: "€1,290",
          period: "/seat/mo",
          blurb: "One shared firm brain, scoped per lawyer. From 5 seats.",
          features: [
            "Everything in Professional",
            "4,000 AI queries/seat/mo · 200 GB/seat",
            "1,000 WhatsApp messages/mo (firm total)",
            "Shared matter memory + firm-wide conflict checks",
            "Time tracking, expenses, invoicing & DATEV export",
            "Four-eyes approval + full audit trail",
            "Onboarding & dedicated support",
            "Overage: €0.40/query · €0.20/WA msg",
          ],
          cta: "Start Firm plan",
          href: "/signup",
          highlight: true,
        },
        {
          id: "ent",
          name: "Enterprise",
          price: "from €1,890",
          period: "/seat/mo",
          blurb: "Compliance-grade, on your infrastructure or EU cloud. From 20 seats.",
          features: [
            "15,000 AI queries/seat/mo (Fair Use beyond)",
            "5,000 WhatsApp messages/seat/mo",
            "500 GB storage/seat",
            "EU cloud or on-premise deployment",
            "DPA, SLA, SSO/SAML",
            "DMS / RA-MICRO / Advoware import",
            "Maximum-recall search mode",
            "Dedicated CSM · custom retention & storage",
            "Overage: €0.35/query · €0.15/WA msg",
          ],
          cta: "Request a demo",
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
          price: "399 €",
          period: "/Seat/Mon.",
          blurb:
            "Für Einzelanwälte, die KI-gestützte Aktenarbeit erkunden. Monatlich kündbar. Bis 2 Seats.",
          features: [
            "Verwaltetes EU-Hosting — keine API-Keys",
            "Akten-Q&A mit seitengenauen Zitaten",
            "200 KI-Anfragen/Mon. · 15 GB",
            "50 WhatsApp-Nachrichten/Mon.",
            "ZPO-Fristen + Kollisionsprüfung (§ 43a BRAO / § 10 RAO / BGFA)",
            "E-Mail-Support",
            "Mehrverbrauch: 0,55 €/Anfrage · 0,30 €/WA",
          ],
          cta: "Starter testen",
          href: "/signup",
        },
        {
          id: "pro",
          name: "Professional",
          price: "890 €",
          period: "/Seat/Mon.",
          blurb: "Einzel- und Kleinkanzleien bis 4 Seats. Das volle Akten-Gehirn, voll verwaltet.",
          features: [
            "Verwaltetes EU-Hosting — keine API-Keys",
            "Akten-Q&A mit seitengenauen Zitaten",
            "1.000 KI-Anfragen/Seat/Mon. · 75 GB/Seat",
            "300 WhatsApp-Nachrichten/Mon. (Kanzleigesamt)",
            "WhatsApp-Akten-Copilot + Sprachnotizen",
            "ZPO/BGB/ABGB-Fristen + Kollisionsprüfung (§ 43a BRAO / § 10 RAO / BGFA)",
            "beA-Eingang · RVG/BRAG-Rechner",
            "Priorisierter Support",
            "Mehrverbrauch: 0,45 €/Anfrage · 0,25 €/WA",
          ],
          cta: "Professional starten",
          href: "/signup",
        },
        {
          id: "team",
          name: "Kanzlei",
          price: "1.290 €",
          period: "/Seat/Mon.",
          blurb: "Ein gemeinsames Kanzlei-Gehirn, pro Anwalt gescoped. Ab 5 Seats.",
          features: [
            "Alles aus Professional",
            "4.000 KI-Anfragen/Seat/Mon. · 200 GB/Seat",
            "1.000 WhatsApp-Nachrichten/Mon. (Kanzleigesamt)",
            "Geteiltes Akten-Gedächtnis + kanzleiweite Kollisionsprüfung",
            "Zeiterfassung, Auslagen, Rechnungen & DATEV-Export",
            "Vier-Augen-Freigabe + vollständiger Audit-Trail",
            "Onboarding & dedizierter Support",
            "Mehrverbrauch: 0,40 €/Anfrage · 0,20 €/WA",
          ],
          cta: "Kanzlei starten",
          href: "/signup",
          highlight: true,
        },
        {
          id: "ent",
          name: "Enterprise",
          price: "ab 1.890 €",
          period: "/Seat/Mon.",
          blurb: "Compliance-Grade, auf deiner Infrastruktur oder EU-Cloud. Ab 20 Seats.",
          features: [
            "15.000 KI-Anfragen/Seat/Mon. (Fair Use darüber)",
            "5.000 WhatsApp-Nachrichten/Seat/Mon.",
            "500 GB Speicher/Seat",
            "EU-Cloud oder On-Premise-Deployment",
            "AVV, SLA, SSO/SAML",
            "DMS / RA-MICRO / Advoware-Import",
            "Maximaler Recall-Modus",
            "Dedizierter CSM · individuelle Aufbewahrung & Speicher",
            "Mehrverbrauch: 0,35 €/Anfrage · 0,15 €/WA",
          ],
          cta: "Demo anfragen",
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
