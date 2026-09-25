import type { Metadata } from "next";

const SEO_KEYWORDS = {
  // Root — already in layout.tsx, kept for reference
  root: [
    "Kanzleisoftware",
    "KI Kanzleisoftware",
    "Anwaltssoftware",
    "Legal AI software",
    "self-hosted legal software",
    "GDPR legal software",
  ],

  // Feature-specific
  features: [
    "KI Rechtsrecherche",
    "KI Schriftsatz Generator",
    "Fristenberechnung Software",
    "Kollisionsprüfung Kanzlei",
    "Aktenverwaltung Software",
    "Buchhaltungsexport Kanzlei",
    "KI Dokumentenmanagement",
    "Vertragsanalyse KI",
    "legal AI features",
    "AI legal research tool",
    "contract analysis AI",
  ],

  // Pricing
  pricing: [
    "Kanzleisoftware Preise",
    "Anwaltssoftware Kosten",
    "KI Kanzlei Lizenz",
    "legal software pricing",
    "law firm software cost",
    "SaaS Kanzleisoftware",
  ],

  // Security
  security: [
    "Kanzleisoftware DSGVO",
    "Anwaltssoftware Sicherheit",
    "Berufsgeheimnis KI",
    "§ 9 Abs. 2 RAO Kanzleisoftware",
    "On-Premise Kanzleisoftware",
    "EU-Cloud Kanzlei",
    "legal software GDPR",
    "self-hosted legal AI",
    "law firm data protection",
  ],

  // About
  about: [
    "Subsumio",
    "KI Kanzlei Startup",
    "Legal Tech Österreich",
    "Legal Tech Startup",
    "AI legal company",
  ],

  // Download
  download: [
    "Kanzleisoftware Download",
    "Anwaltssoftware Installieren",
    "Subsumio Download",
    "legal software download",
    "self-hosted legal software install",
  ],

  // Contact
  contact: [
    "Kanzleisoftware Kontakt",
    "Anwaltssoftware Demo",
    "Legal AI Demo",
    "law firm software demo",
  ],

  // WhatsApp
  whatsapp: [
    "WhatsApp Kanzlei",
    "WhatsApp Anwaltssoftware",
    "Kanzlei Kommunikation",
    "legal WhatsApp integration",
  ],

  // Mobile
  mobile: [
    "Kanzleisoftware Mobile",
    "Anwaltssoftware App",
    "KI Kanzlei App",
    "legal software mobile",
    "law firm app",
  ],

  // Partners
  partners: [
    "Kanzleisoftware Partner",
    "Legal Tech Partner Programm",
    "Legal AI Reseller",
    "law firm software partner",
  ],

  // Blog
  blog: [
    "Legal Tech Blog",
    "KI Anwalt Blog",
    "Kanzleisoftware Blog",
    "Legal AI insights",
    "law firm technology blog",
  ],

  // Features methodology
  benchmark: [
    "KI Legal Benchmark",
    "Legal AI Evaluation",
    "Kanzleisoftware Vergleich",
    "AI legal software benchmark",
    "legal AI comparison",
  ],

  // Cities
  cities: [
    "KI-Kanzleisoftware Wien",
    "Anwaltssoftware Wien",
    "Kanzleisoftware Österreich",
    "Anwaltssoftware Österreich",
    "law firm software Vienna",
    "law firm software Austria",
  ],

  // SuperBrain
  superbrain: [
    "SuperBrain Kanzlei",
    "KI Kanzleiwissen",
    "Kanzleigedächtnis KI",
    "KI Widerspruchsprüfung Akten",
    "belegte KI-Antworten Anwalt",
    "KI Qualitätsprüfung Kanzlei",
    "Kanzleisoftware KI Österreich",
    "Fundstellen KI Rechtsanwalt",
  ],
};

export { SEO_KEYWORDS };

/** DE-Markt: nur die Einträge ersetzen, die AT-Recht/AT-Orte nennen. */
const SEO_KEYWORDS_DE: Partial<Record<keyof typeof SEO_KEYWORDS, string[]>> = {
  // webERV-Versand existiert noch nicht — kein Keyword dafür (Claims-Guard).
  features: [...SEO_KEYWORDS.features, "beA Anbindung"],
  security: SEO_KEYWORDS.security.map((k) =>
    k === "§ 9 Abs. 2 RAO Kanzleisoftware" ? "§ 43a Abs. 2 BRAO Kanzleisoftware" : k
  ),
  about: SEO_KEYWORDS.about.map((k) =>
    k === "Legal Tech Österreich" ? "Legal Tech Deutschland" : k
  ),
  cities: [
    "KI-Kanzleisoftware Berlin",
    "Anwaltssoftware München",
    "Kanzleisoftware Deutschland",
    "Anwaltssoftware Deutschland",
    "law firm software Germany",
    "law firm software Berlin",
  ],
  superbrain: SEO_KEYWORDS.superbrain.map((k) =>
    k === "Kanzleisoftware KI Österreich" ? "Kanzleisoftware KI Deutschland" : k
  ),
};

export function keywordsFor(
  page: keyof typeof SEO_KEYWORDS,
  market: "at" | "de" = "at"
): Metadata["keywords"] {
  const list = market === "de" ? (SEO_KEYWORDS_DE[page] ?? SEO_KEYWORDS[page]) : SEO_KEYWORDS[page];
  return [...list];
}
