#!/usr/bin/env bun
/**
 * auto-rag-ops.ts — Nightly RAG + law-ingestion maintenance.
 *
 * 1. Checks official sources for new statutes / amendments (novella detection).
 * 2. Enqueues changed statutes in `law_ingestion_queue` for downstream import.
 * 3. Optionally triggers the RAG auto-optimizer when the corpus changed.
 *
 * Usage:
 *   bun run scripts/auto-rag-ops.ts [--optimize]
 */

import { readFileSync } from "node:fs";
import { Pool } from "pg";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const RAG_OPTIMIZER_SCRIPT = join(__dirname, "run-rag-optimizer.ts");

interface ParsedArgs {
  optimize: boolean;
  verbose: boolean;
}

function parseArgs(argv: string[]): ParsedArgs {
  const out: ParsedArgs = { optimize: false, verbose: false };
  const args = argv.slice(2);
  for (const a of args) {
    if (a === "--optimize") out.optimize = true;
    if (a === "--verbose" || a === "-v") out.verbose = true;
  }
  return out;
}

function connectPool(): Pool {
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl) return new Pool({ connectionString: databaseUrl });

  try {
    const cfg = JSON.parse(readFileSync(`${process.env.HOME}/.gbrain/config.json`, "utf-8"));
    if (cfg.database_url) return new Pool({ connectionString: cfg.database_url });
  } catch {
    // ignore
  }

  throw new Error("DATABASE_URL not set and ~/.gbrain/config.json missing database_url");
}

async function main() {
  const opts = parseArgs(process.argv);
  const pool = connectPool();

  try {
    const { SnapshotStore } = await import("../src/core/legal/snapshot-store.ts");
    const { runNovellaCheckFromSource } = await import("../src/core/legal/novella-detection.ts");
    const { enqueueNovellaItems } = await import("../src/core/legal/rag-optimizer.ts");

    const store = new SnapshotStore(pool);
    const jurisdictions = ["AT", "DE", "CH", "EU"];
    const tasks: Array<{
      jurisdiction: "AT" | "DE" | "CH" | "EU";
      statuteCode: string;
      slug: string;
    }> = [];

    for (const jur of jurisdictions) {
      const snaps = await store.getCurrentSnapshotsByJurisdiction(jur as any);
      for (const snap of snaps) {
        tasks.push({
          jurisdiction: jur as "AT" | "DE" | "CH" | "EU",
          statuteCode: snap.statute_code,
          slug: snap.slug,
        });
      }
    }

    console.log(
      `[auto-rag-ops] Checking ${tasks.length} statutes across ${jurisdictions.length} jurisdictions`
    );

    let changed = 0;
    let unchanged = 0;
    let errors = 0;
    const queueItems: Array<{
      slug: string;
      jurisdiction: string;
      source_url?: string;
      source_type: "statute";
    }> = [];

    for (let i = 0; i < tasks.length; i++) {
      const t = tasks[i];
      if (opts.verbose)
        process.stdout.write(
          `  [${i + 1}/${tasks.length}] ${t.statuteCode} (${t.jurisdiction})... `
        );

      try {
        const [report] = await runNovellaCheckFromSource(pool, [
          { jurisdiction: t.jurisdiction, statuteCode: t.statuteCode },
        ]);
        if (report.error) {
          errors++;
          if (opts.verbose) console.log(`ERROR: ${report.error}`);
        } else if (report.changed) {
          changed++;
          if (opts.verbose) console.log(`CHANGED (${report.amendments.length} amendments)`);
          queueItems.push({
            slug: report.slug,
            jurisdiction: t.jurisdiction,
            source_url: report.source_url,
            source_type: "statute",
          });
        } else {
          unchanged++;
          if (opts.verbose) console.log("unchanged");
        }
      } catch (err) {
        errors++;
        if (opts.verbose) console.log(`FATAL: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    if (queueItems.length > 0) {
      const inserted = await enqueueNovellaItems(pool, queueItems);
      console.log(`[auto-rag-ops] Enqueued ${inserted} changed statutes for ingestion`);
    }

    console.log(
      `[auto-rag-ops] Done: ${changed} changed, ${unchanged} unchanged, ${errors} errors`
    );

    if (opts.optimize && changed > 0) {
      console.log("[auto-rag-ops] Triggering RAG auto-optimization");
      const child = spawn("bun", [RAG_OPTIMIZER_SCRIPT, "--auto"], {
        detached: true,
        stdio: "ignore",
        env: { ...process.env },
      });
      child.unref();
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("[auto-rag-ops] Fatal:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
