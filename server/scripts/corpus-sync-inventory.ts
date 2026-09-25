#!/usr/bin/env bun
/**
 * The one measurement behind the "Sync-Status pro Korpus" table on /ops/corpus:
 * RIS-Soll → Platte → Datenbank per source, counted by RIS document number
 * (frontmatter doc_id), never by files or pages.
 *
 * Why this exists (audit 2026-09-25): the table counted raw files (two file
 * name generations → OGH 99,724 files for 67,744 documents) against distinct
 * import file names in the DB (Bundesrecht 8,080 "documents" for ~150,000
 * paragraphs). Almost every "Disk→DB" gap it showed was an artefact, while
 * the real gaps against RIS were understated. Counting the same unit on all
 * three levels, with set differences instead of subtracted totals, makes the
 * numbers checkable: every document is in exactly one bucket.
 *
 * Soll per source:
 *   - at-normen / at-landesrecht: the RIS in-force index
 *     (_state/ris-inforce*.jsonl, § 0 cover sheets excluded) — id-exact.
 *   - courts: RIS hit count per Applikation (pipeline_state.ris_total) —
 *     a number only, so "fehlt bei uns" = Soll − eindeutige Dokumente.
 *   - everything else: no Soll (null), shown as such.
 *
 * Writes _state/corpus-sync-inventory.json atomically. Runs inside the
 * corpus-pipeline container (the only one that sees files and DB with write
 * access to _state); the pipeline starts it hourly. Read-only on the DB.
 *
 *   bun scripts/corpus-sync-inventory.ts            # write the file
 *   bun scripts/corpus-sync-inventory.ts --print    # also print a table
 */

import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  readSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { loadConfig, toEngineConfig } from "../src/core/config.ts";
import { createEngine } from "../src/core/engine-factory.ts";
import { readFetchOutcomes, type FetchOutcome } from "./ris-fetch-outcomes.ts";

const CORPUS_ROOT = process.env.LAW_CORPUS_ROOT ?? "/law-corpus";
const PRINT = process.argv.includes("--print");

/** Sources with an id-exact RIS in-force index. */
export const INDEX_OF: Record<string, string> = {
  "at-normen": "ris-inforce.jsonl",
  "at-landesrecht": "ris-inforce-landesrecht.jsonl",
};

/** Court directory → pipeline_state key holding the RIS hit count. */
function courtPipelineKey(corpus: string): string | null {
  if (corpus === "at-judikatur") return "jud-ogh";
  const m = corpus.match(/^at-judikatur-([a-z]+)$/);
  return m ? `jud-${m[1]}` : null;
}

export interface SyncInventorySource {
  corpus: string;
  sourceId: string;
  /** Only AT is imported automatically (PIPELINE_JURISDICTIONS); DE/CH/EU are out of scope. */
  inScope: boolean;
  /** law-at: whole-statute split of old versions, kept on purpose above any Soll. */
  historical: boolean;
  risSoll: number | null;
  risSollKind: "index" | "hits" | null;
  risSollAt: string | null;
  rawFiles: number;
  normalizedFiles: number;
  /** Distinct doc_id in _normalized — the unit RIS counts. */
  diskDocs: number;
  dbPages: number;
  /** Distinct doc_id among live pages. */
  dbDocs: number;
  dbPagesWithoutDocId: number;
  /** In the RIS Soll, not on disk. Index sources: exact; courts: Soll − diskDocs. */
  missingOnDisk: number;
  /** Of missingOnDisk: why the last fetch did not bring it (index sources only). */
  missingByReason: Record<FetchOutcome | "open", number>;
  /** On disk (normalized), not a live page in the DB — the real import gap. */
  diskNotInDb: number;
  /** Live DB page whose doc_id is not on disk and carries no end date (orphan). */
  dbNotOnDisk: number;
  /** Live DB page not on disk but dated (in_force_to): an older version kept on purpose. */
  dbHistorical: number;
  /** On disk but not in the RIS in-force index: repealed or superseded (index sources only). */
  notInRisSoll: number | null;
  /** RIS lists fewer than we hold (courts: diskDocs − Soll when positive). */
  aboveSoll: number;
}

export interface SyncInventory {
  version: 1;
  measuredAt: string;
  durationMs: number;
  sources: SyncInventorySource[];
}

interface Engine {
  executeRaw(sql: string, params?: unknown[]): Promise<unknown[]>;
  connect(cfg: unknown): Promise<void>;
  disconnect(): Promise<void>;
}

const HEAD_BYTES = 1500;
const headBuf = Buffer.alloc(HEAD_BYTES);

function readHead(path: string): string {
  let fd: number | null = null;
  try {
    fd = openSync(path, "r");
    const n = readSync(fd, headBuf, 0, HEAD_BYTES, 0);
    return headBuf.toString("utf8", 0, n);
  } catch {
    return "";
  } finally {
    if (fd !== null) closeSync(fd);
  }
}

const DOC_ID_RE = /^doc_id:\s*["']?([^"'\s]+)/m;

/** doc_id → number of files carrying it, plus the plain file count. */
export function scanNormalized(dir: string): { ids: Map<string, number>; files: number } {
  const ids = new Map<string, number>();
  let files = 0;
  const walk = (d: string) => {
    let entries;
    try {
      entries = readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith(".md")) {
        files++;
        const id = readHead(p).match(DOC_ID_RE)?.[1];
        if (id && id !== "null") ids.set(id, (ids.get(id) ?? 0) + 1);
      }
    }
  };
  walk(dir);
  return { ids, files };
}

function countMd(dir: string): number {
  let n = 0;
  const walk = (d: string) => {
    let entries;
    try {
      entries = readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.isDirectory()) walk(join(d, e.name));
      else if (e.name.endsWith(".md")) n++;
    }
  };
  walk(dir);
  return n;
}

/** In-force document ids from a RIS index, § 0 cover sheets excluded. */
export function loadIndexIds(path: string): Set<string> {
  const ids = new Set<string>();
  for (const line of readFileSync(path, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      const d = JSON.parse(line) as { nor?: string; id?: string; apa?: string | null };
      const nor = d.nor ?? d.id;
      if (nor && d.apa !== "§ 0") ids.add(nor);
    } catch {
      // skip
    }
  }
  return ids;
}

function listDirs(root: string): string[] {
  try {
    return readdirSync(root, { withFileTypes: true })
      .filter((d) => d.isDirectory() && !d.name.startsWith("_"))
      .map((d) => d.name);
  } catch {
    return [];
  }
}

export async function measure(
  engine: Engine,
  corpusRoot: string = CORPUS_ROOT
): Promise<SyncInventory> {
  const started = Date.now();
  const NORMALIZED = join(corpusRoot, "_normalized");
  const STATE = join(corpusRoot, "_state");
  const outcomes = readFetchOutcomes(corpusRoot);

  const risHits = new Map<string, number>();
  const hitRows = (await engine.executeRaw(
    `SELECT source_key, ris_total FROM pipeline_state WHERE source_key LIKE 'jud-%' AND ris_total > 0`
  )) as Array<{ source_key: string; ris_total: number | string }>;
  for (const r of hitRows) risHits.set(r.source_key, Number(r.ris_total));

  // Raw dirs: at-*, de*, ch*, and eu/<sub> as eu-<sub>.
  const corpora = new Set<string>(listDirs(NORMALIZED));
  for (const d of listDirs(corpusRoot)) {
    if (d === "eu") for (const sub of listDirs(join(corpusRoot, "eu"))) corpora.add(`eu-${sub}`);
    else corpora.add(d);
  }

  const sources: SyncInventorySource[] = [];
  for (const corpus of [...corpora].sort()) {
    const inScope = corpus === "at" || corpus.startsWith("at-");
    const sourceId = corpus === "eu-regulations" ? "law-eu" : `law-${corpus}`;
    const rawDir = corpus.startsWith("eu-")
      ? join(corpusRoot, "eu", corpus.slice(3))
      : join(corpusRoot, corpus);
    const rawFiles = countMd(rawDir);
    const { ids: diskIds, files: normalizedFiles } = inScope
      ? scanNormalized(join(NORMALIZED, corpus))
      : { ids: new Map<string, number>(), files: 0 };

    // DB: distinct doc_id of live pages, read in id order to keep memory flat.
    const dbIds = new Set<string>();
    const datedIds = new Set<string>();
    let dbPages = 0;
    let dbPagesWithoutDocId = 0;
    let lastId = 0;
    for (;;) {
      const batch = (await engine.executeRaw(
        `SELECT id, frontmatter->>'doc_id' AS doc_id,
                nullif(frontmatter->>'in_force_to', '') IS NOT NULL AS dated
           FROM pages
          WHERE deleted_at IS NULL AND source_id = $1 AND id > $2
          ORDER BY id LIMIT 20000`,
        [sourceId, lastId]
      )) as Array<{ id: number | string; doc_id: string | null; dated: boolean }>;
      if (batch.length === 0) break;
      for (const r of batch) {
        dbPages++;
        if (r.doc_id) {
          dbIds.add(r.doc_id);
          if (r.dated) datedIds.add(r.doc_id);
        } else dbPagesWithoutDocId++;
      }
      lastId = Number(batch[batch.length - 1]!.id);
    }

    let diskNotInDb = 0;
    for (const id of diskIds.keys()) if (!dbIds.has(id)) diskNotInDb++;
    let dbNotOnDisk = 0;
    let dbHistorical = 0;
    // Out-of-scope sources have no normalized tree to compare against.
    if (inScope)
      for (const id of dbIds) {
        if (diskIds.has(id)) continue;
        if (datedIds.has(id)) dbHistorical++;
        else dbNotOnDisk++;
      }

    let risSoll: number | null = null;
    let risSollKind: SyncInventorySource["risSollKind"] = null;
    let risSollAt: string | null = null;
    let missingOnDisk = 0;
    let notInRisSoll: number | null = null;
    let aboveSoll = 0;
    const missingByReason: Record<FetchOutcome | "open", number> = {
      open: 0,
      no_text: 0,
      not_found: 0,
      failed: 0,
    };

    const indexFile = INDEX_OF[corpus];
    const indexPath = indexFile ? join(STATE, indexFile) : null;
    if (indexPath && existsSync(indexPath)) {
      const soll = loadIndexIds(indexPath);
      risSoll = soll.size;
      risSollKind = "index";
      risSollAt = new Date(statSync(indexPath).mtimeMs).toISOString();
      for (const id of soll) {
        if (diskIds.has(id)) continue;
        missingOnDisk++;
        const o = outcomes.get(`${corpus}|${id}`);
        missingByReason[o ? o.outcome : "open"]++;
      }
      notInRisSoll = 0;
      for (const id of diskIds.keys()) if (!soll.has(id)) notInRisSoll++;
    } else {
      const key = courtPipelineKey(corpus);
      const hits = key ? risHits.get(key) : undefined;
      if (hits) {
        risSoll = hits;
        risSollKind = "hits";
        missingOnDisk = Math.max(0, hits - diskIds.size);
        missingByReason.open = missingOnDisk;
        aboveSoll = Math.max(0, diskIds.size - hits);
      }
    }

    sources.push({
      corpus,
      sourceId,
      inScope,
      historical: corpus === "at",
      risSoll,
      risSollKind,
      risSollAt,
      rawFiles,
      normalizedFiles,
      diskDocs: diskIds.size,
      dbPages,
      dbDocs: dbIds.size,
      dbPagesWithoutDocId,
      missingOnDisk,
      missingByReason,
      diskNotInDb,
      dbNotOnDisk,
      dbHistorical,
      notInRisSoll,
      aboveSoll,
    });
  }

  return {
    version: 1,
    measuredAt: new Date().toISOString(),
    durationMs: Date.now() - started,
    sources,
  };
}

async function main() {
  const fileCfg = loadConfig();
  if (!fileCfg) throw new Error("No engine configured. Set DATABASE_URL or ~/.gbrain/config.json.");
  const cfg = toEngineConfig(fileCfg);
  const engine = (await createEngine(cfg)) as unknown as Engine;
  await engine.connect(cfg);
  try {
    const inv = await measure(engine);
    const STATE = join(CORPUS_ROOT, "_state");
    const OUT = join(STATE, "corpus-sync-inventory.json");
    mkdirSync(STATE, { recursive: true });
    writeFileSync(`${OUT}.tmp`, JSON.stringify(inv, null, 1));
    renameSync(`${OUT}.tmp`, OUT);
    console.log(
      `corpus-sync-inventory: ${inv.sources.length} Quellen in ${Math.round(inv.durationMs / 1000)} s → ${OUT}`
    );
    if (PRINT) {
      const f = (n: number | null) => (n === null ? "—" : n.toLocaleString("de-AT"));
      for (const s of inv.sources.filter((x) => x.inScope)) {
        console.log(
          `${s.corpus.padEnd(22)} Soll ${f(s.risSoll).padStart(8)}  Platte ${f(s.diskDocs).padStart(8)}  DB ${f(s.dbDocs).padStart(8)}  fehlt ${f(s.missingOnDisk).padStart(8)}  Import ${f(s.diskNotInDb).padStart(6)}  nur-DB ${f(s.dbNotOnDisk).padStart(6)}  nicht-im-Soll ${f(s.notInRisSoll)}`
        );
      }
    }
  } finally {
    await engine.disconnect();
  }
}

if (import.meta.main) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
