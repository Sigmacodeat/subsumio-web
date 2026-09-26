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
  /** Legacy-Schema des XML-Fetchers (fetch-at-landesrecht-xml.ts): `id` statt `nor`. */
  id?: string;
  gnr?: string;
  kurztitel?: string | null;
  abk?: string | null;
  apa?: string | null;
  dokumenttyp?: string;
}

/**
 * Landeskürzel aus dem Präfix der RIS-Dokumentnummer (LST… → stmk). Gleiche
 * Tabelle wie LAND_CODES in server/scripts/normalize/normalize-corpus.ts —
 * die Web-App darf den Server-Code nicht importieren.
 */
const LAND_CODES: Record<string, string> = {
  BG: "bgld",
  KT: "ktn",
  NO: "noe",
  OO: "ooe",
  SB: "sbg",
  ST: "stmk",
  TI: "tir",
  VB: "vbg",
  WI: "wien",
};

/**
 * Gesetzes-Key im selben Format wie frontmatter.statute_id: Bundesrecht die
 * nackte Gesetzesnummer, Landesrecht mit Land („stmk-20000534"). Die Länder
 * vergeben ihre Nummern unabhängig — 10000001 ist zugleich ein burgenländisches,
 * ein oberösterreichisches und ein Tiroler Gesetz. Nach nackter Nummer
 * gruppiert, fielen 7.851 Landesgesetze auf 2.579 Keys zusammen, und kein Key
 * traf je die DB-Seite (Audit 2026-09-25).
 */
export function lawKeyFor(nor: string, gnr: string): string {
  const land = LAND_CODES[nor.match(/^L([A-Z]{2})\d/)?.[1] ?? ""];
  return land && !gnr.startsWith(`${land}-`) ? `${land}-${gnr}` : gnr;
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
    const nor = d.nor ?? d.id;
    if (!nor || !d.gnr || d.apa === "§ 0") continue;
    const key = lawKeyFor(nor, d.gnr);
    let entry = map.get(key);
    if (!entry) {
      entry = { gnr: key, kurztitel: d.kurztitel ?? null, abk: d.abk ?? null, docs: new Map() };
      map.set(key, entry);
    }
    entry.docs.set(nor, d.apa ?? null);
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
  /**
   * Nachweis je Dokument aus der stündlichen Messung (corpus-sync-inventory),
   * Töpfe in PROOF_BUCKETS-Reihenfolge; null = noch nicht gemessen.
   */
  proof?: number[] | null;
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
  // Vorhanden = die Dokumentnummer ist irgendwo in der Quelle aktiv — nicht
  // nur unter dem erwarteten Gesetzes-Key. Ältere Landesrecht-Seiten tragen
  // keine statute_id; nach Key gezählt, erschienen sie als „fehlt".
  const allDocs = new Set<string>();
  for (const d of dbDocs) {
    if (!d.doc) continue;
    allDocs.add(d.doc);
    const set = docsByLaw.get(d.key) ?? new Set<string>();
    set.add(d.doc);
    docsByLaw.set(d.key, set);
  }
  const aggByLaw = new Map(dbAggs.map((a) => [a.key, a]));

  const rows: LawCoverageRow[] = [];

  if (index) {
    for (const [gnr, entry] of index) {
      const missing: MissingDoc[] = [];
      let haveCount = 0;
      for (const [nor, apa] of entry.docs) {
        if (allDocs.has(nor)) haveCount++;
        else missing.push({ nor, apa });
      }
      const agg = aggByLaw.get(gnr);
      const status: LawCoverageStatus =
        haveCount === entry.docs.size ? "complete" : haveCount > 0 ? "partial" : "missing";
      missing.sort((a, b) => compareParagraphLabels(a.apa ?? a.nor, b.apa ?? b.nor));
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

/** Nachlade-Stand aus der Pipeline (law_fetch_queue + laufender law-fetch). */
export interface LawFetchState {
  /** Vorgemerkte Gesetzesnummern in Warteschlangen-Reihenfolge. */
  queued: string[];
  /** Gesetzesnummer, die gerade vom RIS geladen wird — null = keine. */
  running: string | null;
  running_since: string | null;
  /** true = Stand konnte nicht gelesen werden (Anzeige dann ohne Aussage). */
  unavailable: boolean;
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
  /** Zeitpunkt der Nachweis-Messung (LawCoverageRow.proof); null = noch keine. */
  proof_measured_at?: string | null;
  /** Nachlade-Stand (nur law-at-normen hat eine Nachlade-Warteschlange). */
  fetch?: LawFetchState | null;
}

// ── Quellen, Adressen, Sortierung ─────────────────────────────────────────

export type LawSourceId = "law-at-normen" | "law-at-landesrecht" | "law-de";

/**
 * Die drei Gesetzes-Quellen mit sprechendem URL-Kürzel. Das Kürzel steht in
 * den teilbaren Adressen (/ops/corpus/gesetz/bundesrecht/10001622 und
 * ?quelle=landesrecht) — die interne Quellen-ID bleibt aus der Adresszeile.
 */
export const LAW_SOURCES: ReadonlyArray<{
  id: LawSourceId;
  param: string;
  label: string;
  /** Nur Bundesrecht hat eine Nachlade-Warteschlange (ris-xml-fetch-normen --gnr). */
  refetch: boolean;
}> = [
  { id: "law-at-normen", param: "bundesrecht", label: "Bundesrecht", refetch: true },
  { id: "law-at-landesrecht", param: "landesrecht", label: "Landesrecht", refetch: false },
  { id: "law-de", param: "deutschland", label: "Deutschland", refetch: false },
];

export function lawSourceByParam(param: string | null | undefined) {
  return LAW_SOURCES.find((s) => s.param === param) ?? null;
}

export function lawSourceById(id: string | null | undefined) {
  return LAW_SOURCES.find((s) => s.id === id) ?? null;
}

/** Gesetzes-Kennung in der URL: Gesetzesnummer (AT) oder Kürzel (DE). */
export const LAW_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;

/** Status ↔ URL-Wert (?status=…) — deutsch, ohne Umlaute. */
export const LAW_STATUS_PARAMS: Record<LawCoverageStatus, string> = {
  partial: "unvollstaendig",
  missing: "fehlt",
  complete: "vollstaendig",
  "db-only": "nicht-im-ris",
};

export function lawStatusFromParam(param: string | null | undefined): LawCoverageStatus | null {
  const hit = (Object.entries(LAW_STATUS_PARAMS) as [LawCoverageStatus, string][]).find(
    ([, v]) => v === param
  );
  return hit ? hit[0] : null;
}

/** RIS-Abfragekürzel je Bundesland, abgeleitet aus dem Präfix der Dokumentnummer. */
const LANDESRECHT_ABFRAGE: Record<string, string> = {
  LBG: "LrBgld",
  LKT: "LrK",
  LNO: "LrNO",
  LOO: "LrOO",
  LSB: "LrSbg",
  LST: "LrStmk",
  LTI: "LrT",
  LVB: "LrVbg",
  LWI: "LrW",
};

function landesrechtAbfrage(docId: string | null | undefined): string | null {
  if (!docId) return null;
  return LANDESRECHT_ABFRAGE[docId.slice(0, 3).toUpperCase()] ?? null;
}

/**
 * Amtliche Fundstelle des ganzen Gesetzes (geltende Fassung). Für Landesrecht
 * braucht das RIS das Bundesland — es steckt im Präfix einer beliebigen
 * Dokumentnummer des Gesetzes (`sampleDocId`).
 */
export function lawOfficialUrl(
  source: string,
  key: string,
  sampleDocId?: string | null
): { url: string; label: string } | null {
  if (source === "law-at-normen" && /^\d+$/.test(key)) {
    return {
      url: `https://www.ris.bka.gv.at/GeltendeFassung.wxe?Abfrage=Bundesnormen&Gesetzesnummer=${key}`,
      label: "Im RIS öffnen",
    };
  }
  // Landesrecht-Keys tragen das Land („stmk-20000534"), RIS will die nackte Nummer.
  const bareLr = source === "law-at-landesrecht" ? key.replace(/^[a-z]+-/, "") : "";
  if (source === "law-at-landesrecht" && /^\d+$/.test(bareLr)) {
    const abfrage = landesrechtAbfrage(sampleDocId);
    return abfrage
      ? {
          url: `https://www.ris.bka.gv.at/GeltendeFassung.wxe?Abfrage=${abfrage}&Gesetzesnummer=${bareLr}`,
          label: "Im RIS öffnen",
        }
      : null;
  }
  if (source === "law-de" && LAW_KEY_PATTERN.test(key)) {
    return {
      url: `https://www.gesetze-im-internet.de/${encodeURIComponent(key)}/`,
      label: "Auf gesetze-im-internet.de öffnen",
    };
  }
  return null;
}

/** Amtliche Fundstelle eines einzelnen Paragraphen/Artikels (RIS-Dokument). */
export function normOfficialUrl(source: string, docId: string | null | undefined): string | null {
  if (!docId) return null;
  if (source === "law-at-normen" && /^NOR\d+$/.test(docId)) {
    return `https://www.ris.bka.gv.at/Dokumente/Bundesnormen/${docId}/${docId}.html`;
  }
  if (source === "law-at-landesrecht" && /^[A-Z]{3}\d+$/.test(docId)) {
    const abfrage = landesrechtAbfrage(docId);
    return abfrage ? `https://www.ris.bka.gv.at/Dokumente/${abfrage}/${docId}/${docId}.html` : null;
  }
  return null;
}

const PARA_KIND_RANK = (kind: string): number => {
  const k = kind.toLowerCase();
  if (k.startsWith("§")) return 0;
  if (k.startsWith("art")) return 1;
  if (k.startsWith("anl")) return 2;
  return 3;
};

/**
 * Natürliche Reihenfolge für §-/Artikel-Bezeichnungen: § 2 vor § 10, § 2a
 * nach § 2, Paragraphen vor Artikeln vor Anlagen. Unbekannte Formen fallen
 * auf den deutschen Textvergleich zurück.
 */
export function compareParagraphLabels(a: string, b: string): number {
  const rx = /(§+|Art(?:ikel)?\.?|Anl(?:age)?\.?)\s*(\d+)\s*([a-z]*)/i;
  const ma = rx.exec(a);
  const mb = rx.exec(b);
  if (ma && mb) {
    return (
      PARA_KIND_RANK(ma[1]) - PARA_KIND_RANK(mb[1]) ||
      Number(ma[2]) - Number(mb[2]) ||
      ma[3].localeCompare(mb[3], "de") ||
      a.localeCompare(b, "de")
    );
  }
  if (ma) return -1;
  if (mb) return 1;
  return a.localeCompare(b, "de", { numeric: true });
}

// ── Einzelnes Gesetz ─────────────────────────────────────────────────────

/** Eine gespeicherte Seite (§/Artikel) eines Gesetzes, wie die DB sie liefert. */
export interface DbLawPage {
  /** Dokument-ID (nor) bzw. §-Segment — null, wenn die Seite keine trägt. */
  doc: string | null;
  /** §-Bezeichnung aus dem Frontmatter (paragraph_ref), falls vorhanden. */
  label: string | null;
  slug: string;
  title: string | null;
  chunks: number;
  embedded: number;
  updated_at: string | null;
}

/** Ein § in der Detailantwort — gespeichert (mit Datei) oder nur in der DB. */
export interface LawDetailNorm {
  doc: string | null;
  label: string | null;
  title: string | null;
  /** Pfad der gespeicherten Textdatei (für den Datei-Betrachter), null = keine Datei gefunden. */
  file: string | null;
  /** Prüfvermerk aus dem Korpus-Steward: verified | needs_review | defective | null. */
  flag: string | null;
  chunks: number;
  embedded: number;
  updated_at: string | null;
}

export interface LawDetailResponse {
  source: LawSourceId;
  key: string;
  abbr: string | null;
  title: string | null;
  status: LawCoverageStatus;
  wanted: number;
  have: number;
  missing: MissingDoc[];
  present: LawDetailNorm[];
  /** In der DB, aber nicht (mehr) im RIS-Verzeichnis der geltenden Normen. */
  extra: LawDetailNorm[];
  chunks: number;
  embedded: number;
  embed_pct: number | null;
  quality: { verified: number; needs_review: number; defective: number; unchecked: number };
  index: { available: boolean | null; measured_at: string | null };
  generated_at: string;
  fetch: { supported: boolean; queued: boolean; running: boolean; unavailable: boolean };
}

/**
 * Soll-Ist für EIN Gesetz, ohne Kappung der Fehlliste. `entry` = RIS-Soll
 * (null bei Quellen ohne Index oder Gesetzen, die das RIS nicht mehr listet).
 * Gibt null zurück, wenn es das Gesetz weder im Soll noch in der DB gibt.
 */
export function computeLawDetail(
  entry: RisIndexEntry | null,
  pages: DbLawPage[]
): {
  status: LawCoverageStatus;
  wanted: number;
  missing: MissingDoc[];
  present: DbLawPage[];
  extra: DbLawPage[];
} | null {
  if (!entry && pages.length === 0) return null;

  // Eine Dokument-ID zählt einmal, auch wenn die DB sie doppelt führt.
  const byDoc = new Map<string, DbLawPage>();
  const withoutDoc: DbLawPage[] = [];
  for (const p of pages) {
    if (!p.doc) withoutDoc.push(p);
    else if (!byDoc.has(p.doc)) byDoc.set(p.doc, p);
  }

  const labelOf = (p: DbLawPage) => p.label ?? p.doc ?? p.slug;
  const byLabel = (a: DbLawPage, b: DbLawPage) => compareParagraphLabels(labelOf(a), labelOf(b));

  if (!entry) {
    return {
      status: "db-only",
      wanted: 0,
      missing: [],
      present: [...byDoc.values(), ...withoutDoc].sort(byLabel),
      extra: [],
    };
  }

  const present: DbLawPage[] = [];
  const missing: MissingDoc[] = [];
  for (const [nor, apa] of entry.docs) {
    const hit = byDoc.get(nor);
    if (hit) present.push({ ...hit, label: hit.label ?? apa });
    else missing.push({ nor, apa });
  }
  const extra = [...byDoc.values()].filter((p) => !entry.docs.has(p.doc!)).concat(withoutDoc);
  missing.sort((a, b) => compareParagraphLabels(a.apa ?? a.nor, b.apa ?? b.nor));

  const status: LawCoverageStatus =
    present.length === entry.docs.size ? "complete" : present.length > 0 ? "partial" : "missing";
  return {
    status,
    wanted: entry.docs.size,
    missing,
    present: present.sort(byLabel),
    extra: extra.sort(byLabel),
  };
}
