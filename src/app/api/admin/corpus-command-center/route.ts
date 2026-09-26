import { createHandler, apiSuccess } from "@/lib/api-handler";
import { getSharedPgPool } from "@/lib/auth/store";
import { listCorpusNames, getCorpusIndex } from "@/lib/corpus-index";
import {
  readSyncInventory,
  syncTotals,
  toSyncRow,
  type CorpusSyncRow,
} from "@/lib/corpus-sync-inventory";
import { SOURCE_LABELS } from "@/lib/corpus-labels";
import { readSyncHistory } from "@/lib/corpus-sync-history";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { lawCorpusNormalizedDir } from "@/lib/corpus-paths";
import { deriveLiveRows } from "@/lib/corpus-pipeline-live";
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
const FLAGS_FILE = join(NORMALIZED_ROOT, "_steward-flags.json");

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

    // Steward-Korpora (_normalized) — für Work Queue und Trust.
    const normalizedCorpora = listCorpusNames();

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

    // ── 4. Sync-Status: RIS-Soll → Platte → DB nach Dokumentnummer ──
    // Die Zählung kommt aus der stündlichen Messung im corpus-pipeline-
    // Container (_state/corpus-sync-inventory.json) — gleiche Einheit auf
    // allen drei Ebenen, Mengendifferenzen statt Subtraktion von Summen.
    // Aus dem 10-Minuten-Snapshot kommen nur Chunks/Embeddings dazu.
    const inventory = readSyncInventory();
    const syncRows: CorpusSyncRow[] = (inventory?.sources ?? [])
      .map((src) =>
        toSyncRow(src, SOURCE_LABELS[src.sourceId] ?? src.corpus, dbStats[src.sourceId])
      )
      .sort((a, b) => a.corpus.localeCompare(b.corpus));

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
    const syncTotalsValue = syncTotals(syncRows);
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
        totals: syncTotalsValue,
        // Zeitpunkt der Dokumentnummern-Messung; null = noch nie gemessen.
        measuredAt: inventory?.measuredAt ?? null,
        // Tagesstände der letzten 30 Tage je Quelle (Fortschritt, Restdauer).
        progress: readSyncHistory(),
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
          unreviewed: Math.max(
            0,
            Object.values(diskByCorpus).reduce((a, n) => a + n, 0) -
              totalVerified -
              totalNeedsReview -
              totalDefective -
              totalArchived
          ),
        },
      },
      risDelta: {
        rows: risDeltaRows,
        triggerPending: deltaTriggerPending,
      },
    });
  }
);
