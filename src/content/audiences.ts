import type { PricingTier } from "@/content/site";

export type Audience = "professional";

type AudienceCopy = {
  eyebrow: string;
  title: string;
  description: string;
  href: string;
  cta: string;
};

export function audienceCopy(): Record<Audience, AudienceCopy> {
  return {
    professional: {
      eyebrow: "Für Kanzleien & Rechtsabteilungen",
      title: "Akten und Kanzleiwissen bearbeiten",
      description:
        "Solo für einzelne Berufsträger; Kanzlei ergänzt Massen-Ingest, Rollen, geteiltes Wissen und Kommunikations-Workflows.",
      href: "/solutions/law-firms",
      cta: "Zum Kanzleizugang",
    },
  };
}

export function professionalPricing(): {
  title: string;
  sub: string;
  tiers: PricingTier[];
  footnote: string;
} {
  return {
    title: "Tarife für Kanzleien & Rechtsabteilungen",
    sub: "Allein starten und bei Bedarf geteiltes Kanzleiwissen sowie kontrollierte Team-Workflows ergänzen.",
    tiers: [
      {
        id: "pro",
        name: "Solo",
        price: "249 €",
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
        price: "1.499 €",
        period: "/Monat, 5 Nutzer inkl.",
        blurb: "Für Teams mit gemeinsamem, berechtigtem Kanzleiwissen und Kommunikationsprozessen.",
        features: [
          "Alles aus Solo für 5 Nutzer",
          "Massen-Ingest und geteiltes Kanzleiwissen",
          "Rollen und Zugriffe auf Aktenebene",
          "WhatsApp-Intake und Kommunikations-Workflows",
          "Admin-Analyse, Onboarding und Prioritäts-Support",
          "Buchhaltungs-, Kalender- und Workflow-Integrationen",
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
