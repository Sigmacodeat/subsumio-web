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
    ],
    minMatches: 2,
    boostWords: ["personenfeststellung", "sachverhalt", "befragt", "ausgesagt"],
  },
  {
    type: "expert_report",
    keywords: ["gutachten", "sachverständig", "expertise", "begutachtung", "gutachter"],
    minMatches: 1,
    boostWords: ["befund", "untersuchung", "analyse", "methodik", "schlussfolgerung"],
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
    ],
    minMatches: 2,
    boostWords: ["befund", "therapie", "medikation", "prognose", "rehabilitation", "ICD", "OPS"],
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
    ],
    minMatches: 2,
    boostWords: [
      "az.",
      "geschäftsnummer",
      "rechtspfleger",
      "decernent",
      "einstweilig",
      "einstweilige",
    ],
  },
  {
    type: "court_judgment",
    keywords: ["urteil", "erkenntnis", "entscheidung", "tenor", "urteilsformel", "verkündet"],
    minMatches: 2,
    boostWords: [
      "rechtsmittel",
      "berufung",
      "revision",
      "beschwerde",
      "kostenentscheidung",
      "tatbestand",
      "entscheidungsgründe",
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
    ],
    minMatches: 2,
    boostWords: [
      "kläger",
      "beklagt",
      "mandant",
      "gegner",
      "prozessbevollmächtigter",
      "rechtl. anwalt",
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
    ],
    minMatches: 2,
    boostWords: [
      "geltungsbereich",
      "laufzeit",
      "kündigungsfrist",
      "vertragsstrafe",
      "haftung",
      "gewährleistung",
    ],
  },
  {
    type: "invoice",
    keywords: ["rechnung", "betrag", "EUR", "EUR", "netto", "brutto", "umsatzsteuer", "leistung"],
    minMatches: 2,
    boostWords: ["rechnungsnummer", "rechnungsdatum", "fällig", "zahlungsbedingungen", "IBAN"],
  },
  {
    type: "correspondence",
    keywords: ["sehr geehrte", "mit freundlichen grüßen", "brief", "schreiben", "nachricht"],
    minMatches: 2,
    boostWords: ["anbei", "anlage", "beiliegend", "zur kenntnisnahme", "um ihre stellungnahme"],
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
    ],
    minMatches: 2,
    boostWords: ["wertstellung", "umsatz", "lastschrift", "gutschrift", "dauerauftrag"],
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
    legal_document: "Rechtsdokument",
  };
  return labels[type] ?? "Rechtsdokument";
}
