export type Lang = "de" | "en";

export type Status = true | false | "partial";

export interface CompareRow {
  feature: string;
  subsumio: Status;
  harvey: Status;
  legora: Status;
  josef: Status;
  cocounsel: Status;
}

export interface CompetitorContent {
  badge: string;
  title: string;
  claim: string;
  sub: string;
  tableTitle: string;
  subsumioLabel: string;
  harveyLabel: string;
  legoraLabel: string;
  josefLabel: string;
  cocounselLabel: string;
  yes: string;
  no: string;
  partial: string;
  rows: CompareRow[];
  verdictTitle: string;
  verdict: string;
  footnote: string;
}

const DE: CompetitorContent = {
  badge: "Vergleich",
  title: "Wie wir uns gegen",
  claim: "Harvey, Legora & Co. positionieren.",
  sub: "Keine Marketing-Behauptungen — nur ein Fakten-Vergleich basierend auf öffentlich dokumentierten Features.",
  tableTitle: "Feature-Matrix",
  subsumioLabel: "Subsumio",
  harveyLabel: "Harvey AI",
  legoraLabel: "Legora",
  josefLabel: "Josef",
  cocounselLabel: "CoCounsel",
  yes: "Ja",
  no: "Nein",
  partial: "Teilweise",
  rows: [
    {
      feature: "Aktenverwaltung (Case Management)",
      subsumio: true,
      harvey: false,
      legora: "partial",
      josef: "partial",
      cocounsel: false,
    },
    {
      feature: "Dokumenten-Vault & DMS",
      subsumio: true,
      harvey: false,
      legora: "partial",
      josef: "partial",
      cocounsel: false,
    },
    {
      feature: "Fristen-Management & Erinnerungen",
      subsumio: true,
      harvey: false,
      legora: false,
      josef: false,
      cocounsel: false,
    },
    {
      feature: "Zeiterfassung & Rechnungsstellung",
      subsumio: true,
      harvey: false,
      legora: false,
      josef: false,
      cocounsel: false,
    },
    {
      feature: "KI-Legal Research mit Fundstellen",
      subsumio: true,
      harvey: true,
      legora: true,
      josef: false,
      cocounsel: true,
    },
    {
      feature: "Vertragsentwürfe & Redlining",
      subsumio: true,
      harvey: true,
      legora: true,
      josef: true,
      cocounsel: true,
    },
    {
      feature: "Semantisches Brain / Knowledge Base",
      subsumio: true,
      harvey: "partial",
      legora: "partial",
      josef: false,
      cocounsel: "partial",
    },
    {
      feature: "Self-Hosting (On-Premise)",
      subsumio: true,
      harvey: false,
      legora: false,
      josef: false,
      cocounsel: false,
    },
    {
      feature: "EU-Datenspeicherung (DSGVO)",
      subsumio: true,
      harvey: false,
      legora: true,
      josef: false,
      cocounsel: false,
    },
    {
      feature: "Native Mobile App",
      subsumio: true,
      harvey: true,
      legora: "partial",
      josef: false,
      cocounsel: false,
    },
    {
      feature: "WhatsApp-Copilot",
      subsumio: true,
      harvey: false,
      legora: false,
      josef: false,
      cocounsel: false,
    },
    {
      feature: "REST API & Connectors",
      subsumio: true,
      harvey: "partial",
      legora: "partial",
      josef: "partial",
      cocounsel: "partial",
    },
    {
      feature: "GoBD / Verfahrensdokumentation",
      subsumio: true,
      harvey: false,
      legora: false,
      josef: false,
      cocounsel: false,
    },
    {
      feature: "BEA / eIDAS-Integration",
      subsumio: true,
      harvey: false,
      legora: false,
      josef: false,
      cocounsel: false,
    },
    {
      feature: "DATEV-Export",
      subsumio: true,
      harvey: false,
      legora: false,
      josef: false,
      cocounsel: false,
    },
    {
      feature: "Offline-Modus",
      subsumio: true,
      harvey: false,
      legora: false,
      josef: false,
      cocounsel: false,
    },
    {
      feature: "Agenten-System (Skills, Eval)",
      subsumio: true,
      harvey: true,
      legora: true,
      josef: false,
      cocounsel: true,
    },
    {
      feature: "Mandantenportal",
      subsumio: true,
      harvey: false,
      legora: true,
      josef: "partial",
      cocounsel: false,
    },
    {
      feature: "DSGVO-Anonymisierung",
      subsumio: true,
      harvey: false,
      legora: false,
      josef: false,
      cocounsel: false,
    },
    {
      feature: "Multi-Jurisdiction (DE/AT/CH)",
      subsumio: true,
      harvey: false,
      legora: "partial",
      josef: false,
      cocounsel: false,
    },
    {
      feature: "Juristische Übersetzung (KI)",
      subsumio: true,
      harvey: false,
      legora: true,
      josef: false,
      cocounsel: false,
    },
    {
      feature: "Obligation Tracking",
      subsumio: true,
      harvey: false,
      legora: false,
      josef: false,
      cocounsel: false,
    },
    {
      feature: "Klausel-Bibliothek",
      subsumio: true,
      harvey: true,
      legora: true,
      josef: false,
      cocounsel: false,
    },
    {
      feature: "Collaborative Review Queue",
      subsumio: true,
      harvey: true,
      legora: true,
      josef: false,
      cocounsel: false,
    },
    {
      feature: "Versionshistorie (Audit-Trail)",
      subsumio: true,
      harvey: "partial",
      legora: "partial",
      josef: false,
      cocounsel: false,
    },
    {
      feature: "Multi-Model-Selector (LLM)",
      subsumio: true,
      harvey: true,
      legora: true,
      josef: false,
      cocounsel: true,
    },
    {
      feature: "Word Add-in",
      subsumio: true,
      harvey: true,
      legora: true,
      josef: false,
      cocounsel: true,
    },
  ],
  verdictTitle: "Das Fazit",
  verdict:
    "Harvey, CoCounsel und Legora sind exzellente KI-Forschungswerkzeuge — aber keine Kanzlei-Software. Josef automatisiert Dokumente, verwaltet aber keine Akten. Subsumio ist die einzige Plattform, die KI-Brain, Aktenverwaltung, Fristen, Rechnungsstellung, GoBD, BEA und Self-Hosting in einem System vereint.",
  footnote:
    "Quelle: Öffentliche Produktbeschreibungen und APIs der genannten Anbieter (Stand Juni 2026). Harvey = Harvey AI (300M $ ARR, 11Mrd $ Bewertung), Legora = ehemals Leya (Schweden, 100M $ ARR, 5,6Mrd $ Bewertung), Josef = Josef (Australien), CoCounsel = Thomson Reuters.",
};

const EN: CompetitorContent = {
  badge: "Comparison",
  title: "How we stack up against",
  claim: "Harvey, Legora & Co.",
  sub: "No marketing claims — just a fact-based comparison drawn from publicly documented features.",
  tableTitle: "Feature Matrix",
  subsumioLabel: "Subsumio",
  harveyLabel: "Harvey AI",
  legoraLabel: "Legora",
  josefLabel: "Josef",
  cocounselLabel: "CoCounsel",
  yes: "Yes",
  no: "No",
  partial: "Partial",
  rows: [
    {
      feature: "Case Management",
      subsumio: true,
      harvey: false,
      legora: "partial",
      josef: "partial",
      cocounsel: false,
    },
    {
      feature: "Document Vault & DMS",
      subsumio: true,
      harvey: false,
      legora: "partial",
      josef: "partial",
      cocounsel: false,
    },
    {
      feature: "Deadline Management & Reminders",
      subsumio: true,
      harvey: false,
      legora: false,
      josef: false,
      cocounsel: false,
    },
    {
      feature: "Time Tracking & Invoicing",
      subsumio: true,
      harvey: false,
      legora: false,
      josef: false,
      cocounsel: false,
    },
    {
      feature: "AI Legal Research with Citations",
      subsumio: true,
      harvey: true,
      legora: true,
      josef: false,
      cocounsel: true,
    },
    {
      feature: "Contract Drafting & Redlining",
      subsumio: true,
      harvey: true,
      legora: true,
      josef: true,
      cocounsel: true,
    },
    {
      feature: "Semantic Brain / Knowledge Base",
      subsumio: true,
      harvey: "partial",
      legora: "partial",
      josef: false,
      cocounsel: "partial",
    },
    {
      feature: "Self-Hosting (On-Premise)",
      subsumio: true,
      harvey: false,
      legora: false,
      josef: false,
      cocounsel: false,
    },
    {
      feature: "EU Data Residency (GDPR)",
      subsumio: true,
      harvey: false,
      legora: true,
      josef: false,
      cocounsel: false,
    },
    {
      feature: "Native Mobile App",
      subsumio: true,
      harvey: true,
      legora: "partial",
      josef: false,
      cocounsel: false,
    },
    {
      feature: "WhatsApp Copilot",
      subsumio: true,
      harvey: false,
      legora: false,
      josef: false,
      cocounsel: false,
    },
    {
      feature: "REST API & Connectors",
      subsumio: true,
      harvey: "partial",
      legora: "partial",
      josef: "partial",
      cocounsel: "partial",
    },
    {
      feature: "GoBD / Process Documentation",
      subsumio: true,
      harvey: false,
      legora: false,
      josef: false,
      cocounsel: false,
    },
    {
      feature: "BEA / eIDAS Integration",
      subsumio: true,
      harvey: false,
      legora: false,
      josef: false,
      cocounsel: false,
    },
    {
      feature: "DATEV Export",
      subsumio: true,
      harvey: false,
      legora: false,
      josef: false,
      cocounsel: false,
    },
    {
      feature: "Offline Mode",
      subsumio: true,
      harvey: false,
      legora: false,
      josef: false,
      cocounsel: false,
    },
    {
      feature: "Agent System (Skills, Eval)",
      subsumio: true,
      harvey: true,
      legora: true,
      josef: false,
      cocounsel: true,
    },
    {
      feature: "Client Portal",
      subsumio: true,
      harvey: false,
      legora: true,
      josef: "partial",
      cocounsel: false,
    },
    {
      feature: "GDPR Anonymization",
      subsumio: true,
      harvey: false,
      legora: false,
      josef: false,
      cocounsel: false,
    },
    {
      feature: "Multi-Jurisdiction (DE/AT/CH)",
      subsumio: true,
      harvey: false,
      legora: "partial",
      josef: false,
      cocounsel: false,
    },
    {
      feature: "Legal Translation (AI)",
      subsumio: true,
      harvey: false,
      legora: true,
      josef: false,
      cocounsel: false,
    },
    {
      feature: "Obligation Tracking",
      subsumio: true,
      harvey: false,
      legora: false,
      josef: false,
      cocounsel: false,
    },
    {
      feature: "Clause Library",
      subsumio: true,
      harvey: true,
      legora: true,
      josef: false,
      cocounsel: false,
    },
    {
      feature: "Collaborative Review Queue",
      subsumio: true,
      harvey: true,
      legora: true,
      josef: false,
      cocounsel: false,
    },
    {
      feature: "Version History (Audit Trail)",
      subsumio: true,
      harvey: "partial",
      legora: "partial",
      josef: false,
      cocounsel: false,
    },
    {
      feature: "Multi-Model Selector (LLM)",
      subsumio: true,
      harvey: true,
      legora: true,
      josef: false,
      cocounsel: true,
    },
    {
      feature: "Word Add-in",
      subsumio: true,
      harvey: true,
      legora: true,
      josef: false,
      cocounsel: true,
    },
  ],
  verdictTitle: "The Verdict",
  verdict:
    "Harvey, CoCounsel and Legora are excellent AI research tools — but not law practice software. Josef automates documents, yet does not manage cases. Subsumio is the only platform that unites AI brain, case management, deadlines, invoicing, GoBD, BEA and self-hosting in one system.",
  footnote:
    "Source: Public product descriptions and APIs of the listed vendors (as of June 2026). Harvey = Harvey AI ($300M ARR, $11B valuation), Legora = formerly Leya (Sweden, $100M ARR, $5.6B valuation), Josef = Josef (Australia), CoCounsel = Thomson Reuters.",
};

export function getCompetitors(lang: Lang): CompetitorContent {
  return lang === "de" ? DE : EN;
}
