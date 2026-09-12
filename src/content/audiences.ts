import type { Lang, PricingTier } from "@/content/site";

export type Audience = "professional";

type AudienceCopy = {
  eyebrow: string;
  title: string;
  description: string;
  href: string;
  cta: string;
};

const isEnglish = (lang: Lang) => lang === "en";
const isSwiss = (lang: Lang) => lang === "ch";

export function audienceCopy(lang: Lang): Record<Audience, AudienceCopy> {
  if (isEnglish(lang)) {
    return {
      professional: {
        eyebrow: "For legal professionals",
        title: "Run matters and firm knowledge",
        description:
          "Solo access for one professional; firm plans add bulk ingestion, roles, shared knowledge and communication workflows.",
        href: "/kanzlei",
        cta: "Go to professional access",
      },
    };
  }

  return {
    professional: {
      eyebrow: "Für Kanzleien & Rechtsabteilungen",
      title: "Akten und Kanzleiwissen bearbeiten",
      description:
        "Solo für einzelne Berufsträger; Kanzlei ergänzt Massen-Ingest, Rollen, geteiltes Wissen und Kommunikations-Workflows.",
      href: "/kanzlei",
      cta: "Zum Kanzleizugang",
    },
  };
}

export function professionalPricing(lang: Lang): {
  title: string;
  sub: string;
  tiers: PricingTier[];
  footnote: string;
} {
  const currency = isSwiss(lang) ? "CHF" : "€";
  const amount = (value: string) =>
    isSwiss(lang) ? `${currency} ${value}` : `${value} ${currency}`;

  if (isEnglish(lang)) {
    return {
      title: "Plans for legal professionals",
      sub: "Start alone, then add shared firm knowledge and controlled workflows when your team grows.",
      tiers: [
        {
          id: "pro",
          name: "Solo",
          price: "€249",
          period: "/month",
          blurb: "For one lawyer or legal professional working with their own matters.",
          features: [
            "1 user",
            "Matter and document analysis with citations",
            "Legal research and deadline workspace",
            "Word export and client portal",
            "75 GB managed EU cloud storage",
            "No bulk ingestion or team administration",
          ],
          cta: "Start Solo",
          href: "/signup?plan=pro",
        },
        {
          id: "team",
          name: "Firm",
          price: "€1.499",
          period: "/month, 5 users included",
          blurb: "For firms that need a shared, permissioned knowledge and communication layer.",
          features: [
            "Everything in Solo, for 5 users",
            "Bulk ingestion and shared firm knowledge",
            "Matter-level roles and access controls",
            "WhatsApp intake and communication workflows",
            "Admin analytics, onboarding and priority support",
            "DATEV, calendar and workflow integrations",
          ],
          cta: "Start firm trial",
          href: "/signup?plan=team",
          highlight: true,
        },
        {
          id: "ent",
          name: "Enterprise",
          price: "Custom",
          period: "",
          blurb:
            "For regulated organizations with infrastructure, identity and migration requirements.",
          features: [
            "EU cloud or on-premise deployment",
            "SSO/SAML, custom roles and retention",
            "DMS migration and high-volume review",
            "Custom storage and usage limits",
            "SLA, security review and dedicated onboarding",
          ],
          cta: "Book a technical workshop",
          href: "/contact?plan=enterprise",
        },
      ],
      footnote:
        "Solo and Firm are billed monthly and can be canceled monthly. Usage limits and any overages are shown before checkout. VAT may apply.",
    };
  }

  return {
    title: "Tarife für Kanzleien & Rechtsabteilungen",
    sub: "Allein starten und bei Bedarf geteiltes Kanzleiwissen sowie kontrollierte Team-Workflows ergänzen.",
    tiers: [
      {
        id: "pro",
        name: "Solo",
        price: amount("249"),
        period: "/Monat",
        blurb: "Für einen Berufsträger oder Legal Professional mit eigenen Akten.",
        features: [
          "1 Nutzer",
          "Akten- und Dokumentanalyse mit Fundstellen",
          "Rechtsrecherche und Fristen-Arbeitsbereich",
          "Word-Export und Mandantenportal",
          "75 GB verwalteter Cloud-Speicher",
          "Ohne Massen-Ingest und Team-Administration",
        ],
        cta: "Solo starten",
        href: "/signup?plan=pro",
      },
      {
        id: "team",
        name: "Kanzlei",
        price: amount("1.499"),
        period: "/Monat, 5 Nutzer inkl.",
        blurb: "Für Teams mit gemeinsamem, berechtigtem Kanzleiwissen und Kommunikationsprozessen.",
        features: [
          "Alles aus Solo für 5 Nutzer",
          "Massen-Ingest und geteiltes Kanzleiwissen",
          "Rollen und Zugriffe auf Aktenebene",
          "WhatsApp-Intake und Kommunikations-Workflows",
          "Admin-Analyse, Onboarding und Prioritäts-Support",
          "DATEV-, Kalender- und Workflow-Integrationen",
        ],
        cta: "Kanzlei testen",
        href: "/signup?plan=team",
        highlight: true,
      },
      {
        id: "ent",
        name: "Enterprise",
        price: "Auf Anfrage",
        period: "",
        blurb:
          "Für regulierte Organisationen mit Anforderungen an Infrastruktur, Identität und Migration.",
        features: [
          "EU-Cloud oder On-Premise-Betrieb",
          "SSO/SAML, individuelle Rollen und Aufbewahrung",
          "DMS-Migration und High-Volume-Review",
          "Individuelle Speicher- und Nutzungslimits",
          "SLA, Security Review und dediziertes Onboarding",
        ],
        cta: "Technik-Workshop buchen",
        href: "/contact?plan=enterprise",
      },
    ],
    footnote:
      "Solo und Kanzlei werden monatlich abgerechnet und sind monatlich kündbar. Nutzungslimits und Mehrverbrauch werden vor Abschluss ausgewiesen. Zzgl. USt., soweit anwendbar.",
  };
}
