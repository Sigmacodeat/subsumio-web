export type Lang = "de" | "en";

export type Status = true | false | "partial";

export interface CompareRow {
  feature: string;
  sigmabrain: Status;
  harvey: Status;
  leya: Status;
  josef: Status;
  cocounsel: Status;
}

export interface CompetitorContent {
  badge: string;
  title: string;
  claim: string;
  sub: string;
  tableTitle: string;
  sigmabrainLabel: string;
  harveyLabel: string;
  leyaLabel: string;
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
  claim: "Harvey, Leya & Co. positionieren.",
  sub: "Keine Marketing-Behauptungen — nur ein Fakten-Vergleich basierend auf öffentlich dokumentierten Features.",
  tableTitle: "Feature-Matrix",
  sigmabrainLabel: "Sigmabrain",
  harveyLabel: "Harvey AI",
  leyaLabel: "Leya",
  josefLabel: "Josef",
  cocounselLabel: "CoCounsel",
  yes: "Ja",
  no: "Nein",
  partial: "Teilweise",
  rows: [
    { feature: "Aktenverwaltung (Case Management)", sigmabrain: true, harvey: false, leya: "partial", josef: "partial", cocounsel: false },
    { feature: "Dokumenten-Vault & DMS", sigmabrain: true, harvey: false, leya: "partial", josef: "partial", cocounsel: false },
    { feature: "Fristen-Management & Erinnerungen", sigmabrain: true, harvey: false, leya: false, josef: false, cocounsel: false },
    { feature: "Zeiterfassung & Rechnungsstellung", sigmabrain: true, harvey: false, leya: false, josef: false, cocounsel: false },
    { feature: "KI-Legal Research mit Fundstellen", sigmabrain: true, harvey: true, leya: true, josef: false, cocounsel: true },
    { feature: "Vertragsentwürfe & Redlining", sigmabrain: true, harvey: true, leya: true, josef: true, cocounsel: true },
    { feature: "Semantisches Brain / Knowledge Base", sigmabrain: true, harvey: "partial", leya: "partial", josef: false, cocounsel: "partial" },
    { feature: "Self-Hosting (On-Premise)", sigmabrain: true, harvey: false, leya: false, josef: false, cocounsel: false },
    { feature: "EU-Datenspeicherung (DSGVO)", sigmabrain: true, harvey: false, leya: true, josef: false, cocounsel: false },
    { feature: "Native Mobile App", sigmabrain: true, harvey: false, leya: "partial", josef: false, cocounsel: false },
    { feature: "WhatsApp-Copilot", sigmabrain: true, harvey: false, leya: false, josef: false, cocounsel: false },
    { feature: "REST API & Connectors", sigmabrain: true, harvey: "partial", leya: "partial", josef: "partial", cocounsel: "partial" },
    { feature: "GoBD / Verfahrensdokumentation", sigmabrain: true, harvey: false, leya: false, josef: false, cocounsel: false },
    { feature: "BEA / eIDAS-Integration", sigmabrain: true, harvey: false, leya: false, josef: false, cocounsel: false },
    { feature: "DATEV-Export", sigmabrain: true, harvey: false, leya: false, josef: false, cocounsel: false },
    { feature: "Offline-Modus", sigmabrain: true, harvey: false, leya: false, josef: false, cocounsel: false },
    { feature: "Agenten-System (Skills, Eval)", sigmabrain: true, harvey: false, leya: false, josef: false, cocounsel: false },
    { feature: "Mandantenportal", sigmabrain: true, harvey: false, leya: false, josef: "partial", cocounsel: false },
    { feature: "DSGVO-Anonymisierung", sigmabrain: true, harvey: false, leya: false, josef: false, cocounsel: false },
    { feature: "Multi-Jurisdiction (DE/AT/CH)", sigmabrain: true, harvey: false, leya: "partial", josef: false, cocounsel: false },
  ],
  verdictTitle: "Das Fazit",
  verdict: "Harvey, CoCounsel und Leya sind exzellente KI-Forschungswerkzeuge — aber keine Kanzlei-Software. Josef automatisiert Dokumente, verwaltet aber keine Akten. Sigmabrain ist die einzige Plattform, die KI-Brain, Aktenverwaltung, Fristen, Rechnungsstellung, GoBD, BEA und Self-Hosting in einem System vereint.",
  footnote: "Quelle: Öffentliche Produktbeschreibungen und APIs der genannten Anbieter (Stand Juni 2026). Harvey = Harvey AI (OpenAI), Leya = Leya (Schweden), Josef = Josef (Australien), CoCounsel = Thomson Reuters Casetext.",
};

const EN: CompetitorContent = {
  badge: "Comparison",
  title: "How we stack up against",
  claim: "Harvey, Leya & Co.",
  sub: "No marketing claims — just a fact-based comparison drawn from publicly documented features.",
  tableTitle: "Feature Matrix",
  sigmabrainLabel: "Sigmabrain",
  harveyLabel: "Harvey AI",
  leyaLabel: "Leya",
  josefLabel: "Josef",
  cocounselLabel: "CoCounsel",
  yes: "Yes",
  no: "No",
  partial: "Partial",
  rows: [
    { feature: "Case Management", sigmabrain: true, harvey: false, leya: "partial", josef: "partial", cocounsel: false },
    { feature: "Document Vault & DMS", sigmabrain: true, harvey: false, leya: "partial", josef: "partial", cocounsel: false },
    { feature: "Deadline Management & Reminders", sigmabrain: true, harvey: false, leya: false, josef: false, cocounsel: false },
    { feature: "Time Tracking & Invoicing", sigmabrain: true, harvey: false, leya: false, josef: false, cocounsel: false },
    { feature: "AI Legal Research with Citations", sigmabrain: true, harvey: true, leya: true, josef: false, cocounsel: true },
    { feature: "Contract Drafting & Redlining", sigmabrain: true, harvey: true, leya: true, josef: true, cocounsel: true },
    { feature: "Semantic Brain / Knowledge Base", sigmabrain: true, harvey: "partial", leya: "partial", josef: false, cocounsel: "partial" },
    { feature: "Self-Hosting (On-Premise)", sigmabrain: true, harvey: false, leya: false, josef: false, cocounsel: false },
    { feature: "EU Data Residency (GDPR)", sigmabrain: true, harvey: false, leya: true, josef: false, cocounsel: false },
    { feature: "Native Mobile App", sigmabrain: true, harvey: false, leya: "partial", josef: false, cocounsel: false },
    { feature: "WhatsApp Copilot", sigmabrain: true, harvey: false, leya: false, josef: false, cocounsel: false },
    { feature: "REST API & Connectors", sigmabrain: true, harvey: "partial", leya: "partial", josef: "partial", cocounsel: "partial" },
    { feature: "GoBD / Process Documentation", sigmabrain: true, harvey: false, leya: false, josef: false, cocounsel: false },
    { feature: "BEA / eIDAS Integration", sigmabrain: true, harvey: false, leya: false, josef: false, cocounsel: false },
    { feature: "DATEV Export", sigmabrain: true, harvey: false, leya: false, josef: false, cocounsel: false },
    { feature: "Offline Mode", sigmabrain: true, harvey: false, leya: false, josef: false, cocounsel: false },
    { feature: "Agent System (Skills, Eval)", sigmabrain: true, harvey: false, leya: false, josef: false, cocounsel: false },
    { feature: "Client Portal", sigmabrain: true, harvey: false, leya: false, josef: "partial", cocounsel: false },
    { feature: "GDPR Anonymization", sigmabrain: true, harvey: false, leya: false, josef: false, cocounsel: false },
    { feature: "Multi-Jurisdiction (DE/AT/CH)", sigmabrain: true, harvey: false, leya: "partial", josef: false, cocounsel: false },
  ],
  verdictTitle: "The Verdict",
  verdict: "Harvey, CoCounsel and Leya are excellent AI research tools — but not law practice software. Josef automates documents, yet does not manage cases. Sigmabrain is the only platform that unites AI brain, case management, deadlines, invoicing, GoBD, BEA and self-hosting in one system.",
  footnote: "Source: Public product descriptions and APIs of the listed vendors (as of June 2026). Harvey = Harvey AI (OpenAI), Leya = Leya (Sweden), Josef = Josef (Australia), CoCounsel = Thomson Reuters Casetext.",
};

export function getCompetitors(lang: Lang): CompetitorContent {
  return lang === "de" ? DE : EN;
}
