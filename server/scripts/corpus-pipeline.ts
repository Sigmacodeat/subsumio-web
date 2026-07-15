#!/usr/bin/env bun
/**
 * Corpus Pipeline Orchestrator — the single supervisor for the legal-corpus
 * ingest chain. Replaces the pile of hand-started background scripts with one
 * idempotent state machine per source:
 *
 *   backfill (text fetch+validate) → import (chunk) → embed → reconcile
 *
 * Design rules (born from the 2026-07-14/15 incidents):
 *   - MEASURE, don't remember: every stage decision derives from observable
 *     state (placeholder counts on disk, page counts in DB, pending embeds),
 *     not from what a previous run claims to have done. The tiny state file
 *     only caches input signatures to avoid needless re-imports.
 *   - Fail-closed content: backfill-corpus-text.ts validates identity
 *     (case_number/ECLI in fetched text) before writing; import-judikatur
 *     runs with --skip-placeholders so text-less stubs never enter the brain.
 *   - Ordering: judikatur imports wait for the AT statute import, because
 *     judikatur-cites edges are only written when the target § page exists.
 *   - Reconcile: every cycle compares RIS (live API Hits), disk, and DB and
 *     writes a report — the "haben wir wirklich alles?" answer, continuously.
 *
 * Usage:
 *   bun scripts/corpus-pipeline.ts --once           # one cycle, then exit
 *   bun scripts/corpus-pipeline.ts --loop           # supervise forever (default interval 600s)
 *   bun scripts/corpus-pipeline.ts --loop --interval 300
 *   bun scripts/corpus-pipeline.ts --report-only    # measure + report, start nothing
 *
 * Discovery (fetching the ~444k decisions RIS has but we never downloaded)
 * is intentionally NOT auto-started — the report shows the gap; start
 * fetch-all-at-judikatur.ts deliberately when ready.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, openSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { spawn, execSync } from "child_process";

const _dir = dirname(fileURLToPath(import.meta.url));
const SERVER_DIR = join(_dir, "..");
const CORPUS = join(SERVER_DIR, "..", "law-corpus");
const HOME = process.env.HOME || "~";
const LOG_DIR = join(HOME, "subsumio-pipeline-logs");
const STATE_FILE = join(HOME, ".subsumio-corpus-pipeline.json");
mkdirSync(LOG_DIR, { recursive: true });

const args = process.argv.slice(2);
const LOOP = args.includes("--loop");
const REPORT_ONLY = args.includes("--report-only");
const intervalIdx = args.indexOf("--interval");
const INTERVAL_S = intervalIdx >= 0 ? parseInt(args[intervalIdx + 1], 10) : 600;

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

// ── State ──────────────────────────────────────────────────────────────

interface PipelineState {
  /** key → ISO time an import started that later finished (files newer than this ⇒ re-import). */
  lastImportSuccess: Record<string, string>;
  /** key → ISO time of an import we started that hasn't been observed finished yet. */
  pendingImport: Record<string, string>;
  lastPlaceholderCount: Record<string, number>;
  /** key → placeholder count when a backfill we started began. */
  pendingBackfillPh: Record<string, number>;
  /** key → true when a full backfill run finished without reducing placeholders (RIS has no more). */
  backfillExhausted: Record<string, boolean>;
}
function loadState(): PipelineState {
  try {
    const raw = JSON.parse(readFileSync(STATE_FILE, "utf-8"));
    return {
      lastImportSuccess: raw.lastImportSuccess ?? {},
      pendingImport: raw.pendingImport ?? {},
      lastPlaceholderCount: raw.lastPlaceholderCount ?? {},
      pendingBackfillPh: raw.pendingBackfillPh ?? {},
      backfillExhausted: raw.backfillExhausted ?? {},
    };
  } catch {
    return {
      lastImportSuccess: {},
      pendingImport: {},
      lastPlaceholderCount: {},
      pendingBackfillPh: {},
      backfillExhausted: {},
    };
  }
}
function saveState(s: PipelineState) {
  writeFileSync(STATE_FILE, JSON.stringify(s, null, 2));
}

// ── Measurement helpers ────────────────────────────────────────────────

function sh(cmd: string): string {
  try {
    return execSync(cmd, { encoding: "utf-8", maxBuffer: 64 * 1024 * 1024 }).trim();
  } catch {
    return "";
  }
}

function processRunning(pattern: string): boolean {
  // ps+grep instead of pgrep: patterns may start with "-" (script args),
  // which macOS pgrep rejects as an option even quoted.
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
  const env = readFileSync(join(SERVER_DIR, ".env"), "utf-8");
  const m = env.match(/postgres(?:ql)?:\/\/[^\s"']+/);
  if (!m) throw new Error("No postgres URL in server/.env");
  return m[0];
}

function psql(query: string): string {
  return sh(`psql ${JSON.stringify(dbUrl())} -t -A -c ${JSON.stringify(query)}`);
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

function startProcess(name: string, argv: string[]): void {
  const log = join(LOG_DIR, `${name}.log`);
  const fd = openSync(log, "a");
  const child = spawn("bun", argv, {
    cwd: SERVER_DIR,
    detached: true,
    stdio: ["ignore", fd, fd],
  });
  child.unref();
  console.log(`  ▶ gestartet: ${name} (pid ${child.pid}) → ${log}`);
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
}

async function cycle(): Promise<void> {
  const state = loadState();
  const reports: SourceReport[] = [];
  const startedAt = new Date().toISOString();

  // Global DB measurements (one query each)
  const dbBySource = new Map<string, number>();
  for (const line of psql(
    "SELECT source_id, count(*) FROM pages WHERE deleted_at IS NULL GROUP BY source_id"
  ).split("\n")) {
    const [sid, n] = line.split("|");
    if (sid) dbBySource.set(sid.trim(), parseInt(n, 10) || 0);
  }
  const pendingEmbeds = parseInt(
    psql("SELECT count(*) FROM content_chunks WHERE embedded_at IS NULL") || "0",
    10
  );
  const totalChunks = parseInt(psql("SELECT count(*) FROM content_chunks") || "0", 10);
  const totalLinks = parseInt(psql("SELECT count(*) FROM links") || "0", 10);

  // Shared import-stage decision. Returns the stage label and (maybe) starts
  // the import. pendingImport → lastImportSuccess promotion happens when the
  // process we started is observed finished; files changed after that start
  // trigger the next round automatically.
  function importStage(
    key: string,
    dir: string,
    running: boolean,
    startArgv: string[] | null
  ): { stage: string; action: string } {
    if (running) return { stage: "importing", action: "—" };
    if (state.pendingImport[key]) {
      // We started one and it's no longer running → it finished.
      state.lastImportSuccess[key] = state.pendingImport[key];
      delete state.pendingImport[key];
    }
    if (!needsImport(dir, state.lastImportSuccess[key])) {
      return { stage: "done", action: "—" };
    }
    if (REPORT_ONLY || !startArgv) return { stage: "import-pending", action: "import nötig" };
    const startedAt = new Date().toISOString();
    startProcess(`import-${key}`, startArgv);
    state.pendingImport[key] = startedAt;
    return { stage: "importing", action: "import gestartet" };
  }

  // ── Statutes + simple sources ──
  for (const src of SIMPLE) {
    const stats = dirStats(src.dir);
    const dbPages = dbBySource.get(src.sourceId) || 0;
    // Full command string — distinctive enough, and never starts with "-".
    const running = processRunning(src.importCmd.join(" "));
    const { stage, action } = importStage(src.key, src.dir, running, src.importCmd);
    reports.push({
      key: src.key,
      disk: stats.files,
      placeholders: stats.placeholders,
      dbPages,
      stage,
      action,
    });
  }

  const statutesAtDone =
    !processRunning("import-statutes-split.ts --auto-at") &&
    !needsImport("at", state.lastImportSuccess["statutes-at"]);

  // ── Judikatur sources ──
  for (const src of JUDIKATUR) {
    const stats = dirStats(src.dir);
    const dbPages = dbBySource.get(src.sourceId) || 0;
    const ris = await risHits(src.risApplikation);
    // " --concurrency" suffix prevents at-judikatur matching at-judikatur-vfgh etc.
    const backfillRunning = processRunning(
      `backfill-corpus-text.ts --dir law-corpus/${src.dir} --concurrency`
    );
    const importRunning = processRunning(`import-judikatur.ts --source ${src.key} `);
    let stage = "idle";
    let action = "—";

    // Exhaustion bookkeeping: only a backfill WE started and observed finish
    // without reducing the placeholder count marks a source as exhausted
    // (residual placeholders = documents RIS genuinely can't serve; they are
    // skipped at import). New/changed placeholders clear the flag.
    if (!backfillRunning && state.pendingBackfillPh[src.key] !== undefined) {
      if (stats.placeholders >= state.pendingBackfillPh[src.key]) {
        state.backfillExhausted[src.key] = true;
      }
      delete state.pendingBackfillPh[src.key];
    }
    if (stats.placeholders !== state.lastPlaceholderCount[src.key]) {
      delete state.backfillExhausted[src.key];
    }
    state.lastPlaceholderCount[src.key] = stats.placeholders;

    if (backfillRunning) {
      stage = "backfilling";
    } else if (stats.placeholders > 0 && !state.backfillExhausted[src.key]) {
      stage = "backfill-pending";
      if (!REPORT_ONLY) {
        startProcess(`backfill-${src.key}`, [
          "scripts/backfill-corpus-text.ts",
          "--dir",
          `law-corpus/${src.dir}`,
          "--concurrency",
          "5",
        ]);
        state.pendingBackfillPh[src.key] = stats.placeholders;
        action = "backfill gestartet";
      }
    } else if (!statutesAtDone) {
      // Ordering gate for ALL courts: judikatur-cites edges are only written
      // when the target AT § page already exists.
      stage = "waiting-for-statutes";
    } else {
      const r = importStage(src.key, src.dir, importRunning, [
        "scripts/import-judikatur.ts",
        "--source",
        src.key,
        "--no-embed",
        "--skip-placeholders",
      ]);
      stage = r.stage;
      action = r.action;
    }

    reports.push({
      key: `jud-${src.key}`,
      disk: stats.files,
      placeholders: stats.placeholders,
      dbPages,
      risTotal: ris >= 0 ? ris : undefined,
      stage,
      action,
    });
  }

  // ── Embed stage ──
  let embedAction = "—";
  if (pendingEmbeds > 0 && !processRunning("auto-embed-pg.ts") && !REPORT_ONLY) {
    startProcess("auto-embed", ["scripts/auto-embed-pg.ts", "--batch-size", "100"]);
    embedAction = `embed gestartet (${pendingEmbeds} pending)`;
  }

  saveState(state);

  // ── Report ──
  const lines: string[] = [];
  lines.push(`# Corpus-Pipeline Report — ${startedAt}`);
  lines.push("");
  lines.push(
    `Chunks: ${totalChunks} | Embeddings pending: ${pendingEmbeds} (${embedAction}) | Links: ${totalLinks}`
  );
  lines.push("");
  lines.push("| Quelle | Disk | Platzhalter | DB-Seiten | RIS gesamt | Deckung | Stage | Aktion |");
  lines.push("|---|---:|---:|---:|---:|---:|---|---|");
  for (const r of reports) {
    const cov = r.risTotal ? `${((r.disk / r.risTotal) * 100).toFixed(1)}%` : "—";
    lines.push(
      `| ${r.key} | ${r.disk} | ${r.placeholders} | ${r.dbPages} | ${r.risTotal ?? "—"} | ${cov} | ${r.stage} | ${r.action} |`
    );
  }
  const totalRis = reports.reduce((s, r) => s + (r.risTotal || 0), 0);
  const totalDisk = reports.filter((r) => r.risTotal).reduce((s, r) => s + r.disk, 0);
  lines.push("");
  lines.push(
    `**Judikatur-Discovery-Lücke:** RIS ${totalRis} vs. lokal ${totalDisk} → es fehlen ${Math.max(0, totalRis - totalDisk)} Entscheidungen (Discovery-Fetch bewusst manuell — fetch-all-at-judikatur.ts).`
  );

  const report = lines.join("\n");
  writeFileSync(join(LOG_DIR, "report-latest.md"), report + "\n");
  writeFileSync(
    join(LOG_DIR, "report-latest.json"),
    JSON.stringify({ startedAt, totalChunks, pendingEmbeds, totalLinks, sources: reports }, null, 2)
  );
  console.log(report);
}

async function main() {
  if (!existsSync(STATE_FILE)) saveState({ importSignatures: {}, lastPlaceholderCount: {} });
  if (LOOP) {
    console.log(`Corpus-Pipeline Supervisor — Loop alle ${INTERVAL_S}s (Logs: ${LOG_DIR})`);
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
