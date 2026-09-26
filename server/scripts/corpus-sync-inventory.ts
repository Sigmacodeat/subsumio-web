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
 * Proof per document (`proof`): a document counts as confirmed only when
 * all four hold — RIS lists it (index sources), its file is on disk, the
 * content_hash in the file's frontmatter equals the one of the DB page
 * (Server = Datenbank, checksum), and the plausibility audit accepted exactly
 * this content (corpus_page_verified.content_hash = pages.content_hash).
 * Everything else lands in exactly one problem bucket, so the buckets of the
 * Soll add up to the Soll — a sum the page can check.
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
import { RIS_PAUSE_MS, RIS_USER_AGENT } from "./ris-pace.ts";

const CORPUS_ROOT = process.env.LAW_CORPUS_ROOT ?? "/law-corpus";
const PRINT = process.argv.includes("--print");

/** Sources with an id-exact RIS in-force index. */
export const INDEX_OF: Record<string, string> = {
  "at-normen": "ris-inforce.jsonl",
  "at-landesrecht": "ris-inforce-landesrecht.jsonl",
};

/**
 * Smaller RIS collections without an in-force index: the Soll is the RIS hit
 * count of their search (checked by hand on 2026-09-25 — e.g. Gemeinden 18,663
 * vs 18,171 on disk). Fetched at most once a day, one request every 2 s
 * (RIS OGD terms), cached in _state/ris-hits-cache.json.
 */
export const HITS_QUERY: Record<string, string> = {
  "at-bmerl": "Sonstige?Applikation=Erlaesse",
  "at-avsv": "Sonstige?Applikation=Avsv",
  "at-avn": "Sonstige?Applikation=Avn",
  "at-spg": "Sonstige?Applikation=Spg",
  "at-kmger": "Sonstige?Applikation=KmGer",
  "at-bezirke": "Bezirke?Applikation=Bvb",
  "at-gemeinden": "Gemeinden?Applikation=Gr",
};
const HITS_TTL_MS = 24 * 3600 * 1000;

export type HitsLookup = (corpora: string[]) => Promise<Map<string, number>>;

/** RIS hit counts for HITS_QUERY sources, cached for a day in _state. */
export function risHitsFromApi(stateDir: string): HitsLookup {
  return async (corpora) => {
    const cachePath = join(stateDir, "ris-hits-cache.json");
    let cache: Record<string, { hits: number; at: number }> = {};
    try {
      cache = JSON.parse(readFileSync(cachePath, "utf8"));
    } catch {
      // first run or unreadable — refetch
    }
    const out = new Map<string, number>();
    let asked = 0;
    for (const corpus of corpora) {
      const q = HITS_QUERY[corpus];
      if (!q) continue;
      const hit = cache[corpus];
      if (hit && Date.now() - hit.at < HITS_TTL_MS) {
        out.set(corpus, hit.hits);
        continue;
      }
      if (asked++ > 0) await new Promise((r) => setTimeout(r, RIS_PAUSE_MS));
      try {
        const res = await fetch(`https://data.bka.gv.at/ris/api/v2.6/${q}&DokumenteProSeite=Ten`, {
          headers: { "User-Agent": RIS_USER_AGENT },
          signal: AbortSignal.timeout(30_000),
        });
        const data = (await res.json()) as {
          OgdSearchResult?: { OgdDocumentResults?: { Hits?: { "#text"?: string } } };
        };
        const n = parseInt(data?.OgdSearchResult?.OgdDocumentResults?.Hits?.["#text"] ?? "", 10);
        if (Number.isFinite(n) && n > 0) {
          out.set(corpus, n);
          cache[corpus] = { hits: n, at: Date.now() };
        } else if (hit) out.set(corpus, hit.hits); // keep the last known Soll
      } catch {
        if (hit) out.set(corpus, hit.hits);
      }
    }
    try {
      writeFileSync(cachePath, JSON.stringify(cache, null, 1));
    } catch {
      // read-only state dir in tests — the numbers are still returned
    }
    return out;
  };
}

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
  /** Per-document proof (in scope only). */
  proof?: SyncProof;
}

/**
 * One bucket per document, in the order of the work: confirmed, then the
 * three states of a document that is in the DB, then import, then fetch.
 */
export const PROOF_BUCKETS = [
  "confirmed", //   file = DB by checksum, content check passed for this content
  "mismatch", //    in DB, but checksum file ≠ DB (or missing, or two differing files)
  "defective", //   checksum ok, content check ran after the last change and failed
  "unchecked", //   checksum ok, changed after the last content check (or never checked)
  "importOpen", //  on disk, not in the DB
  "fetchOpen", //   in the RIS Soll, not on disk, fetch still open (or failed)
  "unreachable", // in the RIS Soll, RIS delivers no text / does not know the number
] as const;
export type ProofBucket = (typeof PROOF_BUCKETS)[number];
export type ProofCounts = Record<ProofBucket, number>;

export interface ProofSample {
  id: string;
  /** "ABGB § 5" from the RIS index; null outside it. */
  label: string | null;
}

export interface ProofUnit {
  counts: ProofCounts;
  /** Up to SAMPLE_CAP document numbers per problem bucket, for checking by hand. */
  samples: Partial<Record<ProofBucket, ProofSample[]>>;
}

export interface SyncProof extends ProofUnit {
  /**
   * true = the Soll is a list of document numbers (in-force index): the
   * buckets add up to risSoll exactly. false = the buckets cover what is on
   * disk; fetchOpen is Soll − disk from a hit count (or 0 without Soll).
   */
  sollExact: boolean;
  /** Last full content check of this source; null = never checked. */
  contentCheckAt: string | null;
  /** Landesrecht: the same buckets per Land (bgld, ktn, …). */
  parts?: Record<string, ProofUnit>;
  /** Index sources: counts per statute key (lawKeyFor), in PROOF_BUCKETS order. */
  laws?: Record<string, number[]>;
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

const HEAD_BYTES = 4096;
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
const HASH_RE = /^content_hash:\s*["']?([0-9a-f]{16})\b/m;

/**
 * doc_id → number of files carrying it, the plain file count, and per
 * doc_id the content_hash values its files carry ("" = file without hash).
 */
export function scanNormalized(dir: string): {
  ids: Map<string, number>;
  files: number;
  hashes: Map<string, Set<string>>;
} {
  const ids = new Map<string, number>();
  const hashes = new Map<string, Set<string>>();
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
        const head = readHead(p);
        const id = head.match(DOC_ID_RE)?.[1];
        if (id && id !== "null") {
          ids.set(id, (ids.get(id) ?? 0) + 1);
          let h = hashes.get(id);
          if (!h) hashes.set(id, (h = new Set()));
          h.add(head.match(HASH_RE)?.[1] ?? "");
        }
      }
    }
  };
  walk(dir);
  return { ids, files, hashes };
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

/**
 * In-force index with the statute each document belongs to — the key is the
 * same as lawKeyFor() in src/lib/law-coverage.ts (Landesrecht: "stmk-2000…").
 */
export function loadIndexEntries(path: string): Map<string, { law: string; label: string | null }> {
  const out = new Map<string, { law: string; label: string | null }>();
  for (const line of readFileSync(path, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      const d = JSON.parse(line) as {
        nor?: string;
        id?: string;
        gnr?: string;
        apa?: string | null;
        abk?: string | null;
        kurztitel?: string | null;
      };
      const nor = d.nor ?? d.id;
      if (!nor || d.apa === "§ 0") continue;
      const gnr = d.gnr ?? "";
      const name = d.abk ?? d.kurztitel ?? (gnr ? `Gesetz ${gnr}` : null);
      out.set(nor, {
        law: gnr ? lawKeyFor(nor, gnr) : "",
        label: name ? `${name}${d.apa ? ` ${d.apa}` : ""}` : (d.apa ?? null),
      });
    } catch {
      // skip
    }
  }
  return out;
}

/** Same table as LAND_CODES in src/lib/law-coverage.ts (web and engine stay separate). */
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

/** Land of a Landesrecht document number (LST… → stmk); null otherwise. */
export function landOf(docId: string): string | null {
  return LAND_CODES[docId.match(/^L([A-Z]{2})\d/)?.[1] ?? ""] ?? null;
}

function lawKeyFor(nor: string, gnr: string): string {
  const land = landOf(nor);
  return land && !gnr.startsWith(`${land}-`) ? `${land}-${gnr}` : gnr;
}

export const SAMPLE_CAP = 50;

const emptyCounts = (): ProofCounts => ({
  confirmed: 0,
  mismatch: 0,
  defective: 0,
  unchecked: 0,
  importOpen: 0,
  fetchOpen: 0,
  unreachable: 0,
});

const emptyUnit = (): ProofUnit => ({ counts: emptyCounts(), samples: {} });

function addTo(unit: ProofUnit, bucket: ProofBucket, sample: ProofSample) {
  unit.counts[bucket]++;
  if (bucket === "confirmed") return;
  const list = (unit.samples[bucket] ??= []);
  if (list.length < SAMPLE_CAP) list.push(sample);
}

/** What the DB holds for one doc_id (all live pages carrying it). */
interface DbDoc {
  hashes: Set<string>;
  allVerified: boolean;
  changedSinceCheck: boolean;
  dated: boolean;
}

/**
 * The bucket of one document that is on disk and in the DB. The checksum
 * comes first: a page whose content differs from the file is not "the"
 * document, whatever the content check said about it.
 */
export function classifyInDb(
  disk: Set<string> | undefined,
  db: DbDoc,
  checked: boolean
): Exclude<ProofBucket, "importOpen" | "fetchOpen" | "unreachable"> {
  const diskHash = disk && disk.size === 1 ? [...disk][0]! : "";
  const dbHash = db.hashes.size === 1 ? [...db.hashes][0]! : "";
  if (!diskHash || !dbHash || diskHash !== dbHash) return "mismatch";
  if (db.allVerified) return "confirmed";
  if (!checked || db.changedSinceCheck) return "unchecked";
  return "defective";
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
  corpusRoot: string = CORPUS_ROOT,
  lookupHits: HitsLookup = risHitsFromApi(join(corpusRoot, "_state"))
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

  const smallHits = await lookupHits([...corpora].filter((c) => HITS_QUERY[c]));

  // Content check (audit-plausibility-full.ts): the positive list and the
  // time of each source's last full run. Both tables appear with the first
  // audit — before that, nothing is confirmed and everything is unchecked.
  const hasVerified = await engine
    .executeRaw(`SELECT to_regclass('corpus_page_verified') IS NOT NULL AS ok`)
    .then((r) => (r as Array<{ ok: boolean }>)[0]?.ok === true)
    .catch(() => false);
  const checkedAt = new Map<string, string>();
  await engine
    .executeRaw(
      `SELECT source_id, last_plausibility_check FROM corpus_status
        WHERE last_plausibility_check IS NOT NULL`
    )
    .then((rows) => {
      for (const r of rows as Array<{ source_id: string; last_plausibility_check: string | Date }>)
        checkedAt.set(r.source_id, new Date(r.last_plausibility_check).toISOString());
    })
    .catch(() => undefined);

  const sources: SyncInventorySource[] = [];
  for (const corpus of [...corpora].sort()) {
    const inScope = corpus === "at" || corpus.startsWith("at-");
    const sourceId = corpus === "eu-regulations" ? "law-eu" : `law-${corpus}`;
    const rawDir = corpus.startsWith("eu-")
      ? join(corpusRoot, "eu", corpus.slice(3))
      : join(corpusRoot, corpus);
    const rawFiles = countMd(rawDir);
    const {
      ids: diskIds,
      files: normalizedFiles,
      hashes: diskHashes,
    } = inScope
      ? scanNormalized(join(NORMALIZED, corpus))
      : { ids: new Map<string, number>(), files: 0, hashes: new Map<string, Set<string>>() };

    const lastCheck = checkedAt.get(sourceId) ?? null;
    // DB: distinct doc_id of live pages, read in id order to keep memory flat.
    // Hash and content verdict only where they are used (in scope).
    const dbDocs = new Map<string, DbDoc>();
    let dbPages = 0;
    let dbPagesWithoutDocId = 0;
    let lastId = 0;
    const proofCols =
      inScope && hasVerified
        ? `, p.frontmatter->>'content_hash' AS fm_hash,
             (v.content_hash IS NOT NULL AND v.content_hash = p.content_hash) AS verified,
             ($3::timestamptz IS NULL OR p.updated_at > $3::timestamptz) AS changed`
        : inScope
          ? `, p.frontmatter->>'content_hash' AS fm_hash, false AS verified, true AS changed`
          : "";
    const proofJoin =
      inScope && hasVerified ? "LEFT JOIN corpus_page_verified v ON v.page_id = p.id" : "";
    for (;;) {
      const batch = (await engine.executeRaw(
        `SELECT p.id, p.frontmatter->>'doc_id' AS doc_id,
                nullif(p.frontmatter->>'in_force_to', '') IS NOT NULL AS dated${proofCols}
           FROM pages p ${proofJoin}
          WHERE p.deleted_at IS NULL AND p.source_id = $1 AND p.id > $2
          ORDER BY p.id LIMIT 20000`,
        inScope && hasVerified ? [sourceId, lastId, lastCheck] : [sourceId, lastId]
      )) as Array<{
        id: number | string;
        doc_id: string | null;
        dated: boolean;
        fm_hash?: string | null;
        verified?: boolean;
        changed?: boolean;
      }>;
      if (batch.length === 0) break;
      for (const r of batch) {
        dbPages++;
        if (r.doc_id) {
          let d = dbDocs.get(r.doc_id);
          if (!d) {
            d = { hashes: new Set(), allVerified: true, changedSinceCheck: false, dated: false };
            dbDocs.set(r.doc_id, d);
          }
          d.hashes.add(r.fm_hash ?? "");
          if (r.verified !== true) d.allVerified = false;
          if (r.changed !== false) d.changedSinceCheck = true;
          if (r.dated) d.dated = true;
        } else dbPagesWithoutDocId++;
      }
      lastId = Number(batch[batch.length - 1]!.id);
    }
    const dbIds = dbDocs;

    let diskNotInDb = 0;
    for (const id of diskIds.keys()) if (!dbIds.has(id)) diskNotInDb++;
    let dbNotOnDisk = 0;
    let dbHistorical = 0;
    // Out-of-scope sources have no normalized tree to compare against.
    if (inScope)
      for (const [id, d] of dbIds) {
        if (diskIds.has(id)) continue;
        if (d.dated) dbHistorical++;
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
    const proof: SyncProof = {
      ...emptyUnit(),
      sollExact: false,
      contentCheckAt: lastCheck,
    };
    const parts = corpus === "at-landesrecht" ? new Map<string, ProofUnit>() : null;
    const laws = new Map<string, number[]>();
    const place = (id: string, bucket: ProofBucket, label: string | null, law: string | null) => {
      const sample = { id, label };
      addTo(proof, bucket, sample);
      if (parts) {
        const land = landOf(id) ?? "unbekannt";
        let u = parts.get(land);
        if (!u) parts.set(land, (u = emptyUnit()));
        addTo(u, bucket, sample);
      }
      if (law) {
        let c = laws.get(law);
        if (!c) laws.set(law, (c = PROOF_BUCKETS.map(() => 0)));
        c[PROOF_BUCKETS.indexOf(bucket)]!++;
      }
    };
    const inDbBucket = (id: string) =>
      classifyInDb(diskHashes.get(id), dbIds.get(id)!, lastCheck !== null && hasVerified);

    if (indexPath && existsSync(indexPath)) {
      const soll = loadIndexEntries(indexPath);
      risSoll = soll.size;
      risSollKind = "index";
      risSollAt = new Date(statSync(indexPath).mtimeMs).toISOString();
      proof.sollExact = true;
      for (const [id, entry] of soll) {
        const law = entry.law || null;
        if (!diskIds.has(id)) {
          missingOnDisk++;
          const o = outcomes.get(`${corpus}|${id}`);
          missingByReason[o ? o.outcome : "open"]++;
          const unreachable = o?.outcome === "no_text" || o?.outcome === "not_found";
          place(id, unreachable ? "unreachable" : "fetchOpen", entry.label, law);
        } else if (!dbIds.has(id)) place(id, "importOpen", entry.label, law);
        else place(id, inDbBucket(id), entry.label, law);
      }
      notInRisSoll = 0;
      for (const id of diskIds.keys()) if (!soll.has(id)) notInRisSoll++;
    } else {
      const key = courtPipelineKey(corpus);
      const hits = key ? risHits.get(key) : smallHits.get(corpus);
      if (hits) {
        risSoll = hits;
        risSollKind = "hits";
        missingOnDisk = Math.max(0, hits - diskIds.size);
        missingByReason.open = missingOnDisk;
        aboveSoll = Math.max(0, diskIds.size - hits);
      }
      // No list of numbers: the buckets cover what is on disk; what RIS
      // holds beyond it is only known as a count.
      if (inScope) {
        for (const id of diskIds.keys()) {
          if (!dbIds.has(id)) place(id, "importOpen", null, null);
          else place(id, inDbBucket(id), null, null);
        }
        proof.counts.fetchOpen = missingOnDisk;
      }
    }
    if (parts) proof.parts = Object.fromEntries([...parts].sort(([a], [b]) => a.localeCompare(b)));
    if (laws.size > 0) proof.laws = Object.fromEntries(laws);

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
      ...(inScope && corpus !== "at" ? { proof } : {}),
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
