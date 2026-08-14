import { createHandler, apiSuccess } from "@/lib/api-handler";
import { getSharedPgPool } from "@/lib/auth/store";
import { listCorpusNames, getCorpusIndex } from "@/lib/corpus-index";
import { readFileSync, existsSync } from "fs";
import { join, resolve } from "path";

export const dynamic = "force-dynamic";
export const maxDuration = 15;

const REPO_ROOT = resolve(process.cwd());
const NORMALIZED_ROOT = join(REPO_ROOT, "law-corpus", "_normalized");
const FLAGS_FILE = join(NORMALIZED_ROOT, "_steward-flags.json");

interface CorpusSyncRow {
  corpus: string;
  sourceId: string;
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
  syncStatus: "synced" | "import_pending" | "orphan_in_db" | "no_db";
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
    action: "admin.*",
    cacheMaxAge: 30,
  },
  async () => {
    // ── 2. DB-Stats (Hetzner) ──
    const pool = getSharedPgPool();
    const dbStats: Record<
      string,
      { pages: number; documents: number; chunks: number; embedded: number }
    > = {};
    let pipelineState: PipelineStateRow[] = [];
    let pipelinePaused = false;
    let dbAvailable = false;

    if (pool) {
      dbAvailable = true;
      try {
        // Per-source DB-Stats — mappt source_id auf corpus-Namen.
        // BUG 47: dbPages ist die Anzahl Pages (1 Datei → viele §-Pages bei Gesetzen).
        // RIS Total ist aber in Dokumenten. Daher zusätzlich dbDocuments
        // (COUNT DISTINCT import_filename) abfragen — das ist die korrekte
        // Vergleichsgröße mit RIS Total. Bei Judikatur 1:1 mit dbPages.
        const dbResult = await pool.query(`
          SELECT
            COALESCE(p.source_id, 'unknown') AS source_id,
            COUNT(DISTINCT p.id) FILTER (WHERE p.deleted_at IS NULL) AS pages,
            COUNT(DISTINCT p.import_filename) FILTER (WHERE p.deleted_at IS NULL AND p.import_filename IS NOT NULL) AS documents,
            COUNT(cc.id) FILTER (WHERE p.deleted_at IS NULL) AS chunks,
            COUNT(cc.id) FILTER (WHERE p.deleted_at IS NULL AND cc.embedding IS NOT NULL) AS embedded
          FROM pages p
          LEFT JOIN content_chunks cc ON cc.page_id = p.id
          GROUP BY p.source_id
          ORDER BY p.source_id
        `);
        for (const r of dbResult.rows) {
          dbStats[r.source_id] = {
            pages: parseInt(r.pages ?? "0", 10),
            documents: parseInt(r.documents ?? "0", 10),
            chunks: parseInt(r.chunks ?? "0", 10),
            embedded: parseInt(r.embedded ?? "0", 10),
          };
        }
      } catch (err) {
        console.error("[corpus-command-center] DB stats query failed:", err);
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
          diskCount: r.disk_count || 0,
          dbPages: r.db_pages || 0,
          risTotal: r.ris_total || null,
          alertFlags: Array.isArray(r.alert_flags) ? r.alert_flags : [],
        }));
      } catch (err) {
        console.error("[corpus-command-center] pipeline_state query failed:", err);
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
        console.error("[corpus-command-center] pipeline_config query failed:", err);
      }
    }

    // ── 1b. Disk-Index (lokal) ──
    // Wenn der Web-Container keinen Zugriff auf law-corpus/_normalized hat,
    // fällt die Route auf DB-Quellen + pipeline_state zurück.
    let corpora = listCorpusNames();
    const diskCounts: Record<string, number> = {};
    for (const c of corpora) {
      diskCounts[c] = getCorpusIndex(c).length;
    }

    if (corpora.length === 0) {
      // Fallback (Web-Container ohne law-corpus Volume):
      // DB source_ids als Corpus-Liste verwenden.
      corpora = Object.keys(dbStats).filter((s) => s !== "unknown" && s !== "default");
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
      "at-normen": "law-at",
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
      "de-literatur": "law-de-literatur",
      "de-materialien": "law-de-materialien",
      ch: "law-ch",
      "ch-literatur": "law-ch-literatur",
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
      // RIS Total: aus pipeline_state, wenn verfügbar
      const risTotal = pipelineInfo && pipelineInfo.risTotal ? pipelineInfo.risTotal : null;

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

      // notImported: Dateien auf Disk die noch nicht in der DB sind.
      // BUG 47: Für RIS-Sources ist missingFromDb die echte Lücke (risTotal - dbDocuments).
      const notImported = risTotal !== null ? missingFromDb : dbPages === 0 && disk > 0 ? disk : 0;
      const canUpdate = risTotal !== null && pipelineKey != null && missingFromDb > 0;

      syncRows.push({
        corpus,
        sourceId,
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
          orphanDb === 0,
        risTotal,
        missingFromDb,
        missingFromDisk,
        newOnRis,
        diskPending,
        canUpdate,
        pipelineKey: pipelineKey ?? null,
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
    const diskByCorpus: Record<string, number> = {};
    for (const r of syncRows) diskByCorpus[r.corpus] = r.diskFiles;

    const trustByCorpus: Record<string, TrustRow> = {};
    for (const c of corpora) {
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
    // Unreviewed = Disk-Files minus alle mit Flag
    for (const c of corpora) {
      const t = trustByCorpus[c];
      t.unreviewed = Math.max(0, (diskByCorpus[c] ?? 0) - t.total);
    }
    const trustRows = Object.values(trustByCorpus).filter(
      (t) => t.total > 0 || (diskByCorpus[t.corpus] ?? 0) > 0
    );

    // ── 7. Totals ──
    const totalDisk = syncRows.reduce((s, r) => s + r.diskFiles, 0);
    const totalDbPages = syncRows.reduce((s, r) => s + r.dbPages, 0);
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
        console.error("[corpus-command-center] ris-delta query failed:", err);
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
      sync: {
        rows: syncRows,
        totals: {
          totalDisk,
          totalDbPages,
          totalDbDocuments,
          totalEmbedded,
          totalNotImported,
          totalStale,
          totalRis,
          totalMissingFromDb,
          totalMissingFromDisk,
          totalNewOnRis,
          coveragePct:
            totalDbPages > 0
              ? Math.round((totalEmbedded / (totalDbPages > 0 ? totalDbPages : 1)) * 1000) / 10
              : 0,
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
