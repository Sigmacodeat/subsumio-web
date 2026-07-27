#!/usr/bin/env bun
/**
 * backfill-pipeline-watcher.ts
 *
 * Watches running backfill processes and automatically triggers the next
 * pipeline stages (import → embed → link) as soon as a backfill finishes.
 *
 * Pipeline per source:
 *   1. Backfill (download text) — external process, watched via log file
 *   2. Import   (insert pages + chunks into DB)
 *   3. Embed    (generate embeddings for chunks without them)
 *   4. Link     (build citation graph for judikatur sources)
 *
 * Usage:
 *   bun scripts/backfill-pipeline-watcher.ts [--check-interval 30]
 *
 * Environment:
 *   PGPASSWORD — database password (set in container)
 *   OPENROUTER_API_KEY — for embeddings
 */

import { existsSync, readFileSync, statSync } from "fs";

const args = process.argv.slice(2);
const intervalIdx = args.indexOf("--check-interval");
const CHECK_INTERVAL_S = intervalIdx >= 0 ? parseInt(args[intervalIdx + 1], 10) : 30;

const LOG_DIR = "/tmp";

interface SourcePipeline {
  name: string;
  backfillLog: string;
  backfillDir: string;
  importCmd: string | null;
  embedSourceId: string | null;
  linkCmd: string | null;
  done: boolean;
}

const PIPELINES: SourcePipeline[] = [
  {
    name: "ogh",
    backfillLog: `${LOG_DIR}/backfill-ogh.log`,
    backfillDir: "law-corpus/at-judikatur",
    importCmd: `bun scripts/import-judikatur.ts --source ogh`,
    embedSourceId: "law-at-judikatur",
    linkCmd: null, // import-judikatur already builds links
    done: false,
  },
  {
    name: "vwgh",
    backfillLog: `${LOG_DIR}/backfill-vwgh.log`,
    backfillDir: "law-corpus/at-judikatur-vwgh",
    importCmd: `bun scripts/import-judikatur.ts --source vwgh`,
    embedSourceId: "law-at-judikatur-vwgh",
    linkCmd: null,
    done: false,
  },
  {
    name: "bvwg",
    backfillLog: `${LOG_DIR}/backfill-bvwg.log`,
    backfillDir: "law-corpus/at-judikatur-bvwg",
    importCmd: `bun scripts/import-judikatur.ts --source bvwg`,
    embedSourceId: "law-at-judikatur-bvwg",
    linkCmd: null,
    done: false,
  },
  {
    name: "lvwg",
    backfillLog: `${LOG_DIR}/backfill-lvwg.log`,
    backfillDir: "law-corpus/at-judikatur-lvwg",
    importCmd: `bun scripts/import-judikatur.ts --source lvwg`,
    embedSourceId: "law-at-judikatur-lvwg",
    linkCmd: null,
    done: false,
  },
  {
    name: "asylgh",
    backfillLog: `${LOG_DIR}/backfill-asylgh.log`,
    backfillDir: "law-corpus/at-judikatur-asylgh",
    importCmd: `bun scripts/import-judikatur.ts --source asylgh`,
    embedSourceId: "law-at-judikatur-asylgh",
    linkCmd: null,
    done: false,
  },
  {
    name: "uvs",
    backfillLog: `${LOG_DIR}/backfill-uvs.log`,
    backfillDir: "law-corpus/at-judikatur-uvs",
    importCmd: `bun scripts/import-judikatur.ts --source uvs`,
    embedSourceId: "law-at-judikatur-uvs",
    linkCmd: null,
    done: false,
  },
  {
    name: "eu-reg",
    backfillLog: `${LOG_DIR}/backfill-eu-reg2.log`,
    backfillDir: "law-corpus/eu/regulations",
    importCmd: `bun scripts/import-eu-corpus.ts --type regulation`,
    embedSourceId: "law-eu-regulations",
    linkCmd: null,
    done: false,
  },
  {
    name: "eu-dir",
    backfillLog: `${LOG_DIR}/backfill-eu-dir.log`,
    backfillDir: "law-corpus/eu/directives",
    importCmd: `bun scripts/import-eu-corpus.ts --type directive`,
    embedSourceId: "law-eu-directives",
    linkCmd: null,
    done: true, // already imported
  },
];

function isBackfillDone(logPath: string): boolean {
  if (!existsSync(logPath)) return false;
  const content = readFileSync(logPath, "utf-8");
  return (
    content.includes("DONE:") ||
    content.includes("═══════════════════════════════════════════════════════════\n  DONE:")
  );
}

function isProcessRunning(name: string): boolean {
  try {
    const { stdout } = Bun.spawnSync(["ps", "aux"], { stdout: "pipe" });
    const lines = new TextDecoder().decode(stdout).split("\n");
    return lines.some((l) => l.includes("backfill-corpus-text") && l.includes(name));
  } catch {
    return false;
  }
}

async function runCmd(cmd: string, logFile: string): Promise<boolean> {
  console.log(`  ▶ Running: ${cmd}`);
  const log = Bun.spawn(["bash", "-c", `cd /app && ${cmd} 2>&1 | tee ${logFile}`], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const exitCode = await log.exited;
  console.log(`  ✓ Exit code: ${exitCode}`);
  return exitCode === 0;
}

async function embedPending(sourceId: string): Promise<boolean> {
  console.log(`  ▶ Embedding pending chunks for ${sourceId}`);
  const cmd = `bun scripts/embed-pending-at.ts --source ${sourceId} --batch-size 100`;
  const log = Bun.spawn(
    ["bash", "-c", `cd /app && ${cmd} 2>&1 | tee ${LOG_DIR}/embed-${sourceId}.log`],
    {
      stdout: "pipe",
      stderr: "pipe",
    }
  );
  const exitCode = await log.exited;
  console.log(`  ✓ Embed exit code: ${exitCode}`);
  return exitCode === 0;
}

async function checkAndRunPipeline(p: SourcePipeline): Promise<void> {
  if (p.done) return;

  const backfillFinished = isBackfillDone(p.backfillLog);
  if (!backfillFinished) return;

  // Check if backfill process is still running (grace period)
  if (isProcessRunning(p.name)) {
    console.log(`  ⏳ ${p.name}: backfill log says DONE but process still running, waiting...`);
    return;
  }

  console.log(`\n═══ ${p.name}: Backfill DONE — starting import ═══`);

  // Step 1: Import
  if (p.importCmd) {
    const importLog = `${LOG_DIR}/import-${p.name}-postbackfill.log`;
    const ok = await runCmd(p.importCmd, importLog);
    if (!ok) {
      console.log(`  ✗ Import failed for ${p.name}, will retry next cycle`);
      return;
    }
  }

  // Step 2: Embed
  if (p.embedSourceId) {
    await embedPending(p.embedSourceId);
  }

  // Step 3: Link (if applicable)
  if (p.linkCmd) {
    await runCmd(p.linkCmd, `${LOG_DIR}/link-${p.name}.log`);
  }

  p.done = true;
  console.log(`  ✅ ${p.name}: Pipeline complete (import + embed + link)`);
}

async function main() {
  console.log("═".repeat(65));
  console.log("  Backfill Pipeline Watcher");
  console.log(`  Checking every ${CHECK_INTERVAL_S}s`);
  console.log(`  Watching ${PIPELINES.filter((p) => !p.done).length} pending sources`);
  console.log("═".repeat(65));

  for (;;) {
    const pending = PIPELINES.filter((p) => !p.done);
    if (pending.length === 0) {
      console.log("\n🎉 All pipelines complete!");
      break;
    }

    for (const p of pending) {
      try {
        await checkAndRunPipeline(p);
      } catch (e) {
        console.error(`  ✗ Error in pipeline ${p.name}: ${e}`);
      }
    }

    const stillPending = PIPELINES.filter((p) => !p.done).length;
    const done = PIPELINES.filter((p) => p.done).length;
    console.log(
      `\n  Status: ${done} done, ${stillPending} pending — sleeping ${CHECK_INTERVAL_S}s...`
    );

    await new Promise((r) => setTimeout(r, CHECK_INTERVAL_S * 1000));
  }
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
