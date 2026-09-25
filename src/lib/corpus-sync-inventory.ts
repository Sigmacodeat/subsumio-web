/**
 * Die eine Wahrheit hinter „Sync-Status pro Korpus" (/ops/corpus):
 * RIS-Soll → Platte → Datenbank je Quelle, gezählt nach RIS-Dokumentnummer.
 *
 * Gemessen wird im corpus-pipeline-Container (server/scripts/
 * corpus-sync-inventory.ts, stündlich) — nur dort liegen Dateien und DB
 * gemeinsam vor. Das Ergebnis steht in `_state/corpus-sync-inventory.json`;
 * die Web-Route liest nur diese Datei und rechnet daraus die Zeilen. Vorher
 * zählte die Tabelle Rohdateien (zwei Dateinamen-Generationen, OGH 99.724
 * Dateien für 67.744 Dokumente) gegen DISTINCT import_filename (Bundesrecht
 * 8.080 statt ~150.000) — fast jede „Disk→DB"-Lücke war ein Zählartefakt
 * (Audit 2026-09-25).
 *
 * Die Typen hier spiegeln `SyncInventorySource` im Server-Skript; beide
 * Seiten dürfen sich nicht importieren (Engine ↔ Web-App getrennt). Der
 * Parser ist deshalb defensiv: fehlende Felder werden zu 0/null.
 */

import { existsSync, readFileSync, statSync } from "fs";
import { join } from "path";
import { lawCorpusDir } from "@/lib/corpus-paths";

export type FetchOutcome = "no_text" | "not_found" | "failed";

export interface SyncInventorySource {
  corpus: string;
  sourceId: string;
  inScope: boolean;
  historical: boolean;
  risSoll: number | null;
  risSollKind: "index" | "hits" | null;
  risSollAt: string | null;
  rawFiles: number;
  normalizedFiles: number;
  diskDocs: number;
  dbPages: number;
  dbDocs: number;
  dbPagesWithoutDocId: number;
  missingOnDisk: number;
  missingByReason: Record<FetchOutcome | "open", number>;
  diskNotInDb: number;
  dbNotOnDisk: number;
  dbHistorical: number;
  notInRisSoll: number | null;
  aboveSoll: number;
}

export interface SyncInventory {
  version: 1;
  measuredAt: string;
  durationMs: number;
  sources: SyncInventorySource[];
}

/** Inhaltlicher Stand einer Quelle — Embeddings zählen bewusst NICHT hinein. */
export type ContentStatus =
  | "complete" //       Soll erfüllt, Platte = DB
  | "fetch_open" //     im RIS-Soll, noch nicht bei uns
  | "import_open" //    auf der Platte, noch nicht in der DB
  | "db_extra" //       in der DB, aber nicht (mehr) auf der Platte
  | "no_soll" //        Platte = DB, aber kein RIS-Soll zum Beweis
  | "historical" //     Archiv alter Fassungen (law-at)
  | "out_of_scope"; //  DE/CH/EU — nicht im automatischen Import

export interface CorpusSyncRow {
  corpus: string;
  sourceId: string;
  label: string;
  inScope: boolean;
  historical: boolean;
  /** Dokumente laut RIS (null = kein Soll bekannt). */
  risSoll: number | null;
  /** index = dokumentgenau aus dem In-force-Index; hits = RIS-Trefferzahl. */
  risSollKind: "index" | "hits" | null;
  diskDocs: number;
  dbDocs: number;
  dbPages: number;
  /** Im Soll, nicht bei uns, und noch nicht als unerreichbar erkannt — echte Arbeit. */
  missingOpen: number;
  /** Im Soll, aber RIS liefert keinen Text (PDF/Bild) oder kennt die Nummer nicht. */
  missingUnreachable: number;
  /** Auf der Platte, nicht in der DB. */
  importOpen: number;
  /** In der DB, nicht auf der Platte, ohne Enddatum — Altbestand zum Bereinigen. */
  dbExtra: number;
  /** In der DB, nicht auf der Platte, aber datiert: ältere Fassung, bewusst behalten. */
  dbHistorical: number;
  /** Auf der Platte, aber nicht mehr im RIS-Soll: außer Kraft / ersetzt. */
  notInSoll: number | null;
  dbChunks: number;
  embeddedChunks: number;
  coveragePct: number;
  status: ContentStatus;
  fullyComplete: boolean;
  canUpdate: boolean;
  pipelineKey: string | null;
}

export interface CorpusSyncTotals {
  risSoll: number;
  diskDocs: number;
  dbDocs: number;
  missingOpen: number;
  missingUnreachable: number;
  importOpen: number;
  dbExtra: number;
  notInSoll: number;
  dbChunks: number;
  embedded: number;
  coveragePct: number;
}

const INVENTORY_FILE = "corpus-sync-inventory.json";

let cache: { mtimeMs: number; path: string; inv: SyncInventory | null } | null = null;

/** Liest die letzte Messung (mtime-gecacht). null = noch keine Messung. */
export function readSyncInventory(root: string = lawCorpusDir()): SyncInventory | null {
  const path = join(root, "_state", INVENTORY_FILE);
  if (!existsSync(path)) return null;
  try {
    const mtimeMs = statSync(path).mtimeMs;
    if (cache && cache.path === path && cache.mtimeMs === mtimeMs) return cache.inv;
    const inv = parseSyncInventory(readFileSync(path, "utf8"));
    cache = { mtimeMs, path, inv };
    return inv;
  } catch {
    return null;
  }
}

const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const numOrNull = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

export function parseSyncInventory(json: string): SyncInventory | null {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return null;
  }
  const r = raw as Partial<SyncInventory> | null;
  if (!r || !Array.isArray(r.sources) || typeof r.measuredAt !== "string") return null;
  return {
    version: 1,
    measuredAt: r.measuredAt,
    durationMs: num(r.durationMs),
    sources: r.sources
      .filter((s): s is SyncInventorySource => !!s && typeof s.corpus === "string")
      .map((s) => ({
        corpus: s.corpus,
        sourceId: typeof s.sourceId === "string" ? s.sourceId : `law-${s.corpus}`,
        inScope: s.inScope === true,
        historical: s.historical === true,
        risSoll: numOrNull(s.risSoll),
        risSollKind: s.risSollKind === "index" || s.risSollKind === "hits" ? s.risSollKind : null,
        risSollAt: typeof s.risSollAt === "string" ? s.risSollAt : null,
        rawFiles: num(s.rawFiles),
        normalizedFiles: num(s.normalizedFiles),
        diskDocs: num(s.diskDocs),
        dbPages: num(s.dbPages),
        dbDocs: num(s.dbDocs),
        dbPagesWithoutDocId: num(s.dbPagesWithoutDocId),
        missingOnDisk: num(s.missingOnDisk),
        missingByReason: {
          open: num(s.missingByReason?.open),
          no_text: num(s.missingByReason?.no_text),
          not_found: num(s.missingByReason?.not_found),
          failed: num(s.missingByReason?.failed),
        },
        diskNotInDb: num(s.diskNotInDb),
        dbNotOnDisk: num(s.dbNotOnDisk),
        dbHistorical: num(s.dbHistorical),
        notInRisSoll: numOrNull(s.notInRisSoll),
        aboveSoll: num(s.aboveSoll),
      })),
  };
}

/** Korpus-Ordner → pipeline_state/fetch_triggered-Schlüssel für „Nachholen". */
export function pipelineKeyForCorpus(corpus: string): string | null {
  if (corpus === "at-normen") return "normen-at";
  if (corpus === "at-landesrecht") return "landesrecht";
  if (corpus === "at-judikatur") return "jud-ogh";
  // Kleinere RIS-Sammlungen: der Ordnername ist der Trigger-Schlüssel
  // (fetch-missing-sources.ts --source <ordner>).
  if (
    ["at-bmerl", "at-avsv", "at-avn", "at-spg", "at-kmger", "at-bezirke", "at-gemeinden"].includes(
      corpus
    )
  )
    return corpus;
  const m = corpus.match(/^at-judikatur-([a-z]+)$/);
  return m ? `jud-${m[1]}` : null;
}

/**
 * Eine Tabellenzeile aus der Messung. Jedes Dokument landet in genau einem
 * Topf; der Status folgt der Reihenfolge der Arbeit: erst holen, dann
 * importieren, dann aufräumen.
 */
export function toSyncRow(
  s: SyncInventorySource,
  label: string,
  embed: { chunks: number; embedded: number } | undefined
): CorpusSyncRow {
  // „failed" (Netz/Drosselung) bleibt offene Arbeit — nur eine echte
  // RIS-Antwort (kein Text, 404) macht ein Dokument unerreichbar.
  const missingUnreachable = s.missingByReason.no_text + s.missingByReason.not_found;
  const missingOpen = Math.max(0, s.missingOnDisk - missingUnreachable);
  const dbChunks = embed?.chunks ?? 0;
  const embeddedChunks = embed?.embedded ?? 0;
  const coveragePct = dbChunks > 0 ? Math.round((embeddedChunks / dbChunks) * 1000) / 10 : 0;

  let status: ContentStatus;
  if (s.historical) status = "historical";
  else if (!s.inScope) status = "out_of_scope";
  else if (missingOpen > 0) status = "fetch_open";
  else if (s.diskNotInDb > 0) status = "import_open";
  else if (s.dbNotOnDisk > 0) status = "db_extra";
  else if (s.risSoll === null) status = "no_soll";
  else status = "complete";

  const pipelineKey = pipelineKeyForCorpus(s.corpus);
  return {
    corpus: s.corpus,
    sourceId: s.sourceId,
    label,
    inScope: s.inScope,
    historical: s.historical,
    risSoll: s.historical ? null : s.risSoll,
    risSollKind: s.historical ? null : s.risSollKind,
    diskDocs: s.diskDocs,
    dbDocs: s.dbDocs,
    dbPages: s.dbPages,
    missingOpen,
    missingUnreachable,
    importOpen: s.diskNotInDb,
    dbExtra: s.dbNotOnDisk,
    dbHistorical: s.dbHistorical,
    notInSoll: s.notInRisSoll,
    dbChunks,
    embeddedChunks,
    coveragePct,
    status,
    fullyComplete: status === "complete",
    canUpdate: status === "fetch_open" && pipelineKey !== null,
    pipelineKey,
  };
}

export function syncTotals(rows: CorpusSyncRow[]): CorpusSyncTotals {
  const t: CorpusSyncTotals = {
    risSoll: 0,
    diskDocs: 0,
    dbDocs: 0,
    missingOpen: 0,
    missingUnreachable: 0,
    importOpen: 0,
    dbExtra: 0,
    notInSoll: 0,
    dbChunks: 0,
    embedded: 0,
    coveragePct: 0,
  };
  // Nur der Umfang des Produkts (AT, ohne Archiv) zählt in die Summen.
  for (const r of rows) {
    if (!r.inScope || r.historical) continue;
    t.risSoll += r.risSoll ?? 0;
    t.diskDocs += r.diskDocs;
    t.dbDocs += r.dbDocs;
    t.missingOpen += r.missingOpen;
    t.missingUnreachable += r.missingUnreachable;
    t.importOpen += r.importOpen;
    t.dbExtra += r.dbExtra;
    t.notInSoll += r.notInSoll ?? 0;
    t.dbChunks += r.dbChunks;
    t.embedded += r.embeddedChunks;
  }
  t.coveragePct = t.dbChunks > 0 ? Math.round((t.embedded / t.dbChunks) * 1000) / 10 : 0;
  return t;
}
