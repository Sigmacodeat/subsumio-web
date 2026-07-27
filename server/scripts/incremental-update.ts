#!/usr/bin/env bun
/**
 * Incremental Update — Re-fetches statutes from official sources,
 * runs novella detection, and reports changed slugs.
 *
 * Phase 8: Incremental Update & Historische Fassungen
 *
 * Usage:
 *   bun run scripts/incremental-update.ts [options]
 *
 * Options:
 *   --jurisdiction J   Only check J (at|de|ch|eu). Default: all
 *   --statute CODE     Only check this statute (e.g. "BGB", "ABGB")
 *   --dry-run          Detect changes but don't re-import
 *   --report PATH      Write amendment report to PATH (JSON)
 *   --since DATE       Only report amendments since DATE (ISO)
 *   --verbose          Print per-statute details
 */

import { readFileSync, writeFileSync } from "fs";
import { Pool } from "pg";

// ─── CLI ─────────────────────────────────────────────────────────────────

interface ParsedArgs {
  jurisdiction?: string;
  statute?: string;
  dryRun: boolean;
  reportPath?: string;
  since?: string;
  verbose: boolean;
}

function parseArgs(argv: string[]): ParsedArgs {
  const out: ParsedArgs = { dryRun: false, verbose: false };
  const args = argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--jurisdiction" && i + 1 < args.length) {
      out.jurisdiction = args[++i];
      continue;
    }
    if (a === "--statute" && i + 1 < args.length) {
      out.statute = args[++i];
      continue;
    }
    if (a === "--dry-run") {
      out.dryRun = true;
      continue;
    }
    if (a === "--report" && i + 1 < args.length) {
      out.reportPath = args[++i];
      continue;
    }
    if (a === "--since" && i + 1 < args.length) {
      out.since = args[++i];
      continue;
    }
    if (a === "--verbose" || a === "-v") {
      out.verbose = true;
      continue;
    }
    if (a === "--help" || a === "-h") {
      console.log(
        `Usage: bun run scripts/incremental-update.ts [options]\n` +
          `  --jurisdiction J   Only check J (at|de|ch|eu)\n` +
          `  --statute CODE     Only check this statute\n` +
          `  --dry-run          Detect but don't re-import\n` +
          `  --report PATH      Write JSON report to PATH\n` +
          `  --since DATE       Report amendments since DATE\n` +
          `  --verbose          Per-statute details\n`
      );
      process.exit(0);
    }
  }
  return out;
}

// ─── Main ────────────────────────────────────────────────────────────────

async function main() {
  const opts = parseArgs(process.argv);

  // Load DB config
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    // Try config file
    const configPath = `${process.env.HOME}/.gbrain/config.json`;
    try {
      const cfg = JSON.parse(readFileSync(configPath, "utf-8"));
      if (cfg.database_url) {
        process.env.DATABASE_URL = cfg.database_url;
      }
    } catch {
      // ignore
    }
  }

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("No DATABASE_URL configured. Set it or configure ~/.gbrain/config.json");
    process.exit(1);
  }

  const pool = new Pool({ connectionString: dbUrl });

  try {
    // Import novella detection
    const { runNovellaCheck, detectNovellaFromSource, buildSlug } =
      await import("../src/core/legal/novella-detection.ts");
    const { SnapshotStore } = await import("../src/core/legal/snapshot-store.ts");
    const { generateAmendmentReport, formatAmendmentReport } =
      await import("../src/core/legal/amendment-report.ts");

    const store = new SnapshotStore(pool);

    // Determine which statutes to check
    const jurisdictions = opts.jurisdiction
      ? [opts.jurisdiction.toUpperCase()]
      : ["AT", "DE", "CH", "EU"];

    interface CheckTask {
      jurisdiction: any;
      statuteCode: string;
      slug: string;
    }

    const tasks: CheckTask[] = [];

    for (const jur of jurisdictions) {
      if (opts.statute) {
        const slug = buildSlug(jur as any, opts.statute);
        tasks.push({ jurisdiction: jur, statuteCode: opts.statute, slug });
      } else {
        // Get all current snapshots for this jurisdiction
        const snapshots = await store.getCurrentSnapshotsByJurisdiction(jur as any);
        for (const snap of snapshots) {
          tasks.push({
            jurisdiction: jur,
            statuteCode: snap.statute_code,
            slug: snap.slug,
          });
        }
      }
    }

    console.log(
      `[incremental-update] Checking ${tasks.length} statutes across ${jurisdictions.length} jurisdiction(s)`
    );
    if (opts.dryRun) console.log("[incremental-update] DRY RUN — no re-import");
    console.log();

    // Run novella detection
    const reports: any[] = [];
    let changed = 0;
    let unchanged = 0;
    let errors = 0;

    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i];
      process.stdout.write(
        `  [${i + 1}/${tasks.length}] ${task.statuteCode} (${task.jurisdiction})... `
      );

      try {
        const report = await detectNovellaFromSource(pool, task.jurisdiction, task.statuteCode);

        if (report.error) {
          errors++;
          console.log(`ERROR: ${report.error}`);
        } else if (report.changed) {
          changed++;
          const amendCount = report.amendments.length;
          console.log(`CHANGED (${amendCount} amendments)`);
          if (opts.verbose) {
            for (const a of report.amendments) {
              console.log(`    § ${a.paragraph}: ${a.change_type}`);
            }
          }
        } else {
          unchanged++;
          console.log("unchanged");
        }

        reports.push(report);
      } catch (err: any) {
        errors++;
        console.log(`FATAL: ${err.message}`);
      }
    }

    console.log();
    console.log(
      `[incremental-update] Done: ${changed} changed, ${unchanged} unchanged, ${errors} errors`
    );

    // Generate amendment report
    if (opts.reportPath || opts.verbose) {
      const report = await generateAmendmentReport(pool, {
        startDate: opts.since ?? new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
        jurisdiction: opts.jurisdiction?.toUpperCase() as any,
      });

      if (opts.verbose) {
        console.log();
        console.log(formatAmendmentReport(report));
      }

      if (opts.reportPath) {
        writeFileSync(opts.reportPath, JSON.stringify(report, null, 2) + "\n");
        console.log(`[incremental-update] Report written to ${opts.reportPath}`);
      }
    }

    // Output changed slugs for downstream re-import
    if (changed > 0 && !opts.dryRun) {
      const changedSlugs = reports.filter((r) => r.changed).map((r) => r.slug);

      console.log();
      console.log("[incremental-update] Changed slugs (for re-import):");
      for (const slug of changedSlugs) {
        console.log(`  ${slug}`);
      }
      console.log();
      console.log("To re-import changed statutes:");
      console.log("  bun run scripts/import-judikatur.ts --all-sources");
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
