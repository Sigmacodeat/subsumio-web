/**
 * Labels and shapes for the operator's corpus inventory (/ops/corpus),
 * shared by the API route and the dashboard.
 */

/** What an operator recognises, instead of source ids. */
export const SOURCE_LABELS: Record<string, string> = {
  "law-at-normen": "Bundesrecht",
  "law-at-landesrecht": "Landesrecht",
  "law-at-staatsvertraege": "Staatsverträge",
  "law-at-gemeinden": "Gemeinderecht",
  "law-at-bezirke": "Kundmachungen der Bezirksverwaltungsbehörden",
  "law-at-avsv": "Verlautbarungen der Sozialversicherung (AVSV)",
  "law-at-avn": "Amtliche Veterinärnachrichten (AVN)",
  "law-at-bmerl": "Erlässe der Ministerien",
  "law-at-spg": "Strukturpläne Gesundheit (ÖSG/RSG)",
  "law-at-kmger": "Kundmachungen der Gerichte",
  "law-at-literatur": "Literatur",
  "law-at": "Bundesrecht — historische Fassungen",
  "law-at-judikatur": "OGH und Justiz",
  "law-at-judikatur-vwgh": "VwGH",
  "law-at-judikatur-vfgh": "VfGH",
  "law-at-judikatur-bvwg": "BVwG",
  "law-at-judikatur-lvwg": "Landesverwaltungsgerichte",
  "law-at-judikatur-asylgh": "AsylGH",
  "law-at-judikatur-uvs": "UVS",
  "law-at-judikatur-dsk": "Datenschutzbehörde",
  "law-at-judikatur-gbk": "Gleichbehandlungskommission",
  "law-at-judikatur-pvak": "Personalvertretungsaufsicht",
  "law-at-judikatur-dok": "Disziplinarbehörden",
  "law-at-judikatur-ubas": "Umweltsenat (UBAS)",
  "law-at-judikatur-umse": "Umweltsenat (UMSE)",
  "law-de": "Deutsches Bundesrecht",
  "law-de-literatur": "Literatur DE (Open Access)",
  "law-de-materialien": "Gesetzesmaterialien DE",
  "law-de-judikatur": "Rechtsprechung DE",
  "law-ch": "Schweizer Bundesrecht",
  "law-ch-judikatur": "Bundesgerichtsentscheide CH",
  "law-ch-literatur": "Literatur CH",
  "law-eu": "EU-Verordnungen",
  "law-eu-directives": "EU-Richtlinien",
};

export interface CorpusSourceStats {
  sourceId: string;
  label: string;
  kind: "statute" | "decision" | "other";
  pages: number;
  /** Distinct statutes (Gesetzesnummern) — statutes only. */
  statutes: number;
  rechtssaetze: number;
  entscheidungstexte: number;
  /** Provisions whose in_force_to lies in the past. */
  repealed: number;
  chunks: number;
  embedded: number;
  lastUpdated: string | null;
  /**
   * Latest full plausibility audit (server/scripts/audit-plausibility-full.ts →
   * corpus_status): every page checked with the rule that gates new imports,
   * plus the file counts of the source's folder. Null before the first audit.
   */
  quality: {
    checkedAt: string | null;
    plausible: number;
    implausible: number;
    /** issue code → pages, e.g. "generation:known_bad". */
    issues: Record<string, number>;
    rawFiles: number | null;
    normalizedFiles: number | null;
    /** Confirmed pages still without a vector. */
    unembeddedOk: number;
  } | null;
  reconciliation: {
    measuredAt: string;
    method: string;
    risTotal: number | null;
    dbTotal: number;
    missing: number | null;
    extra: number | null;
    note: string | null;
  } | null;
}

export interface CorpusOverview {
  sources: CorpusSourceStats[];
  totals: {
    statutes: number;
    norms: number;
    decisions: number;
    rechtssaetze: number;
    entscheidungstexte: number;
    pages: number;
    chunks: number;
    embedded: number;
  };
  ingestByDay: Array<{ day: string; added: number; updated: number }>;
  /** When the inventory snapshot was taken; null before the first one. */
  generatedAt: string | null;
}

export interface IngestLogEntry {
  id: number;
  occurredAt: string;
  sourceId: string;
  sourceLabel: string;
  docId: string | null;
  slug: string;
  title: string | null;
  action: "added" | "updated" | "removed" | "rejected";
  origin: string;
  /** Official RIS page of the document (from the page's source_url). */
  risUrl: string | null;
}

export interface IngestLogPage {
  total: number;
  limit: number;
  offset: number;
  entries: IngestLogEntry[];
}

export const INGEST_ACTION_LABELS: Record<IngestLogEntry["action"], string> = {
  added: "neu",
  updated: "geändert",
  removed: "entfernt",
  rejected: "abgelehnt",
};

/** Plain German for the audit's issue codes (audit-plausibility-full.ts / validateBody). */
export const QUALITY_ISSUE_LABELS: Record<string, string> = {
  "generation:known_bad": "fehlerhafte Abrufgeneration — Neuabruf nötig",
  "schema:legacy_frontmatter": "altes Metadaten-Format",
  "schema:no_identity": "ohne RIS-Dokumentnummer",
  "body:no_content_section": "kein Entscheidungstext",
  "body:screenreader_copy": "Sprachausgabe-Kopie im Text",
  "body:ris_prefix": "RIS-Seitenkopf im Text",
  "body:letterhead": "Briefkopf im Text",
  "body:pdf_pagebreak": "Seitenumbruch der Druckfassung im Text",
  "body:kein_rechtssatz": "RIS-Vermerk „Kein RS.“",
  "body:too_short": "zu wenig Text",
  "body:empty_body": "leer",
};
