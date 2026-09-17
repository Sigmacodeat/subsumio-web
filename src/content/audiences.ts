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
        "Solo für Einzelanwältinnen und Einzelanwälte; Kanzlei ergänzt Massenimport, Rollen, geteiltes Kanzleiwissen und den Assistenten auf WhatsApp.",
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
    sub: "Allein starten und bei Bedarf geteiltes Kanzleiwissen und Rollen für das Team ergänzen.",
    tiers: [
      {
        id: "pro",
        name: "Solo",
        price: "249 €",
        period: "/Monat",
        blurb: "Für Einzelanwältinnen und Einzelanwälte.",
        features: [
          "1 Nutzer",
          "Akten- und Dokumentanalyse mit Fundstellen",
          "Rechtsrecherche und Fristen-Arbeitsbereich",
          "Word-Export und Mandantenportal",
          "75 GB verwalteter Cloud-Speicher",
          "Ohne Massenimport und Team-Verwaltung",
        ],
        cta: "Solo starten",
        href: "/signup?plan=pro",
      },
      {
        id: "team",
        name: "Kanzlei",
        price: "1.499 €",
        period: "/Monat, 5 Nutzer inkl.",
        blurb: "Für Teams mit gemeinsamem Kanzleiwissen und Zugriffsrechten pro Akte.",
        features: [
          "Alles aus Solo für 5 Nutzer",
          "Massenimport und geteiltes Kanzleiwissen",
          "Rollen und Zugriffe auf Aktenebene",
          "Assistent auf WhatsApp für das ganze Team",
          "Auswertungen für die Kanzleileitung, Einschulung und bevorzugter Support",
          "E-Mail-Import (.eml/.msg), WhatsApp Business, DocuSign",
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
          "Single Sign-On (SAML), individuelle Rollen und Aufbewahrungsregeln",
          "Übernahme aus Ihrem Dokumentenmanagement und Prüfung großer Dokumentmengen",
          "Individuelle Speicher- und Nutzungslimits",
          "Servicevereinbarung (SLA), Security Review und persönliche Einführung",
        ],
        cta: "Technik-Workshop buchen",
        href: "/contact?plan=enterprise",
      },
    ],
    footnote:
      "Solo und Kanzlei werden monatlich abgerechnet und sind monatlich kündbar. Nutzungslimits und Mehrverbrauch werden vor Abschluss ausgewiesen. Zzgl. USt., soweit anwendbar.",
  };
}
