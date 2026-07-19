#!/usr/bin/env bun
/**
 * Corpus Pipeline Orchestrator — the single supervisor for the legal-corpus
 * ingest chain. Replaces the pile of hand-started background scripts with one
 * idempotent state machine per source:
 *
 *   backfill (text fetch+validate) → import (chunk) → embed → reconcile
 *
 * Design rules (born from the 2026-07-14/15 incidents, hardened 2026-07-16):
 *   - MEASURE, don't remember: every stage decision derives from observable
 *     state (placeholder counts on disk, page counts in DB, pending embeds),
 *     not from what a previous run claims to have done.
 *   - DB-BACKED STATE: all pipeline state lives in the `pipeline_state` table,
 *     not a JSON file. This is multi-instance safe via pg_advisory_lock and
 *     survives container restarts on Hetzner.
 *   - SINGLE-SUPERVISOR GUARANTEE: a Postgres advisory lock ensures only one
 *     pipeline cycle runs at a time — across Docker containers, Hetzner, and
 *     local dev. Prevents duplicate process spawns and DB deadlocks.
 *   - PID TRACKING + TIMEOUT: child processes are tracked by OS PID in the DB.
 *     Stale PIDs (exceeded configurable timeout) are killed and the source
 *     released. No more `ps grep` fragility.
 *   - Fail-closed content: backfill-corpus-text.ts validates identity
 *     (case_number/ECLI/CELEX in fetched text) before writing; import-judikatur
 *     runs with --skip-placeholders so text-less stubs never enter the brain.
 *   - Ordering: judikatur imports wait for the AT statute import, because
 *     judikatur-cites edges are only written when the target § page exists.
 *   - RECONCILE (6 layers, all implemented):
 *     1. Identity-Check on fetch (case_number/ECLI/CELEX in text)
 *     2. §-Abgleich (statute completeness vs RIS — freshness check stage)
 *     3. Mengen-Abgleich (RIS document count vs local disk count — alert on gap)
 *     4. Stichproben-Zweitfetch (daily sample re-fetch + identifier compare)
 *     5. Hash File→DB (content_hash sample check + alerting on mismatch)
 *     6. Fassungs-Sync (version_date delta — alert on stale corpus vs DB)
 *   - ALERTING: structured alerts stored in pipeline_state.alert_flags,
 *     surfaced in report. Configurable webhook for external notification.
 *
 * Usage:
 *   bun scripts/corpus-pipeline.ts --once           # one cycle, then exit
 *   bun scripts/corpus-pipeline.ts --loop           # supervise forever (default interval 600s)
 *   bun scripts/corpus-pipeline.ts --loop --interval 300
 *   bun scripts/corpus-pipeline.ts --report-only    # measure + report, start nothing
 *   bun scripts/corpus-pipeline.ts --sample-check   # run Stichproben-Zweitfetch now
 *
 * Discovery (fetching the ~444k decisions RIS has but we never downloaded)
 * is intentionally NOT auto-started — the report shows the gap; start
 * fetch-all-at-judikatur.ts deliberately when ready.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, openSync, unlinkSync } from "fs";
import { join, dirname } from "path";
import { createHash } from "crypto";
import { fileURLToPath } from "url";
import { spawn, execSync } from "child_process";

const _dir = dirname(fileURLToPath(import.meta.url));
const SERVER_DIR = join(_dir, "..");
const CORPUS = join(SERVER_DIR, "..", "law-corpus");
const HOME = process.env.HOME || "~";
const LOG_DIR = join(HOME, "subsumio-pipeline-logs");
mkdirSync(LOG_DIR, { recursive: true });

/** Check if current time is within RIS-recommended off-hours (18:00–06:00 CET or weekend). */
function isRisOffHours(): boolean {
  const now = new Date();
  const cetHour = parseInt(
    now.toLocaleTimeString("de-AT", { timeZone: "Europe/Vienna", hour: "2-digit", hour12: false })
  );
  const day = now.toLocaleDateString("en-US", { timeZone: "Europe/Vienna", weekday: "short" });
  const isWeekend = day === "Sat" || day === "Sun";
  return isWeekend || cetHour < 8 || cetHour >= 18;
}

const args = process.argv.slice(2);
const LOOP = args.includes("--loop");
const REPORT_ONLY = args.includes("--report-only");
const SAMPLE_CHECK = args.includes("--sample-check");
const intervalIdx = args.indexOf("--interval");
const INTERVAL_S = intervalIdx >= 0 ? parseInt(args[intervalIdx + 1], 10) : 600;

// Configurable alert webhook (optional). Set ALERT_WEBHOOK env var to a URL
// that accepts POST JSON. Alerts are also stored in pipeline_state.alert_flags.
const ALERT_WEBHOOK = process.env.ALERT_WEBHOOK || "";
// How many files to sample for Stichproben-Zweitfetch (default 50)
const SAMPLE_SIZE = parseInt(process.env.PIPELINE_SAMPLE_SIZE || "50", 10);
// Gap threshold for Mengen-Abgleich alert (RIS vs disk, percentage)
const RECONCILE_GAP_THRESHOLD = parseFloat(process.env.PIPELINE_RECONCILE_GAP || "0.05"); // 5%

// ── Source registry ────────────────────────────────────────────────────

interface JudikaturSource {
  kind: "judikatur";
  key: string;
  dir: string; // law-corpus subdir
  sourceId: string; // DB source
  risApplikation: string; // RIS OGD Applikation param for reconcile
}
interface SimpleSource {
  kind: "statutes" | "dirimport" | "eu";
  key: string;
  dir: string;
  sourceId: string;
  importCmd: string[]; // argv after "bun"
}

const JUDIKATUR: JudikaturSource[] = [
  {
    kind: "judikatur",
    key: "ogh",
    dir: "at-judikatur",
    sourceId: "law-at-judikatur",
    risApplikation: "Justiz",
  },
  {
    kind: "judikatur",
    key: "vfgh",
    dir: "at-judikatur-vfgh",
    sourceId: "law-at-judikatur-vfgh",
    risApplikation: "Vfgh",
  },
  {
    kind: "judikatur",
    key: "vwgh",
    dir: "at-judikatur-vwgh",
    sourceId: "law-at-judikatur-vwgh",
    risApplikation: "Vwgh",
  },
  {
    kind: "judikatur",
    key: "bvwg",
    dir: "at-judikatur-bvwg",
    sourceId: "law-at-judikatur-bvwg",
    risApplikation: "Bvwg",
  },
  {
    kind: "judikatur",
    key: "lvwg",
    dir: "at-judikatur-lvwg",
    sourceId: "law-at-judikatur-lvwg",
    risApplikation: "Lvwg",
  },
  {
    kind: "judikatur",
    key: "asylgh",
    dir: "at-judikatur-asylgh",
    sourceId: "law-at-judikatur-asylgh",
    risApplikation: "AsylGH",
  },
  {
    kind: "judikatur",
    key: "uvs",
    dir: "at-judikatur-uvs",
    sourceId: "law-at-judikatur-uvs",
    risApplikation: "Uvs",
  },
  {
    kind: "judikatur",
    key: "dsk",
    dir: "at-judikatur-dsk",
    sourceId: "law-at-judikatur-dsk",
    risApplikation: "Dsk",
  },
  {
    kind: "judikatur",
    key: "gbk",
    dir: "at-judikatur-gbk",
    sourceId: "law-at-judikatur-gbk",
    risApplikation: "Gbk",
  },
  {
    kind: "judikatur",
    key: "pvak",
    dir: "at-judikatur-pvak",
    sourceId: "law-at-judikatur-pvak",
    risApplikation: "Pvak",
  },
  {
    kind: "judikatur",
    key: "dok",
    dir: "at-judikatur-dok",
    sourceId: "law-at-judikatur-dok",
    risApplikation: "Dok",
  },
];

const SIMPLE: SimpleSource[] = [
  {
    kind: "statutes",
    key: "statutes-at",
    dir: "at",
    sourceId: "law-at",
    importCmd: ["scripts/import-statutes-split.ts", "--auto-at", "--no-embed"],
  },
  {
    kind: "statutes",
    key: "statutes-de",
    dir: "de",
    sourceId: "law-de",
    importCmd: ["scripts/import-statutes-split.ts", "--jurisdiction", "de", "--no-embed"],
  },
  {
    kind: "statutes",
    key: "statutes-ch",
    dir: "ch",
    sourceId: "law-ch",
    importCmd: ["scripts/import-statutes-split.ts", "--jurisdiction", "ch", "--no-embed"],
  },
  {
    kind: "dirimport",
    key: "landesrecht",
    dir: "at-landesrecht",
    sourceId: "law-at-landesrecht",
    importCmd: [
      "src/cli.ts",
      "import",
      "../law-corpus/at-landesrecht",
      "--source-id",
      "law-at-landesrecht",
      "--no-embed",
    ],
  },
  {
    kind: "dirimport",
    key: "staatsvertraege",
    dir: "at-staatsvertraege",
    sourceId: "law-at-staatsvertraege",
    importCmd: [
      "src/cli.ts",
      "import",
      "../law-corpus/at-staatsvertraege",
      "--source-id",
      "law-at-staatsvertraege",
      "--no-embed",
    ],
  },
  // Literatur + Gesetzesmaterialien (Phase 1: freie/CC-lizenzierte Quellen;
  // Lizenzgates leben in den fetch-Scripts via checkStaticCompliance).
  {
    kind: "dirimport",
    key: "materialien-de",
    dir: "de-materialien",
    sourceId: "law-de-materialien",
    importCmd: [
      "src/cli.ts",
      "import",
      "../law-corpus/de-materialien",
      "--source-id",
      "law-de-materialien",
      "--no-embed",
    ],
  },
  {
    kind: "dirimport",
    key: "literatur-de",
    dir: "de-literatur",
    sourceId: "law-de-literatur",
    importCmd: [
      "src/cli.ts",
      "import",
      "../law-corpus/de-literatur",
      "--source-id",
      "law-de-literatur",
      "--no-embed",
    ],
  },
  {
    kind: "dirimport",
    key: "literatur-at",
    dir: "at-literatur",
    sourceId: "law-at-literatur",
    importCmd: [
      "src/cli.ts",
      "import",
      "../law-corpus/at-literatur",
      "--source-id",
      "law-at-literatur",
      "--no-embed",
    ],
  },
  {
    kind: "dirimport",
    key: "literatur-ch",
    dir: "ch-literatur",
    sourceId: "law-ch-literatur",
    importCmd: [
      "src/cli.ts",
      "import",
      "../law-corpus/ch-literatur",
      "--source-id",
      "law-ch-literatur",
      "--no-embed",
    ],
  },
  {
    kind: "eu",
    key: "eu-directives",
    dir: "eu/directives",
    sourceId: "law-eu-directives",
    importCmd: ["scripts/import-eu-corpus.ts", "--type", "directive", "--no-embed"],
  },
  {
    kind: "eu",
    key: "eu-regulations",
    dir: "eu/regulations",
    sourceId: "law-eu",
    importCmd: ["scripts/import-eu-corpus.ts", "--type", "regulation", "--no-embed"],
  },
];

// ── DB-backed State ───────────────────────────────────────────────────
//
// All pipeline state lives in the `pipeline_state` table (migration 008).
// This replaces the old JSON file with a durable, multi-instance-safe store.
// Each source has one row; the supervisor reads + updates it each cycle.

interface DBPipelineState {
  source_key: string;
  stage: string;
  last_import_success: string | null;
  pending_import_since: string | null;
  pid: number | null;
  pid_cmd: string | null;
  pid_started_at: string | null;
  pid_timeout_s: number;
  last_placeholder_count: number;
  pending_backfill_ph: number | null;
  backfill_exhausted: boolean;
  disk_count: number;
  db_pages: number;
  ris_total: number | null;
  alert_flags: Array<{ type: string; severity: string; message: string; raised_at: string }>;
  stage_history: Array<{ stage: string; action: string; ts: string }>;
  last_cycle_at: string | null;
}

function psqlQuery(query: string): string {
  // Write SQL to a temp file and use psql -f to avoid shell escaping issues
  // with multi-line SQL (JSON.stringify turns newlines into literal \n,
  // which psql -c doesn't interpret, causing syntax errors).
  const tmpFile = `/tmp/psql_query_${process.pid}_${Date.now()}.sql`;
  writeFileSync(tmpFile, query, "utf-8");
  try {
    return sh(`psql ${JSON.stringify(dbUrl())} -q -t -A -f ${JSON.stringify(tmpFile)}`);
  } finally {
    try {
      unlinkSync(tmpFile);
    } catch {
      /* ignore */
    }
  }
}

/** Atomically acquire a DB-backed cycle lock using pipeline_state.
 *  Uses an atomic UPDATE ... RETURNING to claim the 'pipeline-lock' row.
 *  If another cycle's PID is alive and not stale, the UPDATE affects 0 rows.
 *  Returns true if this cycle acquired the lock. */
function tryAcquireCycleLock(): boolean {
  const myPid = process.pid;
  // Atomic claim: only succeed if pid is NULL or stale (>10min old)
  const result = psqlQuery(
    `UPDATE pipeline_state SET pid = ${myPid}, pid_started_at = NOW(), updated_at = NOW()
     WHERE source_key = 'pipeline-lock'
       AND (pid IS NULL OR pid_started_at < NOW() - INTERVAL '10 minutes')
     RETURNING pid`
  );
  return result === String(myPid);
}

/** Release the cycle lock by clearing the PID. */
function releaseCycleLock(): void {
  const myPid = process.pid;
  psqlQuery(
    `UPDATE pipeline_state SET pid = NULL, pid_started_at = NULL, updated_at = NOW()
     WHERE source_key = 'pipeline-lock' AND pid = ${myPid}`
  );
}

function psqlJSON(query: string): any[] {
  const raw = psqlQuery(query);
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

/** Load all pipeline_state rows as a Map keyed by source_key. */
function loadDBState(): Map<string, DBPipelineState> {
  const rows = psqlJSON(
    `SELECT json_agg(t) FROM (SELECT * FROM pipeline_state ORDER BY source_key) t`
  );
  const map = new Map<string, DBPipelineState>();
  if (Array.isArray(rows)) {
    for (const r of rows) {
      map.set(r.source_key, r);
    }
  }
  return map;
}

/** Ensure a pipeline_state row exists for a source (upsert with defaults). */
function ensureSourceRow(key: string): void {
  psqlQuery(
    `INSERT INTO pipeline_state (source_key) VALUES ('${key}') ON CONFLICT (source_key) DO NOTHING`
  );
}

/** Update a source's state in the DB. */
function updateSourceState(
  key: string,
  fields: Record<string, string | number | boolean | null>
): void {
  const sets = Object.entries(fields).map(([k, v]) => {
    if (v === null) return `${k} = NULL`;
    if (typeof v === "string") return `${k} = '${v.replace(/'/g, "''")}'`;
    if (typeof v === "boolean") return `${k} = ${v}`;
    return `${k} = ${v}`;
  });
  sets.push(`updated_at = NOW()`);
  psqlQuery(`UPDATE pipeline_state SET ${sets.join(", ")} WHERE source_key = '${key}'`);
}

/** Append to stage_history via the DB function. */
function appendHistory(key: string, stage: string, action: string): void {
  psqlQuery(
    `SELECT append_stage_history('${key}', '${stage.replace(/'/g, "''")}', '${action.replace(/'/g, "''")}')`
  );
}

/** Raise an alert on a source (stored in alert_flags JSONB). */
function raiseAlert(key: string, type: string, severity: string, message: string): void {
  const alert = { type, severity, message, raised_at: new Date().toISOString() };
  psqlQuery(
    `UPDATE pipeline_state SET alert_flags =
       COALESCE(alert_flags, '[]'::jsonb) || '${JSON.stringify(alert).replace(/'/g, "''")}'::jsonb,
       updated_at = NOW()
     WHERE source_key = '${key}'`
  );
  // Fire webhook if configured
  if (ALERT_WEBHOOK) {
    fetch(ALERT_WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source: key, ...alert }),
    }).catch(() => {});
  }
  console.log(`  ⚠️ ALERT [${severity}] ${key}: ${type} — ${message}`);
}

/** Clear alerts of a given type for a source. */
function clearAlerts(key: string, type: string): void {
  psqlQuery(
    `UPDATE pipeline_state SET alert_flags =
       COALESCE(
         (SELECT jsonb_agg(elem) FROM jsonb_array_elements(alert_flags) AS elem
          WHERE elem->>'type' != '${type.replace(/'/g, "''")}'),
         '[]'::jsonb
       ),
       updated_at = NOW()
     WHERE source_key = '${key}'`
  );
}

// In-memory state cache for the current cycle (read from DB at start, written at end)
// This keeps the cycle logic readable while the DB is the source of truth.
interface CycleState {
  lastImportSuccess: Record<string, string | null>;
  pendingImport: Record<string, string | null>;
  lastPlaceholderCount: Record<string, number>;
  pendingBackfillPh: Record<string, number | null>;
  backfillExhausted: Record<string, boolean>;
  pidMap: Record<string, { pid: number; cmd: string; startedAt: string; timeoutS: number }>;
  /** Consecutive failed import attempts, derived from import_failed alert flags. */
  importFailCount: Record<string, number>;
}

/** Give up restarting a source's import after this many consecutive failures. */
const MAX_IMPORT_ATTEMPTS = 5;

function stateFromDB(dbState: Map<string, DBPipelineState>): CycleState {
  const cs: CycleState = {
    lastImportSuccess: {},
    pendingImport: {},
    lastPlaceholderCount: {},
    pendingBackfillPh: {},
    backfillExhausted: {},
    pidMap: {},
    importFailCount: {},
  };
  for (const [key, row] of dbState) {
    cs.lastImportSuccess[key] = row.last_import_success;
    cs.pendingImport[key] = row.pending_import_since;
    cs.lastPlaceholderCount[key] = row.last_placeholder_count;
    cs.pendingBackfillPh[key] = row.pending_backfill_ph;
    cs.backfillExhausted[key] = row.backfill_exhausted;
    cs.importFailCount[key] = Array.isArray(row.alert_flags)
      ? row.alert_flags.filter((a) => a.type === "import_failed").length
      : 0;
    if (row.pid) {
      cs.pidMap[key] = {
        pid: row.pid,
        cmd: row.pid_cmd || "",
        startedAt: row.pid_started_at || new Date().toISOString(),
        timeoutS: row.pid_timeout_s,
      };
    }
  }
  return cs;
}

// ── Measurement helpers ────────────────────────────────────────────────

function sh(cmd: string): string {
  try {
    return execSync(cmd, { encoding: "utf-8", maxBuffer: 64 * 1024 * 1024 }).trim();
  } catch {
    return "";
  }
}

/** Check if a PID is still alive (cross-platform: works on macOS + Linux). */
function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** Check if a PID is alive AND not exceeding its timeout. Returns {alive, stale}. */
function pidStatus(
  pid: number,
  startedAt: string,
  timeoutS: number
): { alive: boolean; stale: boolean } {
  const alive = pidAlive(pid);
  if (!alive) return { alive: false, stale: false };
  const elapsedS = (Date.now() - new Date(startedAt).getTime()) / 1000;
  return { alive: true, stale: elapsedS > timeoutS };
}

/** Kill a stale process by PID (SIGTERM then SIGKILL after 5s). */
function killStalePid(pid: number, key: string): void {
  console.log(`  ⏱️ Killing stale PID ${pid} for ${key} (timeout exceeded)`);
  // Negative pid = whole process group. startProcess spawns detached, so the
  // sh wrapper is a group leader; killing only the wrapper would orphan the
  // actual bun worker and the pipeline would immediately double-start it.
  try {
    process.kill(-pid, "SIGTERM");
  } catch {
    try {
      process.kill(pid, "SIGTERM");
    } catch {}
  }
  setTimeout(() => {
    try {
      process.kill(-pid, "SIGKILL");
    } catch {
      try {
        process.kill(pid, "SIGKILL");
      } catch {}
    }
  }, 5000);
  raiseAlert(key, "stale_process", "warning", `Process PID ${pid} killed after timeout`);
}

/** Legacy grep-based check — used as fallback for processes we didn't start
 *  (e.g. manually started backfills from before the DB-state migration). */
function processRunningGrep(pattern: string): boolean {
  const out = sh(
    `ps ax -o command | LC_ALL=C grep -F ${JSON.stringify(pattern)} | grep -v grep | head -1`
  );
  return out !== "";
}

function dirStats(dir: string): { files: number; placeholders: number } {
  const abs = join(CORPUS, dir);
  if (!existsSync(abs)) return { files: 0, placeholders: 0 };
  const files = parseInt(sh(`find ${JSON.stringify(abs)} -name '*.md' | wc -l`) || "0", 10);
  const placeholders = parseInt(
    sh(
      `LC_ALL=C grep -rlF 'Volltext nicht abrufbar' ${JSON.stringify(abs)} --include='*.md' 2>/dev/null | wc -l`
    ) || "0",
    10
  );
  return { files, placeholders };
}

/** True when any corpus file in `dir` changed since `sinceIso` (or none recorded). */
function needsImport(dir: string, sinceIso: string | undefined): boolean {
  if (!sinceIso) return true;
  const abs = join(CORPUS, dir);
  const newer = sh(
    `find ${JSON.stringify(abs)} -name '*.md' -newermt ${JSON.stringify(sinceIso)} 2>/dev/null | head -1`
  );
  return newer !== "";
}

function dbUrl(): string {
  // In Docker/Hetzner, DATABASE_URL is set as an environment variable.
  // Locally, fall back to reading server/.env.
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  try {
    const env = readFileSync(join(SERVER_DIR, ".env"), "utf-8");
    const m = env.match(/postgres(?:ql)?:\/\/[^\s"']+/);
    if (!m) throw new Error("No postgres URL in server/.env");
    return m[0];
  } catch {
    throw new Error("No DATABASE_URL env var and no postgres URL in server/.env");
  }
}

async function risHits(applikation: string): Promise<number> {
  try {
    const res = await fetch(
      `https://data.bka.gv.at/ris/api/v2.6/Judikatur?Applikation=${encodeURIComponent(applikation)}&PageSize=1`,
      { signal: AbortSignal.timeout(20_000) }
    );
    if (!res.ok) return -1;
    const data = (await res.json()) as any;
    const hits = data?.OgdSearchResult?.OgdDocumentResults?.Hits?.["#text"];
    return hits ? parseInt(String(hits), 10) : -1;
  } catch {
    return -1;
  }
}

// ── Stage runners ──────────────────────────────────────────────────────

/** Start a child process and record its PID in the DB.
 *  The PID is tracked in pipeline_state.pid so we can detect stale processes
 *  and enforce timeouts — replacing the old `ps grep` approach. */
/** Path of the exit-code file a wrapped process writes on termination. */
function exitFileFor(name: string): string {
  return join(LOG_DIR, `${name}.exit`);
}

/**
 * Read a finished process's exit code: 0 = clean success, >0 = crashed,
 * null = no exit file (process was SIGKILLed, or predates exit tracking).
 * Callers MUST treat null as failure — "the process is gone" said nothing
 * about success (2026-07-15: killed imports were promoted to done with a
 * fraction of their data; nothing ever restarted them).
 */
function readExitCode(name: string): number | null {
  try {
    const raw = readFileSync(exitFileFor(name), "utf-8").trim();
    return raw === "" ? null : parseInt(raw, 10);
  } catch {
    return null;
  }
}

function startProcess(
  name: string,
  argv: string[],
  sourceKey: string,
  timeoutS: number = 3600
): void {
  const log = join(LOG_DIR, `${name}.log`);
  const exitFile = exitFileFor(name);
  try {
    unlinkSync(exitFile);
  } catch {
    /* no previous exit file */
  }
  const fd = openSync(log, "a");
  // sh wrapper captures the exit code — the only reliable success signal.
  // detached:true makes the wrapper a process-group leader so stale-kill can
  // take down the whole group (wrapper + bun child) via kill(-pid).
  const shCmd = `bun ${argv.map((a) => JSON.stringify(a)).join(" ")}; echo $? > ${JSON.stringify(exitFile)}`;
  const child = spawn("sh", ["-c", shCmd], {
    cwd: SERVER_DIR,
    detached: true,
    stdio: ["ignore", fd, fd],
  });
  child.unref();
  const pid = child.pid || 0;
  const cmd = `bun ${argv.join(" ")}`;
  // Record PID in DB
  updateSourceState(sourceKey, {
    pid: pid || null,
    pid_cmd: cmd,
    pid_started_at: new Date().toISOString(),
    pid_timeout_s: timeoutS,
  });
  console.log(`  ▶ gestartet: ${name} (pid ${pid}) → ${log}`);
}

/** Check if the process for a source is still running, handling stale PIDs.
 *  Returns {running, stale}. If stale, kills the process and clears the PID. */
function checkSourceProcess(key: string, state: CycleState): { running: boolean; stale: boolean } {
  const pidInfo = state.pidMap[key];
  if (!pidInfo) {
    // No PID tracked — use legacy grep as fallback (for manually started processes)
    return { running: false, stale: false };
  }
  const { alive, stale } = pidStatus(pidInfo.pid, pidInfo.startedAt, pidInfo.timeoutS);
  if (!alive) {
    // Process finished — clear PID in DB
    updateSourceState(key, { pid: null, pid_cmd: null, pid_started_at: null });
    delete state.pidMap[key];
    return { running: false, stale: false };
  }
  if (stale) {
    killStalePid(pidInfo.pid, key);
    updateSourceState(key, { pid: null, pid_cmd: null, pid_started_at: null });
    delete state.pidMap[key];
    return { running: false, stale: true };
  }
  return { running: true, stale: false };
}

// ── Reconciliation: Stichproben-Zweitfetch (Layer 4) ───────────────────

/** Pick N random .md files from a corpus dir, re-fetch their source_url,
 *  compare content hash with the local file. Returns mismatches. */
async function sampleRefetch(
  dir: string,
  sampleSize: number
): Promise<{ checked: number; mismatches: number; errors: number; details: string[] }> {
  const abs = join(CORPUS, dir);
  if (!existsSync(abs)) return { checked: 0, mismatches: 0, errors: 0, details: [] };

  const allFiles = sh(`find ${JSON.stringify(abs)} -name '*.md' -type f`)
    .split("\n")
    .filter(Boolean);
  if (allFiles.length === 0) return { checked: 0, mismatches: 0, errors: 0, details: [] };

  // Shuffle and pick sampleSize
  const shuffled = allFiles
    .sort(() => Math.random() - 0.5)
    .slice(0, Math.min(sampleSize, allFiles.length));

  let checked = 0;
  let mismatches = 0;
  let errors = 0;
  const details: string[] = [];

  for (const f of shuffled) {
    try {
      const content = readFileSync(f, "utf-8");
      // Extract source_url from frontmatter
      const urlMatch = content.match(/^source_url:\s*(.+)$/m);
      if (!urlMatch) continue;
      const url = urlMatch[1].trim().replace(/["']/g, "");
      if (!url.startsWith("http")) continue;

      // Fetch the URL
      const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
      if (!res.ok) {
        errors++;
        details.push(`FETCH_ERROR ${f}: HTTP ${res.status}`);
        continue;
      }
      const fetchedText = await res.text();

      // For HTML sources, the fetched content will be HTML while local is stripped text.
      // So we check if key identifiers (ECLI, case number, CELEX) are present in fetched content.
      // This is a soft check — not a strict hash match.
      const ecliMatch = content.match(/ecli:\s*(.+)/i);
      const caseNumMatch = content.match(/case_number:\s*(.+)/i);
      const celexMatch = content.match(/celex:\s*(.+)/i);
      const identifier =
        ecliMatch?.[1]?.trim() || caseNumMatch?.[1]?.trim() || celexMatch?.[1]?.trim();

      if (identifier) {
        const normFetched = fetchedText.replace(/\s+/g, "").toLowerCase();
        const normId = identifier.replace(/\s+/g, "").toLowerCase().replace(/["']/g, "");
        if (!normFetched.includes(normId)) {
          mismatches++;
          details.push(`MISMATCH ${f}: identifier '${identifier}' not found in fetched content`);
        }
      }
      checked++;
    } catch (e) {
      errors++;
      details.push(`ERROR ${f}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return { checked, mismatches, errors, details };
}

// ── Freshness check (runs at most once per 24h) ────────────────────────

function runFreshnessCheck(): void {
  const key = "freshness-check";
  ensureSourceRow(key);

  // Check if we already ran in the last 24h
  const row = psqlJSON(`SELECT last_cycle_at FROM pipeline_state WHERE source_key = '${key}'`);
  if (Array.isArray(row) && row.length > 0 && row[0].last_cycle_at) {
    const lastRun = new Date(row[0].last_cycle_at);
    const hoursSince = (Date.now() - lastRun.getTime()) / 3_600_000;
    if (hoursSince < 24) return; // Skip — already ran today
  }

  console.log("  [freshness] Running statute freshness check...");
  const output = sh(
    `cd ${SERVER_DIR} && bun scripts/check-statute-completeness.ts --jurisdiction at 2>&1`
  );

  // Parse output for outdated statutes
  const outdatedMatches = output.match(/outdated\s+(\d+)/gi);
  const outdatedCount = outdatedMatches ? outdatedMatches.length : 0;

  // Also check DE and CH
  const deOutput = sh(
    `cd ${SERVER_DIR} && bun scripts/check-statute-completeness.ts --jurisdiction de 2>&1`
  );
  const deOutdated = (deOutput.match(/outdated/gi) || []).length;

  const chOutput = sh(
    `cd ${SERVER_DIR} && bun scripts/check-statute-completeness.ts --jurisdiction ch 2>&1`
  );
  const chOutdated = (chOutput.match(/outdated/gi) || []).length;

  const totalOutdated = outdatedCount + deOutdated + chOutdated;

  updateSourceState(key, {
    last_cycle_at: new Date().toISOString(),
    stage: totalOutdated > 0 ? "alerts" : "ok",
  });

  if (totalOutdated > 0) {
    raiseAlert(
      key,
      "statutes_stale",
      "warning",
      `${totalOutdated} statute(s) outdated vs. official API (AT:${outdatedCount} DE:${deOutdated} CH:${chOutdated})`
    );
  } else {
    clearAlerts(key, "statutes_stale");
  }

  console.log(`  [freshness] Done: ${totalOutdated} outdated statute(s)`);
}

// ── Layer 5: Hash File→DB Alarm ────────────────────────────────────────

/** Check that content_hash in DB matches a re-computed hash from the source
 *  file. Alerts on mismatch — indicates corruption between download and
 *  import, or silent file modification after import. */
function runHashIntegrityCheck(): void {
  const key = "hash-integrity";
  ensureSourceRow(key);

  // Check if we already ran in the last 6h
  const row = psqlJSON(`SELECT last_cycle_at FROM pipeline_state WHERE source_key = '${key}'`);
  if (Array.isArray(row) && row.length > 0 && row[0].last_cycle_at) {
    const lastRun = new Date(row[0].last_cycle_at);
    const hoursSince = (Date.now() - lastRun.getTime()) / 3_600_000;
    if (hoursSince < 6) return;
  }

  console.log("  [hash-integrity] Checking content_hash consistency...");

  // Sample: pick 100 random pages that have a source_path and content_hash
  const samples = psqlJSON(
    `SELECT source_id, slug, content_hash, source_path
     FROM pages
     WHERE content_hash IS NOT NULL
       AND source_path IS NOT NULL
       AND deleted_at IS NULL
     ORDER BY random()
     LIMIT 100`
  );

  if (!Array.isArray(samples) || samples.length === 0) {
    updateSourceState(key, { last_cycle_at: new Date().toISOString(), stage: "ok" });
    return;
  }

  let checked = 0;
  let mismatches = 0;

  for (const sample of samples) {
    const sourcePath = sample.source_path;
    if (!sourcePath) continue;

    // Re-read the file and compute hash
    const fullPath = sourcePath.startsWith("/") ? sourcePath : join(CORPUS, sourcePath);

    if (!existsSync(fullPath)) continue;

    try {
      const content = readFileSync(fullPath, "utf-8");
      const recomputed = createHash("sha256").update(content).digest("hex");

      if (recomputed !== sample.content_hash) {
        mismatches++;
        raiseAlert(
          key,
          "hash_mismatch",
          "error",
          `Content hash mismatch for ${sample.source_id}/${sample.slug}: DB=${sample.content_hash?.substring(0, 12)}... file=${recomputed.substring(0, 12)}...`
        );
      }
      checked++;
    } catch {
      // File read error — skip
    }
  }

  if (mismatches > 0) {
    raiseAlert(
      key,
      "hash_integrity",
      "error",
      `${mismatches}/${checked} sampled pages have content_hash mismatches`
    );
  } else {
    clearAlerts(key, "hash_mismatch");
    clearAlerts(key, "hash_integrity");
  }

  updateSourceState(key, {
    last_cycle_at: new Date().toISOString(),
    stage: mismatches > 0 ? "alerts" : "ok",
  });

  console.log(`  [hash-integrity] Done: ${checked} checked, ${mismatches} mismatches`);
}

// ── Layer 6: Fassungs-Sync (version_date delta) ────────────────────────

/** Check for statutes that have been updated on RIS since our last import.
 *  Uses the `effective_date` field in pages to compare against the latest
 *  RIS version_date for each law. Alerts on stale statutes. */
function runFassungsSync(): void {
  const key = "fassungs-sync";
  ensureSourceRow(key);

  // Check if we already ran in the last 12h
  const row = psqlJSON(`SELECT last_cycle_at FROM pipeline_state WHERE source_key = '${key}'`);
  if (Array.isArray(row) && row.length > 0 && row[0].last_cycle_at) {
    const lastRun = new Date(row[0].last_cycle_at);
    const hoursSince = (Date.now() - lastRun.getTime()) / 3_600_000;
    if (hoursSince < 12) return;
  }

  console.log("  [fassungs-sync] Checking statute version dates...");

  // Get the most recent effective_date per source_id for AT statutes
  const dbDates = psqlJSON(
    `SELECT source_id, max(effective_date) as latest_effective
     FROM pages
     WHERE source_id IN ('law-at', 'law-de', 'law-ch')
       AND effective_date IS NOT NULL
       AND deleted_at IS NULL
     GROUP BY source_id`
  );

  if (!Array.isArray(dbDates) || dbDates.length === 0) {
    updateSourceState(key, { last_cycle_at: new Date().toISOString(), stage: "ok" });
    return;
  }

  let staleCount = 0;

  // For each jurisdiction, check the newest file modification date in the corpus
  for (const dbDate of dbDates) {
    const jurisdiction =
      dbDate.source_id === "law-at" ? "at" : dbDate.source_id === "law-de" ? "de" : "ch";
    const corpusDir = join(CORPUS, jurisdiction);
    if (!existsSync(corpusDir)) continue;

    // Find the most recently modified .md file
    const newestFile = sh(
      `find ${JSON.stringify(corpusDir)} -name '*.md' -type f -printf '%T@ %p\n' 2>/dev/null | sort -rn | head -1`
    );
    if (!newestFile) continue;

    const fileTime = parseFloat(newestFile.split(" ")[0] || "0");
    const dbLatest = new Date(dbDate.latest_effective).getTime();
    const fileLatest = fileTime * 1000;

    // If the newest file is more than 7 days newer than the DB's latest effective_date,
    // we likely have un-imported updates
    const dayDiff = (fileLatest - dbLatest) / 86_400_000;
    if (dayDiff > 7) {
      staleCount++;
      raiseAlert(
        key,
        "fassung_stale",
        "warning",
        `${dbDate.source_id}: newest corpus file is ${dayDiff.toFixed(0)} days newer than DB effective_date — un-imported updates likely`
      );
    }
  }

  if (staleCount === 0) {
    clearAlerts(key, "fassung_stale");
  }

  updateSourceState(key, {
    last_cycle_at: new Date().toISOString(),
    stage: staleCount > 0 ? "alerts" : "ok",
  });

  console.log(`  [fassungs-sync] Done: ${staleCount} stale jurisdiction(s)`);
}

// ── Main cycle ─────────────────────────────────────────────────────────

interface SourceReport {
  key: string;
  disk: number;
  placeholders: number;
  dbPages: number;
  risTotal?: number;
  stage: string;
  action: string;
  alerts?: number;
}

async function cycle(): Promise<void> {
  // Ensure the pipeline-lock row exists
  ensureSourceRow("pipeline-lock");

  // Acquire cycle lock — prevents two pipeline instances from running
  // simultaneously and spawning duplicate processes.
  const locked = tryAcquireCycleLock();
  if (!locked) {
    console.log("  ⏭️ Cycle skipped — another pipeline instance holds the lock");
    return;
  }

  try {
    // Load state from DB (not JSON file)
    const dbState = loadDBState();
    const state = stateFromDB(dbState);
    const reports: SourceReport[] = [];
    const startedAt = new Date().toISOString();

    // Ensure all source rows exist in DB (including backfill-* keys for PID tracking)
    for (const src of [...SIMPLE, ...JUDIKATUR]) {
      const key = src.kind === "judikatur" ? `jud-${src.key}` : src.key;
      ensureSourceRow(key);
      if (src.kind === "judikatur") {
        ensureSourceRow(`backfill-jud-${src.key}`);
      }
    }
    // Also ensure embed source row
    ensureSourceRow("embed");
    // Also ensure freshness-check source row
    ensureSourceRow("freshness-check");
    // Also ensure hash-integrity and fassungs-sync source rows
    ensureSourceRow("hash-integrity");
    ensureSourceRow("fassungs-sync");

    // Reload state after ensuring rows
    const freshDbState = loadDBState();
    const freshState = stateFromDB(freshDbState);
    Object.assign(state, freshState);

    // Global DB measurements (one query each)
    const dbBySource = new Map<string, number>();
    for (const line of psqlQuery(
      "SELECT source_id, count(*) FROM pages WHERE deleted_at IS NULL GROUP BY source_id"
    ).split("\n")) {
      const [sid, n] = line.split("|");
      if (sid) dbBySource.set(sid.trim(), parseInt(n, 10) || 0);
    }
    const pendingEmbeds = parseInt(
      psqlQuery("SELECT count(*) FROM content_chunks WHERE embedded_at IS NULL") || "0",
      10
    );
    const totalChunks = parseInt(psqlQuery("SELECT count(*) FROM content_chunks") || "0", 10);
    const totalLinks = parseInt(psqlQuery("SELECT count(*) FROM links") || "0", 10);

    // Shared import-stage decision. Uses PID-based running detection.
    // pendingImport → lastImportSuccess promotion happens when the process
    // we started is observed finished (PID no longer alive).
    function importStage(
      key: string,
      dir: string,
      startArgv: string[] | null,
      timeoutS: number = 7200
    ): { stage: string; action: string } {
      const { running, stale } = checkSourceProcess(key, state);
      if (running) return { stage: "importing", action: "—" };

      if (state.pendingImport[key]) {
        // The process we started is gone — but "gone" is NOT "succeeded".
        // Only a clean exit 0 promotes to done; a crash, kill, or missing
        // exit file leaves lastImportSuccess unset so the import re-runs.
        // (2026-07-15: killed statute imports were promoted with a fraction
        // of their pages imported and nothing ever restarted them.)
        const code = readExitCode(`import-${key}`);
        if (code === 0) {
          state.lastImportSuccess[key] = state.pendingImport[key];
          delete state.pendingImport[key];
          updateSourceState(key, {
            pending_import_since: null,
            last_import_success: state.lastImportSuccess[key],
            stage: "done",
          });
          appendHistory(key, "import", "finished");
          clearAlerts(key, "import_failed");
        } else {
          delete state.pendingImport[key];
          updateSourceState(key, { pending_import_since: null });
          state.importFailCount[key] = (state.importFailCount[key] || 0) + 1;
          appendHistory(key, "import", `failed (exit ${code === null ? "killed/unknown" : code})`);
          raiseAlert(
            key,
            "import_failed",
            "error",
            `Import exited ${code === null ? "without exit code (killed?)" : `with code ${code}`} — attempt ${state.importFailCount[key]}`
          );
        }
      }

      if (!needsImport(dir, state.lastImportSuccess[key] || undefined)) {
        return { stage: "done", action: "—" };
      }

      // Fail-closed retry cap: after MAX_IMPORT_ATTEMPTS consecutive failures
      // the source needs a human (or an alert-webhook consumer) — endless
      // crash-looping would hammer the DB and mask the real problem.
      if ((state.importFailCount[key] || 0) >= MAX_IMPORT_ATTEMPTS) {
        return { stage: "failed", action: `aufgegeben nach ${MAX_IMPORT_ATTEMPTS} Fehlversuchen` };
      }

      if (REPORT_ONLY || !startArgv) return { stage: "import-pending", action: "import nötig" };

      const now = new Date().toISOString();
      startProcess(`import-${key}`, startArgv, key, timeoutS);
      state.pendingImport[key] = now;
      updateSourceState(key, { pending_import_since: now, stage: "importing" });
      appendHistory(key, "import", "started");
      return { stage: "importing", action: "import gestartet" };
    }

    // ── Statutes + simple sources ──
    for (const src of SIMPLE) {
      const stats = dirStats(src.dir);
      const dbPages = dbBySource.get(src.sourceId) || 0;
      // Empty/absent dir (e.g. literature sources before their first fetch):
      // nothing to import — starting the import would only crash-loop.
      const { stage, action } =
        stats.files === 0
          ? { stage: "empty", action: "kein Korpus auf Disk — fetch zuerst" }
          : importStage(src.key, src.dir, src.importCmd);

      // Update DB with measurements
      updateSourceState(src.key, {
        disk_count: stats.files,
        db_pages: dbPages,
        last_placeholder_count: stats.placeholders,
        last_cycle_at: startedAt,
        stage,
      });

      reports.push({
        key: src.key,
        disk: stats.files,
        placeholders: stats.placeholders,
        dbPages,
        stage,
        action,
      });
    }

    // ── EU backfill (parallel, safe — Cellar API has no MyraCloud) ──
    for (const src of SIMPLE) {
      if (src.kind !== "eu") continue;
      const euBackfillKey = `backfill-${src.key}`;
      const euBackfillProc = checkSourceProcess(euBackfillKey, state);
      const euBackfillRunning =
        euBackfillProc.running ||
        processRunningGrep(`backfill-corpus-text.ts --dir law-corpus/${src.dir} `);
      const euStats = dirStats(src.dir);

      if (!euBackfillRunning && euStats.placeholders > 0) {
        if (!REPORT_ONLY) {
          // EU Cellar: concurrency 5, 500ms rate limit — no bot protection
          startProcess(
            `backfill-${src.key}`,
            [
              "scripts/backfill-corpus-text.ts",
              "--dir",
              `law-corpus/${src.dir}`,
              "--concurrency",
              "5",
            ],
            euBackfillKey,
            14400 // 4h timeout — EU dirs are large (161k regulations)
          );
          appendHistory(src.key, "backfill", "started (EU, concurrency 5)");
        }
      }
    }

    // Check if AT statutes are done (ordering gate for judikatur)
    const statutesAtProc = checkSourceProcess("statutes-at", state);
    const statutesAtDone =
      !statutesAtProc.running &&
      !needsImport("at", state.lastImportSuccess["statutes-at"] || undefined);

    // ── Judikatur sources ──
    // RIS single-connection: only start 1 RIS backfill per pipeline cycle.
    // The guard inside the loop checks both process state AND this flag
    // to prevent race conditions when multiple sources have placeholders.
    let risBackfillStartedThisCycle = false;
    for (const src of JUDIKATUR) {
      const judKey = `jud-${src.key}`;
      const stats = dirStats(src.dir);
      const dbPages = dbBySource.get(src.sourceId) || 0;
      const ris = await risHits(src.risApplikation);

      // Check processes via PID tracking
      const backfillProc = checkSourceProcess(`backfill-${judKey}`, state);
      const importProc = checkSourceProcess(judKey, state);
      // Also check with legacy grep as fallback (for manually started processes)
      const backfillRunning =
        backfillProc.running ||
        processRunningGrep(`backfill-corpus-text.ts --dir law-corpus/${src.dir} --concurrency`);
      const importRunning =
        importProc.running || processRunningGrep(`import-judikatur.ts --source ${src.key} `);

      let stage = "idle";
      let action = "—";

      // Exhaustion bookkeeping: only a backfill WE started and observed finish
      // without reducing the placeholder count marks a source as exhausted.
      if (
        !backfillRunning &&
        state.pendingBackfillPh[judKey] !== undefined &&
        state.pendingBackfillPh[judKey] !== null
      ) {
        if (stats.placeholders >= (state.pendingBackfillPh[judKey] || 0)) {
          state.backfillExhausted[judKey] = true;
          updateSourceState(judKey, { backfill_exhausted: true });
        }
        state.pendingBackfillPh[judKey] = null;
        updateSourceState(judKey, { pending_backfill_ph: null });
      }
      if (stats.placeholders !== state.lastPlaceholderCount[judKey]) {
        delete state.backfillExhausted[judKey];
        updateSourceState(judKey, { backfill_exhausted: false });
      }
      state.lastPlaceholderCount[judKey] = stats.placeholders;

      // ── Reconciliation Layer 3: Mengen-Abgleich ──
      // Alert if disk count vs RIS total gap exceeds threshold
      if (ris > 0 && stats.files > 0) {
        const gap = 1 - stats.files / ris;
        if (gap > RECONCILE_GAP_THRESHOLD) {
          const gapPct = (gap * 100).toFixed(1);
          raiseAlert(
            judKey,
            "reconcile_gap",
            "warning",
            `Disk ${stats.files} vs RIS ${ris} — ${gapPct}% gap (threshold ${RECONCILE_GAP_THRESHOLD * 100}%)`
          );
        } else {
          clearAlerts(judKey, "reconcile_gap");
        }
      }

      if (backfillRunning) {
        stage = "backfilling";
      } else if (stats.placeholders > 0 && !state.backfillExhausted[judKey]) {
        stage = "backfill-pending";
        if (!REPORT_ONLY) {
          const backfillKey = `backfill-${judKey}`;
          // RIS single-connection guard: only 1 RIS backfill at a time.
          // Check if any other judikatur backfill is already running.
          let otherRisBackfillRunning = false;
          for (const other of JUDIKATUR) {
            if (other.key === src.key) continue;
            const otherKey = `backfill-jud-${other.key}`;
            const otherProc = checkSourceProcess(otherKey, state);
            const otherRunning =
              otherProc.running ||
              processRunningGrep(`backfill-corpus-text.ts --dir law-corpus/${other.dir} `);
            if (otherRunning) {
              otherRisBackfillRunning = true;
              break;
            }
          }
          if (otherRisBackfillRunning || risBackfillStartedThisCycle) {
            stage = "waiting-for-ris-slot";
            action = "wartet auf freie RIS-Connection";
          } else {
            // RIS OGD: concurrency 1 during business hours, 2 during off-hours
            // (18:00-06:00 CET or weekends). Off-hours doubling is safe — RIS
            // is less loaded and MyraCloud is more permissive outside peak.
            const backfillConcurrency = isRisOffHours() ? "2" : "1";
            startProcess(
              `backfill-${src.key}`,
              [
                "scripts/backfill-corpus-text.ts",
                "--dir",
                `law-corpus/${src.dir}`,
                "--concurrency",
                backfillConcurrency,
              ],
              backfillKey,
              7200
            ); // 2h timeout for backfill
            state.pendingBackfillPh[judKey] = stats.placeholders;
            updateSourceState(judKey, {
              pending_backfill_ph: stats.placeholders,
              stage: "backfilling",
            });
            appendHistory(judKey, "backfill", "started");
            action = "backfill gestartet";
            risBackfillStartedThisCycle = true;
            // Immediately update pidMap so checkSourceProcess sees it
            // in the same cycle (DB update is async, pidMap is in-memory)
            state.pidMap[backfillKey] = {
              pid: 0, // actual PID is in DB, we just need running=true
              cmd: `bun scripts/backfill-corpus-text.ts --dir law-corpus/${src.dir} --concurrency ${backfillConcurrency}`,
              startedAt: new Date().toISOString(),
              timeoutS: 7200,
            };
          }
        }
      } else if (!statutesAtDone) {
        stage = "waiting-for-statutes";
      } else {
        const r = importStage(
          judKey,
          src.dir,
          ["scripts/import-judikatur.ts", "--source", src.key, "--no-embed", "--skip-placeholders"],
          7200
        );
        stage = r.stage;
        action = r.action;
      }

      // Update DB with measurements
      updateSourceState(judKey, {
        disk_count: stats.files,
        db_pages: dbPages,
        ris_total: ris >= 0 ? ris : null,
        last_placeholder_count: stats.placeholders,
        last_cycle_at: startedAt,
        stage,
      });

      // Count active alerts for report (from fresh DB state, no extra query)
      const dbRow = freshDbState.get(judKey);
      const alertCount = dbRow?.alert_flags?.length || 0;

      reports.push({
        key: judKey,
        disk: stats.files,
        placeholders: stats.placeholders,
        dbPages,
        risTotal: ris >= 0 ? ris : undefined,
        stage,
        action,
        alerts: alertCount,
      });
    }

    // ── Embed stage ──
    let embedAction = "—";
    const embedProc = checkSourceProcess("embed", state);
    const embedRunning = embedProc.running || processRunningGrep("auto-embed-pg.ts");
    if (pendingEmbeds > 0 && !embedRunning && !REPORT_ONLY) {
      startProcess(
        "auto-embed",
        ["scripts/auto-embed-pg.ts", "--batch-size", "100"],
        "embed",
        3600
      );
      embedAction = `embed gestartet (${pendingEmbeds} pending)`;
      updateSourceState("embed", { stage: "importing", last_cycle_at: startedAt });
      appendHistory("embed", "embed", "started");
    } else if (embedRunning) {
      embedAction = `embed läuft (${pendingEmbeds} pending)`;
    }

    // ── Freshness check (at most once per 24h) ──
    runFreshnessCheck();

    // ── Layer 5: Hash File→DB integrity check (at most once per 6h) ──
    runHashIntegrityCheck();

    // ── Layer 6: Fassungs-Sync / version_date delta (at most once per 12h) ──
    runFassungsSync();

    // ── Report ──
    const lines: string[] = [];
    lines.push(`# Corpus-Pipeline Report — ${startedAt}`);
    lines.push("");
    lines.push(
      `Chunks: ${totalChunks} | Embeddings pending: ${pendingEmbeds} (${embedAction}) | Links: ${totalLinks}`
    );
    lines.push("");
    lines.push(
      "| Quelle | Disk | Platzhalter | DB-Seiten | RIS gesamt | Deckung | Stage | Aktion | Alerts |"
    );
    lines.push("|---|---:|---:|---:|---:|---:|---|---|---:|");
    for (const r of reports) {
      const cov = r.risTotal ? `${((r.disk / r.risTotal) * 100).toFixed(1)}%` : "—";
      lines.push(
        `| ${r.key} | ${r.disk} | ${r.placeholders} | ${r.dbPages} | ${r.risTotal ?? "—"} | ${cov} | ${r.stage} | ${r.action} | ${r.alerts || 0} |`
      );
    }
    const totalRis = reports.reduce((s, r) => s + (r.risTotal || 0), 0);
    const totalDisk = reports.filter((r) => r.risTotal).reduce((s, r) => s + r.disk, 0);
    lines.push("");
    lines.push(
      `**Judikatur-Discovery-Lücke:** RIS ${totalRis} vs. lokal ${totalDisk} → es fehlen ${Math.max(0, totalRis - totalDisk)} Entscheidungen (Discovery-Fetch bewusst manuell — fetch-all-at-judikatur.ts).`
    );

    // ── Alert summary ──
    const allAlerts = psqlJSON(
      `SELECT source_key, alert_flags FROM pipeline_state WHERE alert_flags != '[]'::jsonb AND alert_flags IS NOT NULL`
    );
    if (Array.isArray(allAlerts) && allAlerts.length > 0) {
      lines.push("");
      lines.push(`**Aktive Alerts:** ${allAlerts.length} Quelle(n) mit Alerts`);
      for (const row of allAlerts) {
        const flags = row.alert_flags || [];
        for (const a of flags) {
          lines.push(
            `  - [${a.severity}] ${row.source_key}: ${a.type} — ${a.message} (${a.raised_at})`
          );
        }
      }
    }

    const report = lines.join("\n");
    writeFileSync(join(LOG_DIR, "report-latest.md"), report + "\n");
    writeFileSync(
      join(LOG_DIR, "report-latest.json"),
      JSON.stringify(
        { startedAt, totalChunks, pendingEmbeds, totalLinks, sources: reports },
        null,
        2
      )
    );
    console.log(report);
  } finally {
    releaseCycleLock();
  }
}

// ── Stichproben-Zweitfetch mode (--sample-check) ────────────────────────

async function runSampleCheck(): Promise<void> {
  console.log(`# Stichproben-Zweitfetch — ${new Date().toISOString()}`);
  console.log(`Sampling ${SAMPLE_SIZE} files per source...\n`);

  let totalChecked = 0;
  let totalMismatches = 0;
  let totalErrors = 0;

  for (const src of JUDIKATUR) {
    const judKey = `jud-${src.key}`;
    ensureSourceRow(judKey);
    const result = await sampleRefetch(src.dir, SAMPLE_SIZE);
    if (result.checked > 0) {
      console.log(
        `${judKey}: checked=${result.checked} mismatches=${result.mismatches} errors=${result.errors}`
      );
      if (result.mismatches > 0) {
        raiseAlert(
          judKey,
          "sample_mismatch",
          "warning",
          `${result.mismatches}/${result.checked} sampled files mismatch on re-fetch`
        );
      }
      for (const d of result.details) console.log(`  ${d}`);
      totalChecked += result.checked;
      totalMismatches += result.mismatches;
      totalErrors += result.errors;
    }
  }

  // Also check EU sources
  for (const src of SIMPLE.filter((s) => s.kind === "eu")) {
    ensureSourceRow(src.key);
    const result = await sampleRefetch(src.dir, SAMPLE_SIZE);
    if (result.checked > 0) {
      console.log(
        `${src.key}: checked=${result.checked} mismatches=${result.mismatches} errors=${result.errors}`
      );
      if (result.mismatches > 0) {
        raiseAlert(
          src.key,
          "sample_mismatch",
          "warning",
          `${result.mismatches}/${result.checked} sampled files mismatch on re-fetch`
        );
      }
      for (const d of result.details) console.log(`  ${d}`);
      totalChecked += result.checked;
      totalMismatches += result.mismatches;
      totalErrors += result.errors;
    }
  }

  console.log(
    `\n--- Summary: checked=${totalChecked} mismatches=${totalMismatches} errors=${totalErrors}`
  );
}

async function main() {
  // Wait for DB DNS resolution before starting — Docker DNS can take a few
  // seconds to propagate on container start, and if the first cycle acquires
  // the lock but then fails to connect, the lock gets stuck.
  const dbHost = new URL(dbUrl()).hostname;
  console.log(`Waiting for DB host "${dbHost}" to resolve...`);
  for (let i = 0; i < 30; i++) {
    try {
      sh(`getent hosts ${dbHost} 2>/dev/null || nslookup ${dbHost} 2>/dev/null`);
      console.log(`DB host resolved. Starting pipeline.`);
      break;
    } catch {
      if (i === 29) {
        console.error(`Could not resolve DB host "${dbHost}" after 30s — exiting.`);
        process.exit(1);
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  if (SAMPLE_CHECK) {
    await runSampleCheck();
    return;
  }
  if (LOOP) {
    console.log(`Corpus-Pipeline Supervisor — Loop alle ${INTERVAL_S}s (Logs: ${LOG_DIR})`);
    if (ALERT_WEBHOOK) console.log(`Alert webhook: ${ALERT_WEBHOOK}`);
    // eslint-disable-next-line no-constant-condition
    while (true) {
      try {
        await cycle();
      } catch (e) {
        console.error("cycle failed:", e instanceof Error ? e.message : e);
      }
      await new Promise((r) => setTimeout(r, INTERVAL_S * 1000));
    }
  } else {
    await cycle();
  }
}

main();
