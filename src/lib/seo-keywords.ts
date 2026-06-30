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
    "DATEV Export Kanzlei",
    "beA Anbindung",
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
    "§ 203 StGB Kanzleisoftware",
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
    "beA WhatsApp",
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
    "KI-Kanzleisoftware Berlin",
    "KI-Kanzleisoftware Zürich",
    "Anwaltssoftware Wien",
    "Anwaltssoftware Berlin",
    "Anwaltssoftware Zürich",
    "law firm software Vienna",
    "law firm software Berlin",
    "law firm software Zurich",
  ],

  // SuperBrain
  superbrain: [
    "Legal AI Engine",
    "KI Legal Brain",
    "SuperBrain Kanzlei",
    "Dream Cycle KI",
    "LEXam Benchmark",
    "5-Ebenen-Architektur KI",
    "legal AI knowledge graph",
    "DeepSeek legal reasoning",
    "Qwen3 fine-tuning legal",
    "AI contradiction detection legal",
    "KI Wissensgraph Kanzlei",
    "legal AI quality control",
    "Subsumio Legal Engine",
    "AI legal reasoning benchmark",
    "open-weight legal LLM",
  ],
};

export { SEO_KEYWORDS };

export function keywordsFor(page: keyof typeof SEO_KEYWORDS): Metadata["keywords"] {
  return [...SEO_KEYWORDS[page]];
}
