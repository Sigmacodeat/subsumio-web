/**
 * Semantic document type classifier for legal documents.
 *
 * Heuristic-based ($0 cost) classifier that examines document content
 * and returns a semantic type. Used during import to tag pages with
 * meaningful types beyond the structural `chunk_source` field.
 *
 * This enables:
 *   - Filtered search: "search only witness statements"
 *   - Targeted contradiction detection: "compare all medical reports"
 *   - Dashboard grouping by document category
 *
 * Classification is based on keyword patterns, document structure,
 * and legal domain knowledge. It's intentionally conservative —
 * when no pattern matches with high confidence, it falls back to
 * `legal_document` rather of guessing.
 */

export type LegalDocType =
  | "witness_statement"
  | "expert_report"
  | "medical_report"
  | "court_order"
  | "court_judgment"
  | "pleading"
  | "contract"
  | "invoice"
  | "correspondence"
  | "police_report"
  | "financial_record"
  | "anordnungsbogen"
  | "haftangelegenheit"
  | "kostenverzeichnis"
  | "akteneinsicht"
  | "urgenz"
  | "strafantrag"
  | "nichtigkeitsbeschwerde"
  | "legal_document";

interface ClassificationPattern {
  type: LegalDocType;
  keywords: string[];
  minMatches: number;
  boostWords?: string[];
}

const PATTERNS: ClassificationPattern[] = [
  {
    type: "witness_statement",
    keywords: [
      "zeuge",
      "zeugin",
      "vernehmung",
      "aussage",
      "aussagen",
      "protokolliert",
      "vernommen",
      "witness",
      "statement",
      "testimony",
      "deposition",
      "interview",
      "témoignage",
      "témain",
      "audition",
    ],
    minMatches: 2,
    boostWords: [
      "personenfeststellung",
      "sachverhalt",
      "befragt",
      "ausgesagt",
      "sworn",
      "oath",
      "affidavit",
      "serment",
    ],
  },
  {
    type: "expert_report",
    keywords: [
      "gutachten",
      "sachverständig",
      "expertise",
      "begutachtung",
      "gutachter",
      "expert report",
      "expertise",
      "forensic",
      "specialist report",
      "rapport d'expertise",
      "expertise judiciaire",
    ],
    minMatches: 1,
    boostWords: [
      "befund",
      "untersuchung",
      "analyse",
      "methodik",
      "schlussfolgerung",
      "findings",
      "methodology",
      "conclusion",
      "examination",
      "constatations",
    ],
  },
  {
    type: "medical_report",
    keywords: [
      "arztbericht",
      "krankenhaus",
      "diagnose",
      "behandlung",
      "patient",
      "arzt",
      "ärztlich",
      "kranken",
      "medizinisch",
      "ambulanz",
      "notaufnahme",
      "medical report",
      "hospital",
      "diagnosis",
      "treatment",
      "patient",
      "physician",
      "medical",
      "emergency room",
      "rapport médical",
      "hôpital",
      "diagnostic",
      "traitement",
      "médecin",
    ],
    minMatches: 2,
    boostWords: [
      "befund",
      "therapie",
      "medikation",
      "prognose",
      "rehabilitation",
      "ICD",
      "OPS",
      "findings",
      "therapy",
      "medication",
      "prognosis",
      "constatations",
      "thérapie",
    ],
  },
  {
    type: "court_order",
    keywords: [
      "beschluss",
      "verfügung",
      "anordnung",
      "gericht",
      "richter",
      "richterin",
      "kammer",
      "senat",
      "court order",
      "injunction",
      "ruling",
      "court",
      "judge",
      "chamber",
      "ordonnance",
      "tribunal",
      "juge",
      "chambre",
    ],
    minMatches: 2,
    boostWords: [
      "az.",
      "geschäftsnummer",
      "rechtspfleger",
      "decernent",
      "einstweilig",
      "einstweilige",
      "case no",
      "docket",
      "temporary restraining",
      "numéro de dossier",
    ],
  },
  {
    type: "court_judgment",
    keywords: [
      "urteil",
      "erkenntnis",
      "entscheidung",
      "tenor",
      "urteilsformel",
      "verkündet",
      "judgment",
      "verdict",
      "decision",
      "ruling",
      "rendered",
      "jugement",
      "arrêt",
      "décision",
      "rendu",
    ],
    minMatches: 2,
    boostWords: [
      "rechtsmittel",
      "berufung",
      "revision",
      "beschwerde",
      "kostenentscheidung",
      "tatbestand",
      "entscheidungsgründe",
      "appeal",
      "appellate",
      "costs",
      "findings of fact",
      "appel",
      "dépens",
      "motifs",
    ],
  },
  {
    type: "pleading",
    keywords: [
      "klage",
      "klageschrift",
      "klagebeantwortung",
      "verteidigung",
      "schriftsatz",
      "vorbringen",
      "antrag",
      "beantragen",
      "complaint",
      "pleading",
      "motion",
      "filing",
      "petition",
      "answer",
      "demande",
      "conclusions",
      "mémoire",
      "requête",
    ],
    minMatches: 2,
    boostWords: [
      "kläger",
      "beklagt",
      "mandant",
      "gegner",
      "prozessbevollmächtigter",
      "rechtl. anwalt",
      "plaintiff",
      "defendant",
      "counsel",
      "demandeur",
      "défendeur",
      "avocat",
    ],
  },
  {
    type: "contract",
    keywords: [
      "vertrag",
      "vereinbarung",
      "abkommen",
      "klausel",
      "partei",
      "vertragspartner",
      "abschluss",
      "contract",
      "agreement",
      "clause",
      "party",
      "parties",
      "contrat",
      "convention",
      "clause",
      "partie",
    ],
    minMatches: 2,
    boostWords: [
      "geltungsbereich",
      "laufzeit",
      "kündigungsfrist",
      "vertragsstrafe",
      "haftung",
      "gewährleistung",
      "scope",
      "term",
      "termination",
      "penalty",
      "liability",
      "warranty",
      "portée",
      "durée",
      "résiliation",
      "pénalité",
      "responsabilité",
      "garantie",
    ],
  },
  {
    type: "invoice",
    keywords: [
      "rechnung",
      "betrag",
      "EUR",
      "EUR",
      "netto",
      "brutto",
      "umsatzsteuer",
      "leistung",
      "invoice",
      "amount",
      "net",
      "gross",
      "tax",
      "VAT",
      "service",
      "facture",
      "montant",
      "net",
      "TVA",
      "prestation",
    ],
    minMatches: 2,
    boostWords: [
      "rechnungsnummer",
      "rechnungsdatum",
      "fällig",
      "zahlungsbedingungen",
      "IBAN",
      "invoice number",
      "invoice date",
      "due",
      "payment terms",
      "numéro de facture",
      "échéance",
      "conditions de paiement",
    ],
  },
  {
    type: "correspondence",
    keywords: [
      "sehr geehrte",
      "mit freundlichen grüßen",
      "brief",
      "schreiben",
      "nachricht",
      "dear sir",
      "dear madam",
      "dear mr",
      "dear mrs",
      "sincerely",
      "regards",
      "letter",
      "chère",
      "cordialement",
      "lettre",
    ],
    minMatches: 2,
    boostWords: [
      "anbei",
      "anlage",
      "beiliegend",
      "zur kenntnisnahme",
      "um ihre stellungnahme",
      "enclosed",
      "attached",
      "for your review",
      "ci-joint",
      "veuillez trouver",
    ],
  },
  {
    type: "police_report",
    keywords: [
      "polizeilich",
      "ermittlungsverfahren",
      "staatsanwaltschaft",
      "aktenzeichen",
      "fahndung",
      "strafsache",
      "strafverfahren",
      "police",
      "investigation",
      "prosecutor",
      "case number",
      "criminal case",
      "police report",
      "police",
      "enquête",
      "procureur",
      "procédure pénale",
    ],
    minMatches: 2,
    boostWords: [
      "verdächtiger",
      "tathergang",
      "täter",
      "opfer",
      "beweismittel",
      "sicherung",
      "durchsuchung",
      "suspect",
      "crime scene",
      "perpetrator",
      "victim",
      "evidence",
      "search warrant",
      "suspect",
      "scène de crime",
      "auteur",
      "victime",
      "preuves",
      "perquisition",
    ],
  },
  {
    type: "financial_record",
    keywords: [
      "kontoauszug",
      "überweisung",
      "zahlung",
      "transaktion",
      "bank",
      "iban",
      "bic",
      "saldo",
      "kontostand",
      "bank statement",
      "transfer",
      "payment",
      "transaction",
      "balance",
      "account",
      "relevé bancaire",
      "virement",
      "paiement",
      "transaction",
      "solde",
    ],
    minMatches: 2,
    boostWords: [
      "wertstellung",
      "umsatz",
      "lastschrift",
      "gutschrift",
      "dauerauftrag",
      "direct debit",
      "deposit",
      "standing order",
      "value date",
      "prélèvement",
      "dépôt",
      "date de valeur",
    ],
  },
  // ── Austrian-specific document types (GVgo / StPO) ──────────
  {
    type: "anordnungsbogen",
    keywords: [
      "anordnung",
      "anordnungsbeschluss",
      "bewilligung",
      "einstellungsbeschluss",
      "einstellung",
      "anordnungsbogen",
      "anordnungs- und bewilligungsbogen",
    ],
    minMatches: 2,
    boostWords: [
      "staatsanwaltschaft",
      "ermittlungsrichter",
      "gericht",
      "untersagung",
      "durchsuchungsanordnung",
      "überwachung",
      "maßnahme",
    ],
  },
  {
    type: "haftangelegenheit",
    keywords: [
      "haftbefehl",
      "haft",
      "unterbringung",
      "festnahme",
      "verhaftung",
      "haftangelegenheit",
      "haftprüfung",
      "schubhaft",
      "auslieferungshaft",
      "untersuchungshaft",
      "urteilshaft",
    ],
    minMatches: 1,
    boostWords: [
      "fluchtgefahr",
      "verdunkelungsgefahr",
      "tatverdacht",
      "dringend",
      "festnahme",
      "aufenthaltsermittlung",
      "auslieferung",
    ],
  },
  {
    type: "kostenverzeichnis",
    keywords: [
      "kostenverzeichnis",
      "kosten",
      "gebühren",
      "vorschreibung",
      "kostenansatz",
      "gebührenvorschreibung",
      "barauslagen",
      "sachgebühren",
    ],
    minMatches: 2,
    boostWords: [
      "gerichtsgebühren",
      "anwaltskosten",
      "dolmetscherkosten",
      "sachverständigenhonorar",
      "ersatzforderungen",
    ],
  },
  {
    type: "akteneinsicht",
    keywords: [
      "akteneinsicht",
      "einsicht",
      "einsichtnahme",
      "akteneinsichtsgesuch",
      "einsicht in die akten",
      "act inspection",
    ],
    minMatches: 1,
    boostWords: [
      "verteidiger",
      "anwalt",
      "staatsanwaltschaft",
      "gericht",
      "beantragt",
      "gewährt",
      "verweigert",
    ],
  },
  {
    type: "urgenz",
    keywords: [
      "urgenz",
      "dringlichkeit",
      "einstweilige verfügung",
      "einstweilige anordnung",
      "eilbedürftig",
      "sofort",
    ],
    minMatches: 2,
    boostWords: ["gefahr im verzug", "irreparabler schaden", "sofortige", "unverzüglich"],
  },
  {
    type: "strafantrag",
    keywords: [
      "strafantrag",
      "strafanzeige",
      "anzeige",
      "privatanzeige",
      "strafbeschwerde",
      "subsidiäranklage",
    ],
    minMatches: 1,
    boostWords: ["staatsanwaltschaft", "strafbar", "tatvorwurf", "beschuldigter", "delikt"],
  },
  {
    type: "nichtigkeitsbeschwerde",
    keywords: [
      "nichtigkeitsbeschwerde",
      "nichtigkeit",
      "revision",
      "oberster gerichtshof",
      "ogh",
      "nichtigkeitsgrund",
    ],
    minMatches: 1,
    boostWords: [
      "rechtsmittel",
      "gebracht",
      "gerichtshof zweiter instanz",
      "berufungsgericht",
      "instanz",
    ],
  },
];

/**
 * Classify a legal document based on its text content.
 * Returns the semantic type and a confidence score (0-1).
 *
 * Conservative: requires `minMatches` keyword hits, boosted by
 * `boostWords` presence. Falls back to `legal_document` when
 * no pattern reaches its threshold.
 */
export function classifyLegalDocument(text: string): { type: LegalDocType; confidence: number } {
  const lower = text.toLowerCase();
  const textSlice = lower.slice(0, 5000); // Only examine first 5000 chars for performance

  let bestMatch: { type: LegalDocType; confidence: number } = {
    type: "legal_document",
    confidence: 0,
  };

  for (const pattern of PATTERNS) {
    let matches = 0;
    for (const kw of pattern.keywords) {
      if (textSlice.includes(kw.toLowerCase())) matches++;
    }

    if (matches < pattern.minMatches) continue;

    let confidence = matches / pattern.keywords.length;

    // Boost confidence if boost words are present
    if (pattern.boostWords) {
      let boostHits = 0;
      for (const bw of pattern.boostWords) {
        if (textSlice.includes(bw.toLowerCase())) boostHits++;
      }
      confidence += boostHits * 0.1;
    }

    confidence = Math.min(confidence, 1.0);

    if (confidence > bestMatch.confidence) {
      bestMatch = { type: pattern.type, confidence };
    }
  }

  return bestMatch;
}

/**
 * Get a human-readable German label for a LegalDocType.
 * Used in dashboard UI and search result displays.
 */
export function legalDocTypeLabel(type: LegalDocType): string {
  const labels: Record<LegalDocType, string> = {
    witness_statement: "Zeugenaussage",
    expert_report: "Gutachten",
    medical_report: "Arztbericht",
    court_order: "Gerichtsbeschluss",
    court_judgment: "Urteil",
    pleading: "Schriftsatz",
    contract: "Vertrag",
    invoice: "Rechnung",
    correspondence: "Korrespondenz",
    police_report: "Ermittlungsakte",
    financial_record: "Finanzunterlage",
    anordnungsbogen: "Anordnungsbogen (A)",
    haftangelegenheit: "Haftangelegenheit (H)",
    kostenverzeichnis: "Kostenverzeichnis (G)",
    akteneinsicht: "Akteneinsicht",
    urgenz: "Urgenz",
    strafantrag: "Strafantrag",
    nichtigkeitsbeschwerde: "Nichtigkeitsbeschwerde",
    legal_document: "Rechtsdokument",
  };
  return labels[type] ?? "Rechtsdokument";
}
