import { createHandler, apiSuccess } from "@/lib/api-handler";
import { getSharedPgPool } from "@/lib/auth/store";
import { listCorpusNames, getCorpusIndex } from "@/lib/corpus-index";
import { SOURCE_LABELS } from "@/lib/corpus-labels";
import { readFileSync, existsSync, readdirSync } from "fs";
import { readdir, stat } from "fs/promises";
import type { Dirent } from "fs";
import { join } from "path";
import { lawCorpusDir, lawCorpusNormalizedDir } from "@/lib/corpus-paths";
import { deriveLiveRows, PIPELINE_KEY_TO_DIR } from "@/lib/corpus-pipeline-live";
import {
  latestSnapshotAt,
  readLatestInventory,
  recentWritesBySource,
} from "@/lib/corpus-inventory";

import { logger } from "@/lib/logger";
const log = logger("api/admin/corpus-command-center");

export const dynamic = "force-dynamic";
export const maxDuration = 15;

const NORMALIZED_ROOT = lawCorpusNormalizedDir();
const RAW_ROOT = lawCorpusDir();
const FLAGS_FILE = join(NORMALIZED_ROOT, "_steward-flags.json");

// Corpus-Name → Verzeichnis relativ zum Corpus-Root, wenn es vom Namen
// abweicht (eu/ ist ein Container mit zwei Unter-Corpora).
const CORPUS_DIR_OVERRIDES: Record<string, string> = {
  "eu-directives": "eu/directives",
  "eu-regulations": "eu/regulations",
};

// Disk-Wahrheit = max(_normalized, raw): _normalized ist die
// Normalisierungs-Gate-Ausgabe (viaNormalized — jeder Import liest daraus),
// raw enthält zusätzlich frisch gefetchte, noch nicht normalisierte Dateien.
// max() bildet "was wir lokal haben" vollständig ab.
//
// Rekursiver .md-Scan kostet ~7s über den ganzen Bestand — pro Corpus
// gecacht, damit das 5s-Polling das FS nicht dauerhaft rödelt.
const DISK_COUNT_TTL_MS = 30_000;
const diskCountCache = new Map<string, { n: number; t: number }>();

// Async-Walk statt readdirSync(recursive): ein synchroner Scan über ~700k
// Dateien blockiert den Event Loop für Sekunden — hier yieldet jede
// Verzeichnis-Ebene, damit das 5s-Polling andere Requests nicht ausbremst.
// Zusätzlich mtime-memoisiert pro Verzeichnis: ein Dir ohne mtime-Änderung
// kann seinen Subtree-Count wiederverwenden, ohne nochmal readdir'd zu
// werden — der Re-Scan kostet dann nur noch O(changed dirs) statt O(files).
// ctime wird mitverglichen: auf Dateisystemen mit grober mtime-Granularität
// (mancher NFS/FUSE-Mounts ~1s) kann eine Add+Remove-Sequenz in derselben
// Sekunde an mtime vorbeigehen — ctime deckt Inode-Metadaten zusätzlich ab.
// fs.watch wäre die Alternative, skaliert aber nicht (inotify-Limits bei
// 700k Dateien).
const dirScanCache = new Map<
  string,
  Map<string, { mtimeMs: number; ctimeMs: number; n: number }>
>();

async function countMdFiles(root: string): Promise<number> {
  const prev = dirScanCache.get(root) ?? new Map();
  const next = new Map<string, { mtimeMs: number; ctimeMs: number; n: number }>();

  const walk = async (dir: string): Promise<number> => {
    const st1 = await stat(dir).catch(() => null);
    if (!st1?.isDirectory()) return 0;
    const hit = prev.get(dir);
    if (hit && hit.mtimeMs === st1.mtimeMs && hit.ctimeMs === st1.ctimeMs) {
      next.set(dir, hit);
      return hit.n;
    }
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => [] as Dirent[]);
    let n = 0;
    for (const e of entries) {
      if (e.isDirectory()) n += await walk(join(dir, e.name));
      else if (e.name.endsWith(".md")) n++;
    }
    // Double-stat: änderte sich das Dir während des Reads, ist der Count
    // racy — dann nicht cachen (nächster Scan sieht die neuere mtime).
    const st2 = await stat(dir).catch(() => null);
    if (st2 && st2.mtimeMs === st1.mtimeMs && st2.ctimeMs === st1.ctimeMs)
      next.set(dir, { mtimeMs: st1.mtimeMs, ctimeMs: st1.ctimeMs, n });
    return n;
  };

  const n = await walk(root);
  // `next` enthält nur besuchte Dirs — gelöschte Verzeichnisse werden
  // damit automatisch aus dem Cache ausgemustert.
  dirScanCache.set(root, next);
  return n;
}

async function corpusDiskCount(corpus: string): Promise<number> {
  const hit = diskCountCache.get(corpus);
  if (hit && Date.now() - hit.t < DISK_COUNT_TTL_MS) return hit.n;
  const rel = CORPUS_DIR_OVERRIDES[corpus] ?? corpus;
  const [normalized, raw] = await Promise.all([
    countMdFiles(join(NORMALIZED_ROOT, rel)),
    countMdFiles(join(RAW_ROOT, rel)),
  ]);
  const n = Math.max(normalized, raw, getCorpusIndex(corpus).length);
  diskCountCache.set(corpus, { n, t: Date.now() });
  return n;
}

interface CorpusSyncRow {
  corpus: string;
  sourceId: string;
  /** Anzeigename für Operatoren (SOURCE_LABELS-Fallback: corpus). */
  label: string;
  /** Historisches Archiv (law-at): DB-Bestand ist bewusst über RIS hinaus,
   *  kein Fehler — wird nicht als Orphan/Lücke geführt. */
  historical: boolean;
  diskFiles: number;
  dbPages: number;
  /** Distincte Dokumente in der DB (COUNT DISTINCT import_filename).
   *  Bei Judikatur 1:1 mit dbPages; bei Gesetzen 1 Datei → viele Pages.
   *  Dies ist die korrekte Vergleichsgröße mit RIS Total (Dokumente). */
  dbDocuments: number;
  dbChunks: number;
  embeddedChunks: number;
  staleChunks: number;
  coveragePct: number;
  /** Auf Disk aber nicht in DB — die Import-Lücke. */
  notImported: number;
  /** Korpus ist 100% fertig: importiert, embedded, keine Lücken. */
  fullyComplete: boolean;
  /** In DB aber nicht auf Disk — verwaiste DB-Einträge. */
  orphanDb: number;
  syncStatus: "synced" | "import_pending" | "orphan_in_db" | "no_db" | "historical";
  /** Live RIS OGD Total für diesen Korpus (null wenn unbekannt). */
  risTotal: number | null;
  /** Fehlende Dokumente: RIS OGD Total minus DB-Dokumente (DISTINCT import_filename). */
  missingFromDb: number;
  /** Noch nicht auf Disk: RIS OGD Total minus lokale Dateien. */
  missingFromDisk: number;
  /** Auf Disk aber noch nicht in DB (Disk-Dokumente minus DB-Dokumente). */
  diskPending: number;
  /** Neu auf RIS seit letztem lokalen Sync (RIS - Disk, wenn positiv). */
  newOnRis: number;
  /** Ob für diesen Korpus ein Backfill sinnvoll ist. */
  canUpdate: boolean;
  /** Pipeline source_key für One-Click Backfill (null wenn kein Mapping). */
  pipelineKey: string | null;
  /** RIS-Lücken sind unerreichbar (nur Platzhalter liefert). */
  fetchFruitless: boolean;
  /** Fortschritt des Disk-Imports in Prozent (dbDocuments / diskFiles). */
  diskProgress: number;
}

interface WorkQueueItem {
  path: string;
  corpus: string;
  flag: "defective" | "needs_review";
  note: string;
  flaggedBy: string;
  flaggedAt: string;
}

interface PipelineStateRow {
  source: string;
  stage: string;
  status: string;
  pid: number | null;
  pidCmd: string | null;
  startedAt: string | null;
  lastUpdated: string | null;
  /** Orchestrator-Heartbeat — pipeline_state.updated_at wird pro Zyklus
   *  angefasst; >20min alt heißt: Orchestrator läuft nicht mehr. */
  heartbeatAt: string | null;
  diskCount: number;
  dbPages: number;
  risTotal: number | null;
  alertFlags: string[];
}

interface TrustRow {
  corpus: string;
  verified: number;
  needsReview: number;
  defective: number;
  archived: number;
  unreviewed: number;
  total: number;
}

interface RisDeltaRow {
  /** RIS Applikation-Code, z.B. "BrKons" */
  applikation: string;
  /** Lesbarer Label */
  label: string;
  /** Letzter Sync-Zeitpunkt (ISO) */
  lastSync: string | null;
  /** Pipeline-Stage: "idle" | "running" | "ok" | "alerts" | "failed" */
  stage: string;
  /** Aktive Alerts für diese Applikation */
  alerts: Array<{ type: string; severity: string; message: string; raised_at: string }>;
  /** Hat ein laufender Prozess (PID) */
  running: boolean;
}

/**
 * GET /api/admin/corpus-command-center
 *
 * Die Live-Schaltzentrale: kombiniert Disk-Index, DB-Seiten, Embeddings,
 * Quality-Flags und Pipeline-State in einer Antwort.
 *
 * 4 Sections:
 *  1. Sync-Status: Lokal vs DB (pro Korpus)
 *  2. Work Queue: Auffälligkeiten als priorisierte Task-Liste
 *  3. Pipeline Live-Status
 *  4. Trust Status (verified/unreviewed/defective)
 */
export const GET = createHandler(
  {
    action: "platform.operator",
    cacheMaxAge: 30,
  },
  async () => {
    // ── 2. DB-Stats (Server) ──
    const pool = getSharedPgPool();
    const dbStats: Record<
      string,
      {
        pages: number;
        documents: number;
        chunks: number;
        embedded: number;
        /** Letzter Write auf pages dieser Source — Live-Heartbeat für
         *  Import-Stages (measure-don't-remember). */
        lastWrite: string | null;
      }
    > = {};
    let pipelineState: PipelineStateRow[] = [];
    let pipelinePaused = false;
    let dbAvailable = false;
    let snapshotAt: string | null = null;
    let risFetchers: Array<{
      slot: number;
      holder: string;
      command: string;
      acquiredAt: string | null;
      heartbeatAt: string | null;
      stale: boolean;
    }> = [];

    if (pool) {
      try {
        // Per-source DB numbers from the 10-minute snapshot (3 ms). Until
        // 2026-09-24 this was a live pages×chunks join — 38 s on prod, and
        // this route is polled every 5 s while anything runs, so several of
        // those overlapped on the DB at all times: the page was unusable
        // and the pipeline itself was slowed. dbDocuments (distinct
        // import_filename — one file per RIS document, the unit RIS totals
        // use; a statute file becomes many §-pages) is in the snapshot
        // since migration 147.
        const inventory = await readLatestInventory(pool);
        snapshotAt = latestSnapshotAt(inventory);
        // The one thing that must stay real-time: the last write per
        // source, for the "läuft / hängt" signal on the pipeline tab.
        // Index-backed, ~2 ms; only sources written in the last 15 min are
        // returned, everything else keeps the snapshot's value.
        const recent = await recentWritesBySource(pool).catch(() => new Map<string, string>());
        for (const r of inventory) {
          dbStats[r.source_id] = {
            pages: r.pages,
            documents: r.documents,
            chunks: r.chunks,
            embedded: r.embedded,
            lastWrite: recent.get(r.source_id) ?? r.last_updated,
          };
        }
        // Only a snapshot that actually exists counts as "DB available" —
        // `pool` being truthy just means a pool object was constructed, not
        // that the DB answered. Before this fix dbAvailable was set to true
        // as soon as `pool` existed, so a failed query silently rendered
        // every source as 0 / "Nicht importiert" with no "DB nicht
        // erreichbar" warning anywhere on the page.
        dbAvailable = inventory.length > 0;
      } catch (err) {
        log.error("[corpus-command-center] inventory snapshot read failed:", err);
      }

      // Pipeline State
      try {
        const pipeResult = await pool.query(`
          SELECT source_key, stage, pid, pid_started_at, pid_cmd, last_cycle_at, updated_at,
                 disk_count, db_pages, ris_total, alert_flags
          FROM pipeline_state
          ORDER BY source_key
        `);
        pipelineState = pipeResult.rows.map((r) => ({
          source: r.source_key,
          stage: r.stage,
          status: r.stage,
          pid: r.pid ? parseInt(r.pid, 10) : null,
          pidCmd: r.pid_cmd || null,
          startedAt: r.pid_started_at ? new Date(r.pid_started_at).toISOString() : null,
          lastUpdated: r.last_cycle_at ? new Date(r.last_cycle_at).toISOString() : null,
          heartbeatAt: r.updated_at ? new Date(r.updated_at).toISOString() : null,
          diskCount: r.disk_count || 0,
          dbPages: r.db_pages || 0,
          risTotal: r.ris_total || null,
          alertFlags: Array.isArray(r.alert_flags) ? r.alert_flags : [],
        }));
      } catch (err) {
        log.error("[corpus-command-center] pipeline_state query failed:", err);
      }

      // RIS-Fetcher: live aus der Semaphore-Tabelle. Manuelle Downloads
      // (refetch-broken-files & Co.) halten Slots statt pipeline_state-Rows —
      // ohne diesen Block sind laufende RIS-Jobs auf der Seite unsichtbar.
      try {
        const lockResult = await pool.query(`
          SELECT id, holder, command, acquired_at, heartbeat_at
          FROM ris_lock ORDER BY id
        `);
        const nowMs = Date.now();
        risFetchers = lockResult.rows.map((r) => {
          const hb = r.heartbeat_at ? new Date(r.heartbeat_at).getTime() : null;
          return {
            slot: parseInt(r.id, 10),
            holder: r.holder,
            command: r.command,
            acquiredAt: r.acquired_at ? new Date(r.acquired_at).toISOString() : null,
            heartbeatAt: hb ? new Date(hb).toISOString() : null,
            // >5min ohne Heartbeat = stale (wird vom nächsten Acquire gestohlen)
            stale: hb === null || nowMs - hb > 5 * 60_000,
          };
        });
      } catch {
        // Tabelle existiert evtl. noch nicht — kein Fehler
      }

      // Pipeline paused?
      try {
        const pauseResult = await pool.query(`
          SELECT value FROM pipeline_config WHERE key = 'paused'
        `);
        if (pauseResult.rows.length > 0) {
          pipelinePaused = pauseResult.rows[0].value?.paused === true;
        }
      } catch (err) {
        log.error("[corpus-command-center] pipeline_config query failed:", err);
      }
    }

    // ── 1b. Corpus-Liste + Disk-Counts ──
    // Union aus vier Quellen, damit JEDER Bestand sichtbar ist:
    //  a) _normalized/* — Steward-Korpus (AT)
    //  b) raw law-corpus/* — Pipeline-Fetch/Import-Quelle (de-*, ch-*, eu/*)
    //  c) DB source_ids law-* — importiert, aber evtl. ohne Dir
    //  d) pipeline_state source_keys — via PIPELINE_KEY_TO_DIR
    const normalizedCorpora = listCorpusNames();
    const corpusSet = new Set<string>(normalizedCorpora);

    if (existsSync(RAW_ROOT)) {
      try {
        for (const d of readdirSync(RAW_ROOT, { withFileTypes: true })) {
          if (!d.isDirectory() || d.name.startsWith("_")) continue;
          if (d.name === "eu") {
            // eu/ ist ein Container — Corpora sind die Unterordner.
            for (const sub of readdirSync(join(RAW_ROOT, "eu"), {
              withFileTypes: true,
            })) {
              if (sub.isDirectory()) corpusSet.add(`eu-${sub.name}`);
            }
            continue;
          }
          corpusSet.add(d.name);
        }
      } catch {
        /* Volume nicht erreichbar → nur normalized/DB */
      }
    }

    const corpora = [...corpusSet].sort();
    const diskCounts: Record<string, number> = {};
    await Promise.all(corpora.map(async (c) => (diskCounts[c] = await corpusDiskCount(c))));

    if (corpora.length === 0) {
      // Fallback (Web-Container ohne law-corpus Volume):
      // DB source_ids als Corpus-Liste verwenden.
      corpora.push(...Object.keys(dbStats).filter((s) => s !== "unknown" && s !== "default"));
    }

    // ── 3. Flags (Quality) ──
    let flags: Record<
      string,
      { flag: string; note: string; flaggedBy: string; flaggedAt: string }
    > = {};
    if (existsSync(FLAGS_FILE)) {
      try {
        flags = JSON.parse(readFileSync(FLAGS_FILE, "utf-8"));
      } catch {
        /* corrupt JSON → leer */
      }
    }

    // ── 4. Sync-Status zusammenbauen ──
    // BUG 20+21: corpora sind Directory-Namen (at, at-normen, at-judikatur-vwgh),
    // aber dbStats ist nach source_id gekeyed (law-at, law-at-judikatur-vwgh).
    // Ohne Mapping zeigte das Command Center für ALLE Corpora 0 DB-Pages/0 Chunks.
    //
    // CORPUS_TO_SOURCE_ID: mappt Directory-Name → DB source_id.
    // CORPUS_TO_PIPELINE_KEY: mappt Directory-Name → pipeline_state.source_key.
    //   Direktes Mapping (nicht via source_id), weil at + at-normen beide
    //   source_id=law-at haben aber unterschiedliche pipeline keys
    //   (statutes-at vs normen-at).
    const CORPUS_TO_SOURCE_ID: Record<string, string> = {
      at: "law-at",
      // Federal paragraphs are imported into law-at-normen (147k pages); law-at
      // holds only the old whole-statute split.
      "at-normen": "law-at-normen",
      "at-landesrecht": "law-at-landesrecht",
      "at-staatsvertraege": "law-at-staatsvertraege",
      "at-literatur": "law-at-literatur",
      "at-judikatur": "law-at-judikatur",
      "at-judikatur-vwgh": "law-at-judikatur-vwgh",
      "at-judikatur-vfgh": "law-at-judikatur-vfgh",
      "at-judikatur-lvwg": "law-at-judikatur-lvwg",
      "at-judikatur-bvwg": "law-at-judikatur-bvwg",
      "at-judikatur-asylgh": "law-at-judikatur-asylgh",
      "at-judikatur-uvs": "law-at-judikatur-uvs",
      "at-judikatur-dsk": "law-at-judikatur-dsk",
      "at-judikatur-dok": "law-at-judikatur-dok",
      "at-judikatur-gbk": "law-at-judikatur-gbk",
      "at-judikatur-pvak": "law-at-judikatur-pvak",
      "at-judikatur-ubas": "law-at-judikatur-ubas",
      "at-judikatur-umse": "law-at-judikatur-umse",
      // BUG 24: Diese Corpora existieren auf Disk aber haben keine Pipeline-Source.
      // Sie werden via batch-import-from-disk manuell importiert. Ohne Mapping
      // zeigte das Command Center sourceId=corpus (Directory-Name) statt law-at-*.
      "at-avn": "law-at-avn",
      "at-avsv": "law-at-avsv",
      "at-bezirke": "law-at-bezirke",
      "at-bmerl": "law-at-bmerl",
      "at-gemeinden": "law-at-gemeinden",
      "at-kmger": "law-at-kmger",
      "at-spg": "law-at-spg",
      de: "law-de",
      "de-judikatur": "law-de-judikatur",
      "de-literatur": "law-de-literatur",
      "de-materialien": "law-de-materialien",
      ch: "law-ch",
      "ch-judikatur": "law-ch-judikatur",
      "ch-literatur": "law-ch-literatur",
      "eu-directives": "law-eu-directives",
      "eu-regulations": "law-eu",
    };

    // BUG 48: pipeline_state.source_key ist 'jud-ogh', 'jud-vwgh', 'statutes-at',
    // nicht 'ogh'/'vwgh'. Ohne 'jud-'-Prefix fand der Lookup kein RIS Total.
    const CORPUS_TO_PIPELINE_KEY: Record<string, string> = {
      at: "statutes-at",
      "at-normen": "normen-at",
      "at-landesrecht": "landesrecht",
      "at-staatsvertraege": "staatsvertraege",
      "at-literatur": "literatur-at",
      "at-judikatur": "jud-ogh",
      "at-judikatur-vwgh": "jud-vwgh",
      "at-judikatur-vfgh": "jud-vfgh",
      "at-judikatur-lvwg": "jud-lvwg",
      "at-judikatur-bvwg": "jud-bvwg",
      "at-judikatur-asylgh": "jud-asylgh",
      "at-judikatur-uvs": "jud-uvs",
      "at-judikatur-dsk": "jud-dsk",
      "at-judikatur-dok": "jud-dok",
      "at-judikatur-gbk": "jud-gbk",
      "at-judikatur-pvak": "jud-pvak",
      "at-judikatur-ubas": "jud-ubas",
      "at-judikatur-umse": "jud-umse",
      de: "statutes-de",
      "de-literatur": "literatur-de",
      "de-materialien": "materialien-de",
      ch: "statutes-ch",
      "ch-literatur": "literatur-ch",
      "eu-directives": "eu-directives",
      "eu-regulations": "eu-regulations",
    };

    // Pipeline-State Lookup-Map: source_key → { diskCount, dbPages, risTotal }
    const pipelineBySource: Record<
      string,
      { diskCount: number; dbPages: number; risTotal: number | null }
    > = {};
    for (const p of pipelineState) {
      pipelineBySource[p.source] = {
        diskCount: p.diskCount,
        dbPages: p.dbPages,
        risTotal: p.risTotal,
      };
    }

    // Union-Teil c)+d): DB-Quellen und Pipeline-Keys ohne eigenes Dir.
    // dbStats enthält auch brain_*-Quellen (Tenant-Daten) — nur law-* ist Corpus.
    const SOURCE_ID_TO_CORPUS: Record<string, string> = {};
    for (const [corpus, sid] of Object.entries(CORPUS_TO_SOURCE_ID)) {
      if (!(sid in SOURCE_ID_TO_CORPUS)) SOURCE_ID_TO_CORPUS[sid] = corpus;
    }
    for (const sid of Object.keys(dbStats)) {
      if (!sid.startsWith("law-")) continue;
      const corpus = SOURCE_ID_TO_CORPUS[sid] ?? sid;
      if (!corpusSet.has(corpus)) {
        corpusSet.add(corpus);
        corpora.push(corpus);
        diskCounts[corpus] = await corpusDiskCount(corpus);
      }
    }
    for (const p of pipelineState) {
      const dir =
        PIPELINE_KEY_TO_DIR[p.source.replace(/^backfill-/, "")] ?? PIPELINE_KEY_TO_DIR[p.source];
      if (!dir) continue;
      const corpus = dir.includes("/") ? dir.replace("/", "-") : dir;
      if (!corpusSet.has(corpus)) {
        corpusSet.add(corpus);
        corpora.push(corpus);
        diskCounts[corpus] = await corpusDiskCount(corpus);
      }
    }
    corpora.sort();

    const syncRows: CorpusSyncRow[] = [];

    for (const corpus of corpora) {
      // BUG 20+21: corpus ist ein Directory-Name, dbStats ist nach source_id gekeyed.
      // Ohne CORPUS_TO_SOURCE_ID-Mapping waren alle DB-Stats 0.
      const sourceId = CORPUS_TO_SOURCE_ID[corpus] ?? corpus;
      const stats = dbStats[sourceId];
      const dbPages = stats?.pages ?? 0;
      // BUG 47: dbDocuments ist die korrekte Vergleichsgröße mit RIS Total.
      // Fallback auf dbPages wenn import_filename nicht gesetzt (ältere Imports).
      const dbDocuments = stats?.documents ?? dbPages;
      const dbChunks = stats?.chunks ?? 0;
      const embedded = stats?.embedded ?? 0;

      // Disk-Zahl: aus pipeline_state via direktem Corpus→PipelineKey-Mapping
      const pipelineKey = CORPUS_TO_PIPELINE_KEY[corpus];
      const pipelineInfo = pipelineKey ? pipelineBySource[pipelineKey] : undefined;
      const disk = pipelineInfo ? pipelineInfo.diskCount : (diskCounts[corpus] ?? 0);
      // Historisches Archiv (law-at): alte Gesetzesfassungen, bewusst über
      // dem RIS-In-force-Soll — weder Lücke noch Orphan, eigener Status.
      // Der In-force-Index ist für das Archiv kein gültiges Soll: es würde
      // tausende "fehlende" Dokumente melden, die bewusst nicht Teil des
      // Archivs sind (geltende Normen leben in law-at-normen).
      const historical = corpus === "at";
      // RIS Total: aus pipeline_state, wenn verfügbar — null für Archive.
      const risTotal =
        !historical && pipelineInfo && pipelineInfo.risTotal ? pipelineInfo.risTotal : null;

      const stale = dbChunks - embedded;
      const coverage = dbChunks > 0 ? Math.round((embedded / dbChunks) * 1000) / 10 : 0;

      // Differenzen zum Source-of-Truth RIS OGD
      // BUG 47: RIS Total ist in Dokumenten, nicht in Pages. Daher mit
      // dbDocuments vergleichen, nicht dbPages. Bei Judikatur 1:1, bei
      // Gesetzen 1 Datei → viele Pages (z.B. normen: 4081 Dateien → 52603 Pages).
      const missingFromDb = risTotal !== null ? Math.max(0, risTotal - dbDocuments) : 0;
      const missingFromDisk = risTotal !== null ? Math.max(0, risTotal - disk) : 0;
      const diskPending = Math.max(0, disk - dbDocuments);
      const newOnRis = risTotal !== null ? Math.max(0, risTotal - disk) : 0;
      // Heuristik: Wenn Judikatur viele RIS-Dokumente fehlen, aber nur wenige
      // echte Volltexte auf Disk vorhanden sind, produziert ein RIS-Backfill nur
      // Platzhalter ("Volltext nicht abrufbar"). Solche Lücken werden als
      // unerreichbar markiert, damit das Dashboard sie nicht als offene Arbeit
      // anzeigt. Beispiel: ogh 81k RIS-Lücken vs. 1k echte Disk-Dateien.
      const isJudikatur = corpus.startsWith("at-judikatur");
      const fetchFruitless =
        isJudikatur &&
        risTotal !== null &&
        missingFromDb > 0 &&
        (disk === 0 || missingFromDb > disk * 2);
      // Orphan: DB-Dokumente ohne entsprechenden Disk-Bestand.
      // Für RIS-Sources: risTotal ist Source-of-Truth → dbDocuments > risTotal = orphan.
      // Für Nicht-RIS: disk-Dateien vs dbDocuments kann nicht direkt verglichen werden.
      // Zuverlässiger Signal: disk=0 aber dbPages>0 → alle DB-Pages sind orphan.
      const orphanDb =
        risTotal !== null
          ? Math.max(0, dbDocuments - risTotal)
          : disk === 0 && dbPages > 0
            ? dbPages
            : 0;

      // Status: Wahrheitsgemäß nach RIS für RIS-Sources; für Nicht-RIS konservativ
      let syncStatus: CorpusSyncRow["syncStatus"] = "synced";
      if (dbPages === 0 && disk > 0) {
        syncStatus = "no_db";
      } else if (missingFromDb > 0) {
        syncStatus = "import_pending";
      } else if (diskPending > 0) {
        syncStatus = "import_pending";
      } else if (risTotal !== null && orphanDb > 0) {
        syncStatus = "orphan_in_db";
      } else if (disk === 0 && dbPages > 0) {
        syncStatus = "orphan_in_db";
      }
      if (historical) syncStatus = "historical";

      // notImported: Dateien auf Disk die noch nicht in der DB sind.
      // BUG 47: Für RIS-Sources ist missingFromDb die echte Lücke (risTotal - dbDocuments).
      const notImported = risTotal !== null ? missingFromDb : dbPages === 0 && disk > 0 ? disk : 0;
      const canUpdate =
        risTotal !== null && pipelineKey != null && missingFromDb > 0 && !fetchFruitless;

      syncRows.push({
        corpus,
        sourceId,
        label: SOURCE_LABELS[sourceId] ?? corpus,
        historical,
        diskFiles: disk,
        dbPages,
        dbDocuments,
        dbChunks,
        embeddedChunks: embedded,
        staleChunks: stale,
        coveragePct: coverage,
        notImported,
        orphanDb,
        syncStatus,
        fullyComplete:
          coverage === 100 &&
          stale === 0 &&
          dbPages > 0 &&
          missingFromDb === 0 &&
          diskPending === 0 &&
          orphanDb === 0 &&
          !fetchFruitless,
        risTotal,
        missingFromDb: fetchFruitless ? 0 : missingFromDb,
        missingFromDisk,
        newOnRis: fetchFruitless ? 0 : newOnRis,
        diskPending,
        diskProgress: disk > 0 ? Math.min(100, Math.round((dbDocuments / disk) * 1000) / 10) : 0,
        canUpdate,
        pipelineKey: pipelineKey ?? null,
        fetchFruitless,
      });
    }

    // ── 5. Work Queue (Auffälligkeiten) ──
    const workQueue: WorkQueueItem[] = [];
    for (const [path, entry] of Object.entries(flags)) {
      if (entry.flag === "verified" || entry.flag === "archived") continue; // verified/archived = nicht in Work Queue
      const corpus = path.includes("/") ? path.split("/")[0] : "?";
      workQueue.push({
        path,
        corpus,
        flag: entry.flag as "defective" | "needs_review",
        note: entry.note ?? "",
        flaggedBy: entry.flaggedBy ?? "",
        flaggedAt: entry.flaggedAt ?? "",
      });
    }
    // defective zuerst, dann needs_review, dann nach Datum
    workQueue.sort((a, b) => {
      if (a.flag !== b.flag) return a.flag === "defective" ? -1 : 1;
      return (a.flaggedAt ?? "").localeCompare(b.flaggedAt ?? "");
    });

    // ── 6. Trust Status (pro Korpus) ──
    // Nur _normalized-Corpora: Steward-Flags leben im normalized-Baum;
    // raw-only Corpora (de-judikatur, eu-*) haben kein Steward-Review und
    // würden hier fälschlich komplett "unreviewed" erscheinen.
    const diskByCorpus: Record<string, number> = {};
    for (const c of normalizedCorpora) {
      diskByCorpus[c] = getCorpusIndex(c).length;
    }

    const trustByCorpus: Record<string, TrustRow> = {};
    for (const c of normalizedCorpora) {
      trustByCorpus[c] = {
        corpus: c,
        verified: 0,
        needsReview: 0,
        defective: 0,
        archived: 0,
        unreviewed: 0,
        total: 0,
      };
    }
    for (const [path, entry] of Object.entries(flags)) {
      const corpus = path.includes("/") ? path.split("/")[0] : "?";
      if (!trustByCorpus[corpus]) continue;
      const t = trustByCorpus[corpus];
      t.total++;
      if (entry.flag === "verified") t.verified++;
      else if (entry.flag === "needs_review") t.needsReview++;
      else if (entry.flag === "defective") t.defective++;
      else if (entry.flag === "archived") t.archived++;
    }
    // Unreviewed = Normalized-Index-Files minus alle mit Flag
    for (const c of normalizedCorpora) {
      const t = trustByCorpus[c];
      t.unreviewed = Math.max(0, (diskByCorpus[c] ?? 0) - t.total);
    }
    const trustRows = Object.values(trustByCorpus).filter(
      (t) => t.total > 0 || (diskByCorpus[t.corpus] ?? 0) > 0
    );

    // ── 7. Totals ──
    const totalDisk = syncRows.reduce((s, r) => s + r.diskFiles, 0);
    const totalDbPages = syncRows.reduce((s, r) => s + r.dbPages, 0);
    const totalDbChunks = syncRows.reduce((s, r) => s + r.dbChunks, 0);
    const totalDbDocuments = syncRows.reduce((s, r) => s + r.dbDocuments, 0);
    const totalEmbedded = syncRows.reduce((s, r) => s + r.embeddedChunks, 0);
    const totalNotImported = syncRows.reduce((s, r) => s + r.notImported, 0);
    const totalStale = syncRows.reduce((s, r) => s + r.staleChunks, 0);
    const totalRis = syncRows.reduce((s, r) => s + (r.risTotal || 0), 0);
    const totalMissingFromDb = syncRows.reduce((s, r) => s + r.missingFromDb, 0);
    const totalMissingFromDisk = syncRows.reduce((s, r) => s + r.missingFromDisk, 0);
    const totalNewOnRis = syncRows.reduce((s, r) => s + r.newOnRis, 0);
    const totalVerified = Object.values(flags).filter((f) => f.flag === "verified").length;
    const totalNeedsReview = Object.values(flags).filter((f) => f.flag === "needs_review").length;
    const totalDefective = Object.values(flags).filter((f) => f.flag === "defective").length;
    const totalArchived = Object.values(flags).filter((f) => f.flag === "archived").length;

    // ── 8. RIS Delta Status ──
    // Liest pipeline_state für ris-delta-* Keys und den übergeordneten ris-delta Key.
    const DELTA_LABELS: Record<string, string> = {
      "ris-delta-BrKons": "Bundesrecht (konsolidiert)",
      "ris-delta-LrKons": "Landesrecht (konsolidiert)",
      "ris-delta-Justiz": "OGH Judikatur",
      "ris-delta-Vwgh": "VwGH Judikatur",
      "ris-delta-Vfgh": "VfGH Judikatur",
      "ris-delta-Bvwg": "BVwG Judikatur",
      "ris-delta-Lvwg": "LVwG Judikatur",
      "ris-delta-AsylGH": "AsylGH Judikatur",
      "ris-delta-Uvs": "UVS Judikatur",
      "ris-delta-Dsk": "DSK Judikatur",
      "ris-delta-Gbk": "GBK Judikatur",
      "ris-delta-Pvak": "PVAK Judikatur",
      "ris-delta-Dok": "DOK Judikatur",
      "ris-delta-Ubas": "UBAS Judikatur",
      "ris-delta-Umse": "UMSE Judikatur",
    };

    const risDeltaRows: RisDeltaRow[] = [];
    if (pool) {
      try {
        const deltaResult = await pool.query(`
          SELECT source_key, stage, pid, last_cycle_at, updated_at, alert_flags
          FROM pipeline_state
          WHERE source_key LIKE 'ris-delta%'
          ORDER BY source_key
        `);
        for (const r of deltaResult.rows) {
          const applikation = r.source_key.replace("ris-delta-", "");
          risDeltaRows.push({
            applikation,
            label: DELTA_LABELS[r.source_key] || applikation,
            lastSync: r.last_cycle_at ? new Date(r.last_cycle_at).toISOString() : null,
            stage: r.stage || "idle",
            alerts: Array.isArray(r.alert_flags) ? r.alert_flags : [],
            running: r.pid != null && parseInt(r.pid, 10) > 0,
          });
        }
      } catch (err) {
        log.error("[corpus-command-center] ris-delta query failed:", err);
      }
    }

    // Delta-Sync Trigger-Status (ob ein manueller Trigger ansteht)
    let deltaTriggerPending = false;
    if (pool) {
      try {
        const trigResult = await pool.query(
          `SELECT key FROM pipeline_config WHERE key = 'delta_sync_triggered'`
        );
        deltaTriggerPending = trigResult.rows.length > 0;
      } catch {
        /* ignore */
      }
    }

    return apiSuccess({
      dbAvailable,
      // When the DB numbers were counted (10-minute snapshot); null = no
      // snapshot yet. Disk counts and pipeline state are still live.
      snapshotAt,
      sync: {
        rows: syncRows,
        totals: {
          totalDisk,
          totalDbPages,
          totalDbChunks,
          totalDbDocuments,
          totalEmbedded,
          totalNotImported,
          totalStale,
          totalRis,
          totalMissingFromDb,
          totalMissingFromDisk,
          totalNewOnRis,
          // Gleiche Einheit wie pro-Row coveragePct: embedded Chunks /
          // alle Chunks (vorher / totalDbPages — Chunks≠Pages, >1 Chunk
          // pro Page blähte den Wert über 100% auf).
          coveragePct:
            totalDbChunks > 0 ? Math.round((totalEmbedded / totalDbChunks) * 1000) / 10 : 0,
        },
      },
      workQueue: {
        items: workQueue.slice(0, 200), // erste 200 — Rest via Pagination
        total: workQueue.length,
        defective: totalDefective,
        needsReview: totalNeedsReview,
        verified: totalVerified,
      },
      pipeline: {
        paused: pipelinePaused,
        states: pipelineState,
        live: deriveLiveRows(pipelineState, dbStats, Date.now()),
        risFetchers,
      },
      trust: {
        rows: trustRows,
        totals: {
          verified: totalVerified,
          needsReview: totalNeedsReview,
          defective: totalDefective,
          archived: totalArchived,
          unreviewed: totalDisk - totalVerified - totalNeedsReview - totalDefective - totalArchived,
        },
      },
      risDelta: {
        rows: risDeltaRows,
        triggerPending: deltaTriggerPending,
      },
    });
  }
);
