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
  "law-at-bezirke": "Bezirksverwaltung",
  "law-at-avsv": "Sozialversicherung (AVSV)",
  "law-at-avn": "Veterinärnachrichten (AVN)",
  "law-at-bmerl": "Erlässe",
  "law-at-spg": "Sicherheitspolizei (SPG)",
  "law-at-kmger": "Kammergerichte",
  "law-at-literatur": "Literatur",
  "law-at": "Bundesgesetze (ganze Gesetze, alt)",
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
