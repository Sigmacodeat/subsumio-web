import { createHandler, apiSuccess, apiError } from "@/lib/api-handler";
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
  /** Fehlende Dokumente: RIS OGD Total minus DB-Seiten. */
  missingFromDb: number;
  /** Noch nicht auf Disk: RIS OGD Total minus lokale Dateien. */
  missingFromDisk: number;
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
    const dbStats: Record<string, { pages: number; chunks: number; embedded: number }> = {};
    let pipelineState: PipelineStateRow[] = [];
    let pipelinePaused = false;
    let dbAvailable = false;

    if (pool) {
      dbAvailable = true;
      try {
        // Per-source DB-Stats — mappt source_id auf corpus-Namen.
        const dbResult = await pool.query(`
          SELECT
            COALESCE(p.source_id, 'unknown') AS source_id,
            COUNT(DISTINCT p.id) FILTER (WHERE p.deleted_at IS NULL) AS pages,
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
      } catch (err) { console.error("[corpus-command-center] pipeline_state query failed:", err); }

      // Pipeline paused?
      try {
        const pauseResult = await pool.query(`
          SELECT value FROM pipeline_config WHERE key = 'paused'
        `);
        if (pauseResult.rows.length > 0) {
          pipelinePaused = pauseResult.rows[0].value?.paused === true;
        }
      } catch (err) { console.error("[corpus-command-center] pipeline_config query failed:", err); }
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
    let flags: Record<string, { flag: string; note: string; flaggedBy: string; flaggedAt: string }> = {};
    if (existsSync(FLAGS_FILE)) {
      try {
        flags = JSON.parse(readFileSync(FLAGS_FILE, "utf-8"));
      } catch { /* corrupt JSON → leer */ }
    }

    // ── 4. Sync-Status zusammenbauen ──
    // Explizites Mapping: DB source_id → pipeline_state.source_key
    // (pipeline_state verwendet Kurznamen wie "jud-vwgh", DB verwendet "law-at-judikatur-vwgh")
    const SOURCE_TO_PIPELINE_KEY: Record<string, string> = {
      "law-at": "statutes-at",
      "law-at-landesrecht": "landesrecht",
      "law-at-judikatur": "jud-ogh",
      "law-at-judikatur-vwgh": "jud-vwgh",
      "law-at-judikatur-vfgh": "jud-vfgh",
      "law-at-judikatur-lvwg": "jud-lvwg",
      "law-at-judikatur-bvwg": "jud-bvwg",
      "law-at-judikatur-asylgh": "jud-asylgh",
      "law-at-judikatur-uvs": "jud-uvs",
      "law-at-judikatur-dsk": "jud-dsk",
      "law-at-judikatur-dok": "jud-dok",
      "law-at-judikatur-gbk": "jud-gbk",
      "law-at-judikatur-pvak": "jud-pvak",
      "law-at-judikatur-ubas": "jud-ubas",
      "law-at-judikatur-umse": "jud-umse",
      "law-at-staatsvertraege": "staatsvertraege",
      "law-at-literatur": "literatur-at",
      "law-de": "statutes-de",
      "law-ch": "statutes-ch",
      "law-de-literatur": "literatur-de",
      "law-ch-literatur": "literatur-ch",
      "law-de-materialien": "materialien-de",
      "law-eu": "eu-regulations",
      "law-eu-directives": "eu-directives",
    };

    // Pipeline-State Lookup-Map: source_key → { diskCount, dbPages, risTotal }
    const pipelineBySource: Record<string, { diskCount: number; dbPages: number; risTotal: number | null }> = {};
    for (const p of pipelineState) {
      pipelineBySource[p.source] = { diskCount: p.diskCount, dbPages: p.dbPages, risTotal: p.risTotal };
    }

    const syncRows: CorpusSyncRow[] = [];

    for (const corpus of corpora) {
      const stats = dbStats[corpus];
      const dbPages = stats?.pages ?? 0;
      const dbChunks = stats?.chunks ?? 0;
      const embedded = stats?.embedded ?? 0;

      // Disk-Zahl: aus pipeline_state via explizitem Mapping, oder aus lokalem Disk-Index
      const pipelineKey = SOURCE_TO_PIPELINE_KEY[corpus];
      const pipelineInfo = pipelineKey ? pipelineBySource[pipelineKey] : undefined;
      const disk = pipelineInfo ? pipelineInfo.diskCount : (diskCounts[corpus] ?? 0);
      // RIS Total: aus pipeline_state, wenn verfügbar
      const risTotal = pipelineInfo && pipelineInfo.risTotal ? pipelineInfo.risTotal : null;

      // Status-Logik: RIS OGD ist Source-of-Truth
      const expectedDbPages = pipelineInfo ? pipelineInfo.dbPages : null;

      const stale = dbChunks - embedded;
      const coverage = dbChunks > 0 ? Math.round((embedded / dbChunks) * 1000) / 10 : 0;

      // Differenzen zum Source-of-Truth RIS OGD
      const missingFromDb = risTotal !== null ? Math.max(0, risTotal - dbPages) : 0;
      const missingFromDisk = risTotal !== null ? Math.max(0, risTotal - disk) : 0;
      const newOnRis = risTotal !== null ? Math.max(0, risTotal - disk) : 0;
      const orphanDb = risTotal !== null ? Math.max(0, dbPages - risTotal) : Math.max(0, dbPages - disk);

      // Status: Wahrheitsgemäß nach RIS, nicht nach interner Pipeline-Erwartung
      let syncStatus: CorpusSyncRow["syncStatus"] = "synced";
      if (dbPages === 0 && disk > 0) {
        syncStatus = "no_db";
      } else if (missingFromDb > 0) {
        syncStatus = "import_pending";
      } else if (missingFromDisk > 0) {
        syncStatus = "import_pending";
      } else if (orphanDb > 0) {
        syncStatus = "orphan_in_db";
      } else if (disk > 0 && dbPages === 0) {
        syncStatus = "no_db";
      }

      // notImported = fehlende DB-Pages; bisherige fallback bleibt für Nicht-RIS
      const notImported = expectedDbPages !== null ? Math.max(0, expectedDbPages - dbPages) : Math.max(0, disk - dbPages);
      const canUpdate = risTotal !== null && pipelineKey != null && (missingFromDb > 0 || missingFromDisk > 0);


      syncRows.push({
        corpus,
        sourceId: corpus,
        diskFiles: disk,
        dbPages,
        dbChunks,
        embeddedChunks: embedded,
        staleChunks: stale,
        coveragePct: coverage,
        notImported,
        orphanDb,
        syncStatus,
        fullyComplete: syncStatus === "synced" && missingFromDb === 0 && missingFromDisk === 0 && coverage === 100 && stale === 0 && dbPages > 0,
        risTotal,
        missingFromDb,
        missingFromDisk,
        newOnRis,
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
      trustByCorpus[c] = { corpus: c, verified: 0, needsReview: 0, defective: 0, archived: 0, unreviewed: 0, total: 0 };
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
    const trustRows = Object.values(trustByCorpus).filter((t) => t.total > 0 || (diskByCorpus[t.corpus] ?? 0) > 0);

    // ── 7. Totals ──
    const totalDisk = syncRows.reduce((s, r) => s + r.diskFiles, 0);
    const totalDbPages = syncRows.reduce((s, r) => s + r.dbPages, 0);
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
      } catch (err) { console.error("[corpus-command-center] ris-delta query failed:", err); }
    }

    // Delta-Sync Trigger-Status (ob ein manueller Trigger ansteht)
    let deltaTriggerPending = false;
    if (pool) {
      try {
        const trigResult = await pool.query(`SELECT key FROM pipeline_config WHERE key = 'delta_sync_triggered'`);
        deltaTriggerPending = trigResult.rows.length > 0;
      } catch { /* ignore */ }
    }

    return apiSuccess({
      dbAvailable,
      sync: {
        rows: syncRows,
        totals: {
          totalDisk,
          totalDbPages,
          totalEmbedded,
          totalNotImported,
          totalStale,
          totalRis,
          totalMissingFromDb,
          totalMissingFromDisk,
          totalNewOnRis,
          coveragePct: totalDbPages > 0 ? Math.round((totalEmbedded / (totalDbPages > 0 ? totalDbPages : 1)) * 1000) / 10 : 0,
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
  },
);
