export interface CaseSuggestion {
  legalArea?: string;
  subArea?: string;
  jurisdiction?: "de" | "at" | "ch" | "eu";
  priority?: "low" | "medium" | "high" | "critical";
  status?: "open" | "pending" | "settled" | "won" | "lost" | "appealed" | "dormant";
  reason: string;
}

const KEYWORD_RULES: Array<{
  keywords: string[];
  suggestion: Omit<CaseSuggestion, "reason">;
  reason: { de: string; en: string };
}> = [
  {
    keywords: ["miet", "mieter", "vermieter", "wohnung", "mietverhältnis", "mietvertrag", "kündigung", "mietsache"],
    suggestion: { legalArea: "Mietrecht", subArea: "Wohnraummiete", priority: "medium" },
    reason: { de: "Mietrecht erkannt", en: "Rental law detected" },
  },
  {
    keywords: ["arbeits", "arbeitnehmer", "arbeitgeber", "kündigungsschutz", "arbeitsvertrag", "abfindung"],
    suggestion: { legalArea: "Arbeitsrecht", subArea: "Kündigungsschutz", priority: "high" },
    reason: { de: "Arbeitsrecht erkannt", en: "Labor law detected" },
  },
  {
    keywords: ["scheidung", "ehe", "sorgerecht", "unterhalt", "ehevertrag", "familie"],
    suggestion: { legalArea: "Familienrecht", subArea: "Scheidung", priority: "high" },
    reason: { de: "Familienrecht erkannt", en: "Family law detected" },
  },
  {
    keywords: ["erbe", "testament", "erbfall", "pflichtteil", "erbschaft", "erbvertrag"],
    suggestion: { legalArea: "Erbrecht", subArea: "Testament", priority: "medium" },
    reason: { de: "Erbrecht erkannt", en: "Inheritance law detected" },
  },
  {
    keywords: ["vertrag", "vertragsbruch", "schadensersatz", "forderung", "zahlung", "vertragsrecht"],
    suggestion: { legalArea: "Zivilrecht", subArea: "Vertragsrecht", priority: "medium" },
    reason: { de: "Vertragsrecht erkannt", en: "Contract law detected" },
  },
  {
    keywords: ["kg", "gmbh", "ag", "kg", "gesellschaft", "gesellschafter", "kapitalgesellschaft"],
    suggestion: { legalArea: "Gesellschaftsrecht", subArea: "GmbH", priority: "high" },
    reason: { de: "Gesellschaftsrecht erkannt", en: "Corporate law detected" },
  },
  {
    keywords: ["dsgvo", "datenschutz", "datenschutzverletzung", "personenbezogene daten", "auftragsverarbeitung"],
    suggestion: { legalArea: "Datenschutzrecht", subArea: "DSGVO", priority: "high" },
    reason: { de: "Datenschutzrecht erkannt", en: "Data protection law detected" },
  },
  {
    keywords: ["insolvenz", "insolvenzverwalter", "restschuldbefreiung", "konkurs"],
    suggestion: { legalArea: "Insolvenzrecht", subArea: "Insolvenzeröffnung", priority: "critical" },
    reason: { de: "Insolvenzrecht erkannt", en: "Insolvency law detected" },
  },
  {
    keywords: ["urheber", "marke", "markenanmeldung", "markenverletzung", "lizenz"],
    suggestion: { legalArea: "Markenrecht", subArea: "Markenverletzung", priority: "medium" },
    reason: { de: "Markenrecht erkannt", en: "Trademark law detected" },
  },
  {
    keywords: ["steuer", "umsatzsteuer", "einkommensteuer", "gewerbesteuer", "finanzamt"],
    suggestion: { legalArea: "Steuerrecht", subArea: "Umsatzsteuer", priority: "high" },
    reason: { de: "Steuerrecht erkannt", en: "Tax law detected" },
  },
  {
    keywords: ["bau", "bauvertrag", "baugenehmigung", "nachbar", "denkmalschutz"],
    suggestion: { legalArea: "Baurecht", subArea: "Bauvertrag", priority: "medium" },
    reason: { de: "Baurecht erkannt", en: "Construction law detected" },
  },
  {
    keywords: ["medizin", "behandlungsfehler", "arzthaftung", "apotheke"],
    suggestion: { legalArea: "Medizinrecht", subArea: "Behandlungsfehler", priority: "high" },
    reason: { de: "Medizinrecht erkannt", en: "Medical law detected" },
  },
  {
    keywords: ["straf", "staatsanwaltschaft", "verdacht", "anklage", "wirtschaftsstraf"],
    suggestion: { legalArea: "Strafrecht", subArea: "Wirtschaftsstrafrecht", priority: "critical" },
    reason: { de: "Strafrecht erkannt", en: "Criminal law detected" },
  },
  {
    keywords: ["verwaltung", "baugenehmigung", "behörde", "umwelt", "vergabe", "asyl"],
    suggestion: { legalArea: "Verwaltungsrecht", subArea: "Baugenehmigung", priority: "medium" },
    reason: { de: "Verwaltungsrecht erkannt", en: "Administrative law detected" },
  },
  {
    keywords: ["sozial", "sgb", "rente", "arbeitslosengeld", "krankenkasse"],
    suggestion: { legalArea: "Sozialrecht", subArea: "SGB V", priority: "medium" },
    reason: { de: "Sozialrecht erkannt", en: "Social law detected" },
  },
  {
    keywords: ["versicherung", "kfz", "rechtsschutz", "lebensversicherung", "schadensregulierung"],
    suggestion: { legalArea: "Versicherungsrecht", subArea: "Kfz-Versicherung", priority: "medium" },
    reason: { de: "Versicherungsrecht erkannt", en: "Insurance law detected" },
  },
  {
    keywords: ["bank", "kredit", "kapitalmarkt", "zahlungsverkehr", "bgb"],
    suggestion: { legalArea: "Bankrecht", subArea: "Kreditrecht", priority: "medium" },
    reason: { de: "Bankrecht erkannt", en: "Banking law detected" },
  },
  {
    keywords: ["wettbewerb", "uwg", "wettbewerbsverstoß", "irreführende werbung"],
    suggestion: { legalArea: "Wettbewerbsrecht", subArea: "UWG", priority: "high" },
    reason: { de: "Wettbewerbsrecht erkannt", en: "Competition law detected" },
  },
];

export function suggestCaseFromTitle(
  title: string,
  lang: "de" | "en" = "de"
): CaseSuggestion | null {
  if (!title || title.trim().length < 3) return null;
  const normalized = title.toLowerCase();

  for (const rule of KEYWORD_RULES) {
    if (rule.keywords.some((k) => normalized.includes(k))) {
      return {
        ...rule.suggestion,
        reason: lang === "en" ? rule.reason.en : rule.reason.de,
      };
    }
  }
  return null;
}

export function detectJurisdictionFromTitle(
  title: string
): "de" | "at" | "ch" | "eu" | null {
  const normalized = title.toLowerCase();
  if (normalized.includes("österreich") || normalized.includes("at-")) return "at";
  if (normalized.includes("schweiz") || normalized.includes("ch-")) return "ch";
  if (normalized.includes("eu-") || normalized.includes("europäisch") || normalized.includes("brüssel")) return "eu";
  if (normalized.includes("deutschland") || normalized.includes("deutsch")) return "de";
  return null;
}

export function defaultCaseValues(): Required<Pick<CaseSuggestion, "jurisdiction" | "status" | "priority">> {
  return { jurisdiction: "de", status: "open", priority: "medium" };
}
