/**
 * §-genaue Gesetzes-Coverage — Soll-Ist-Vergleich zwischen einem RIS
 * In-force-Index (JSONL, eine Zeile pro gültigem Norm-Dokument) und dem
 * DB-Bestand der Seiten.
 *
 * Reine Logik, keine I/O — die API-Route lädt Index und DB-Rows und ruft
 * computeLawCoverage. Dieselbe Set-Differenz rechnet das Skript
 * server/scripts/audit-completeness-vs-ris.ts per Dokument-ID (nor ↔
 * frontmatter.doc_id).
 */

export interface RisIndexEntry {
  gnr: string;
  kurztitel: string | null;
  abk: string | null;
  /** nor → §-Label (apa) */
  docs: Map<string, string | null>;
}

interface RisIndexLine {
  nor?: string;
  gnr?: string;
  kurztitel?: string | null;
  abk?: string | null;
  apa?: string | null;
  dokumenttyp?: string;
}

/**
 * Parst eine ris-inforce-JSONL (ris-inforce-crawl.ts). Deckblätter
 * (apa === "§ 0") werden übersprungen — sie tragen keinen Normtext und
 * würden jedes Gesetz mit einem dauerhaft „unvollständig" aussehen lassen.
 */
export function parseRisInforceIndex(jsonl: string): Map<string, RisIndexEntry> {
  const map = new Map<string, RisIndexEntry>();
  for (const line of jsonl.split("\n")) {
    if (!line.trim()) continue;
    let d: RisIndexLine;
    try {
      d = JSON.parse(line) as RisIndexLine;
    } catch {
      continue;
    }
    if (!d.nor || !d.gnr || d.apa === "§ 0") continue;
    let entry = map.get(d.gnr);
    if (!entry) {
      entry = { gnr: d.gnr, kurztitel: d.kurztitel ?? null, abk: d.abk ?? null, docs: new Map() };
      map.set(d.gnr, entry);
    }
    entry.docs.set(d.nor, d.apa ?? null);
    if (!entry.kurztitel && d.kurztitel) entry.kurztitel = d.kurztitel;
    if (!entry.abk && d.abk) entry.abk = d.abk;
  }
  return map;
}

export interface DbLawDoc {
  /** Gruppierungs-Key: gnr (AT) oder Law-Slug (DE) */
  key: string;
  /** Dokument-ID (nor) oder §-Slug-Segment — null bei Quellen ohne Doc-Key */
  doc: string | null;
}

export interface DbLawAgg {
  key: string;
  pages: number;
  chunks: number;
  embedded: number;
  abbr: string | null;
  title: string | null;
}

export type LawCoverageStatus = "complete" | "partial" | "missing" | "db-only";

export interface MissingDoc {
  nor: string;
  apa: string | null;
}

export interface LawCoverageRow {
  key: string;
  abbr: string | null;
  title: string | null;
  /** RIS-Soll (Dokumente im in-force-Index) */
  wanted: number;
  /** Davon als live Page in der DB */
  have: number;
  missingCount: number;
  missingDocs: MissingDoc[];
  missingTruncated: boolean;
  pages: number;
  chunks: number;
  embedded: number;
  embedPct: number | null;
  status: LawCoverageStatus;
}

export interface LawCoverageTotals {
  laws: number;
  complete: number;
  partial: number;
  missing: number;
  /** In DB vorhanden, aber nicht im RIS-Index (extra/veraltet) */
  extra: number;
  docsWanted: number;
  docsHave: number;
  docsMissing: number;
  chunks: number;
  embedded: number;
}

const STATUS_RANK: Record<LawCoverageStatus, number> = {
  missing: 0,
  partial: 1,
  complete: 2,
  "db-only": 3,
};

const MISSING_CAP = 50;

/**
 * Vergleicht RIS-Index-Soll mit DB-Ist pro Gesetz. Ohne Index (DE) werden
 * die DB-Aggregate als db-only-Rows ausgegeben. Sortierung: kritischste
 * Zeilen zuerst (fehlend → teilweise → vollständig → db-only), innerhalb
 * einer Stufe nach missingCount/wanted absteigend.
 */
export function computeLawCoverage(
  index: Map<string, RisIndexEntry> | null,
  dbDocs: DbLawDoc[],
  dbAggs: DbLawAgg[]
): { rows: LawCoverageRow[]; totals: LawCoverageTotals } {
  const docsByLaw = new Map<string, Set<string>>();
  for (const d of dbDocs) {
    if (!d.doc) continue;
    const set = docsByLaw.get(d.key) ?? new Set<string>();
    set.add(d.doc);
    docsByLaw.set(d.key, set);
  }
  const aggByLaw = new Map(dbAggs.map((a) => [a.key, a]));

  const rows: LawCoverageRow[] = [];

  if (index) {
    for (const [gnr, entry] of index) {
      const have = docsByLaw.get(gnr);
      const missing: MissingDoc[] = [];
      let haveCount = 0;
      for (const [nor, apa] of entry.docs) {
        if (have?.has(nor)) haveCount++;
        else missing.push({ nor, apa });
      }
      const agg = aggByLaw.get(gnr);
      const status: LawCoverageStatus =
        haveCount === entry.docs.size ? "complete" : haveCount > 0 ? "partial" : "missing";
      missing.sort((a, b) => (a.apa ?? a.nor).localeCompare(b.apa ?? b.nor, "de"));
      rows.push({
        key: gnr,
        abbr: entry.abk ?? agg?.abbr ?? null,
        title: entry.kurztitel ?? agg?.title ?? null,
        wanted: entry.docs.size,
        have: haveCount,
        missingCount: missing.length,
        missingDocs: missing.slice(0, MISSING_CAP),
        missingTruncated: missing.length > MISSING_CAP,
        pages: agg?.pages ?? 0,
        chunks: agg?.chunks ?? 0,
        embedded: agg?.embedded ?? 0,
        embedPct:
          agg && agg.chunks > 0 ? Math.round((agg.embedded / agg.chunks) * 1000) / 10 : null,
        status,
      });
    }
  }

  // In der DB, aber nicht im Index: Quellen ohne Index komplett,
  // Quellen mit Index als "db-only"-Rest (z.B. außer Kraft gesetzte
  // Fassungen, die RIS nicht mehr in-force listet).
  for (const agg of dbAggs) {
    if (index && index.has(agg.key)) continue;
    rows.push({
      key: agg.key,
      abbr: agg.abbr,
      title: agg.title,
      wanted: 0,
      have: docsByLaw.get(agg.key)?.size ?? agg.pages,
      missingCount: 0,
      missingDocs: [],
      missingTruncated: false,
      pages: agg.pages,
      chunks: agg.chunks,
      embedded: agg.embedded,
      embedPct: agg.chunks > 0 ? Math.round((agg.embedded / agg.chunks) * 1000) / 10 : null,
      status: "db-only",
    });
  }

  rows.sort(
    (a, b) =>
      STATUS_RANK[a.status] - STATUS_RANK[b.status] ||
      b.missingCount - a.missingCount ||
      b.wanted - a.wanted ||
      a.key.localeCompare(b.key, "de")
  );

  const totals: LawCoverageTotals = {
    laws: rows.length,
    complete: 0,
    partial: 0,
    missing: 0,
    extra: 0,
    docsWanted: 0,
    docsHave: 0,
    docsMissing: 0,
    chunks: 0,
    embedded: 0,
  };
  for (const r of rows) {
    totals[r.status === "db-only" ? "extra" : r.status]++;
    totals.docsWanted += r.wanted;
    totals.docsHave += r.have;
    totals.docsMissing += r.missingCount;
    totals.chunks += r.chunks;
    totals.embedded += r.embedded;
  }

  return { rows, totals };
}

/** Response-Shape von GET /api/admin/corpus-law-coverage. */
export interface LawCoverageResponse {
  source: string;
  generated_at: string;
  index: {
    /** true = Index geladen, false = erwartete Index-Datei fehlt,
     *  null = diese Quelle hat kein Upstream-Soll (z. B. law-de). */
    available: boolean | null;
    file: string | null;
    measured_at: string | null;
    laws: number | null;
    docs: number | null;
  };
  totals: LawCoverageTotals;
  laws: LawCoverageRow[];
}
