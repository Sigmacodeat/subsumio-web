#!/usr/bin/env bun
/**
 * Daily Operations — Corpus Quality Monitor & Daily Report
 *
 * Phase 9: Qualitätsmonitoring & Daily Operations
 *
 * Runs a full quality check cycle:
 *   1. Generates corpus quality report (stats, telemetry, amendments, snapshots)
 *   2. Appends report to JSONL trend log
 *   3. Compares with previous day's report for trend analysis
 *   4. Optionally runs incremental update check (novella detection)
 *   5. Optionally runs DACH eval benchmark
 *   6. Prints human-readable summary
 *
 * Designed for cron: runs unattended, exits with code 0 (ok) or 1 (warnings/errors).
 *
 * Usage:
 *   bun run scripts/daily-ops.ts [options]
 *
 * Options:
 *   --trend-log PATH    JSONL file for trend tracking (default: ~/.gbrain/quality-trend.jsonl)
 *   --output PATH       Write full JSON report to PATH
 *   --no-incremental    Skip novella detection check
 *   --no-eval           Skip DACH eval benchmark
 *   --eval-only         Only run eval benchmark
 *   --verbose           Print detailed report
 *   --slack-webhook URL Send summary to Slack webhook
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync } from "fs";
import { dirname, join } from "path";
import { homedir } from "os";

// ─── CLI ─────────────────────────────────────────────────────────────────

interface ParsedArgs {
  trendLog?: string;
  outputPath?: string;
  noIncremental: boolean;
  noEval: boolean;
  evalOnly: boolean;
  verbose: boolean;
  slackWebhook?: string;
}

function parseArgs(argv: string[]): ParsedArgs {
  const out: ParsedArgs = { noIncremental: false, noEval: false, evalOnly: false, verbose: false };
  const args = argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--trend-log" && i + 1 < args.length) {
      out.trendLog = args[++i];
      continue;
    }
    if (a === "--output" && i + 1 < args.length) {
      out.outputPath = args[++i];
      continue;
    }
    if (a === "--no-incremental") {
      out.noIncremental = true;
      continue;
    }
    if (a === "--no-eval") {
      out.noEval = true;
      continue;
    }
    if (a === "--eval-only") {
      out.evalOnly = true;
      continue;
    }
    if (a === "--verbose" || a === "-v") {
      out.verbose = true;
      continue;
    }
    if (a === "--slack-webhook" && i + 1 < args.length) {
      out.slackWebhook = args[++i];
      continue;
    }
    if (a === "--help" || a === "-h") {
      console.log(
        `Usage: bun run scripts/daily-ops.ts [options]\n` +
          `  --trend-log PATH    JSONL trend file (default: ~/.gbrain/quality-trend.jsonl)\n` +
          `  --output PATH       Write JSON report to PATH\n` +
          `  --no-incremental    Skip novella detection\n` +
          `  --no-eval           Skip DACH eval benchmark\n` +
          `  --eval-only         Only run eval\n` +
          `  --verbose           Detailed output\n` +
          `  --slack-webhook URL Send to Slack\n`
      );
      process.exit(0);
    }
  }
  return out;
}

// ─── Main ────────────────────────────────────────────────────────────────

async function main() {
  const opts = parseArgs(process.argv);

  // Resolve DB connection
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("No DATABASE_URL configured.");
    process.exit(1);
  }

  const { Pool } = await import("pg");
  const pool = new Pool({ connectionString: dbUrl });

  const trendLogPath = opts.trendLog ?? join(homedir(), ".gbrain", "quality-trend.jsonl");

  try {
    if (opts.evalOnly) {
      await runEvalBenchmark();
      process.exit(0);
    }

    console.log("[daily-ops] Generating corpus quality report...");

    const {
      generateCorpusQualityReport,
      formatQualityReport,
      compareQualityReports,
      formatQualityTrend,
    } = await import("../src/core/legal/corpus-quality-report.ts");

    const report = await generateCorpusQualityReport({ pool });

    // Write to trend log
    if (trendLogPath) {
      const dir = dirname(trendLogPath);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      appendFileSync(trendLogPath, JSON.stringify(report) + "\n");
      console.log(`[daily-ops] Trend entry appended to ${trendLogPath}`);
    }

    // Write full JSON output
    if (opts.outputPath) {
      writeFileSync(opts.outputPath, JSON.stringify(report, null, 2) + "\n");
      console.log(`[daily-ops] Full report written to ${opts.outputPath}`);
    }

    // Compare with previous day
    const previousReport = loadPreviousReport(trendLogPath, report.report_date);
    if (previousReport) {
      const trend = compareQualityReports(report, previousReport);
      if (opts.verbose || trend.changes.length > 0) {
        console.log();
        console.log(formatQualityTrend(trend));
      }
    }

    // Print report
    console.log();
    if (opts.verbose) {
      console.log(formatQualityReport(report));
    } else {
      const statusIcon =
        report.health_status === "healthy"
          ? "✅"
          : report.health_status === "warnings"
            ? "⚠️"
            : "❌";
      console.log(`${statusIcon} Health: ${report.health_score}/100 — ${report.health_status}`);
      console.log(
        `  Pages: ${report.corpus.total_pages.toLocaleString()}, Chunks: ${report.corpus.total_chunks.toLocaleString()}`
      );
      console.log(
        `  Embedding: ${report.corpus.embedding_coverage_pct.toFixed(1)}%, Stale: ${report.corpus.stale_chunks.toLocaleString()}`
      );
      if (report.search) {
        console.log(
          `  Search (7d): ${report.search.total_calls_7d.toLocaleString()} calls, ${(report.search.cache_hit_rate_7d * 100).toFixed(0)}% cache`
        );
      }
      console.log(
        `  Snapshots: ${report.snapshots.current_snapshots} current (${report.snapshots.jurisdictions_covered.join(", ")})`
      );
      console.log(
        `  Amendments (30d): ${report.amendments.total_amendments_30d} in ${report.amendments.statutes_affected} statutes`
      );
      const failedChecks = report.checks.filter((c) => c.status !== "ok");
      if (failedChecks.length > 0) {
        console.log(`  Checks: ${failedChecks.length} non-ok`);
        for (const c of failedChecks) {
          const icon = c.status === "warn" ? "⚠" : "✗";
          console.log(`    ${icon} ${c.name}: ${c.message}`);
        }
      }
    }

    // Incremental update check
    if (!opts.noIncremental) {
      console.log();
      console.log("[daily-ops] Running incremental update check (dry-run)...");
      try {
        const { generateAmendmentReport, formatAmendmentReport } =
          await import("../src/core/legal/amendment-report.ts");
        const amendmentReport = await generateAmendmentReport(pool, {
          startDate: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
        });
        if (amendmentReport.total_amendments > 0) {
          console.log(formatAmendmentReport(amendmentReport));
        } else {
          console.log("[daily-ops] No amendments in last 24h.");
        }
      } catch (err: any) {
        console.log(`[daily-ops] Incremental check skipped: ${err.message}`);
      }
    }

    // Eval benchmark
    if (!opts.noEval) {
      console.log();
      await runEvalBenchmark();
    }

    // Slack notification
    if (opts.slackWebhook) {
      await sendSlackNotification(opts.slackWebhook, report);
    }

    // Exit code based on health
    if (report.health_status === "unhealthy") {
      console.log();
      console.log("[daily-ops] ❌ Corpus health: UNHEALTHY");
      process.exit(1);
    } else if (report.health_status === "warnings") {
      console.log();
      console.log("[daily-ops] ⚠ Corpus health: WARNINGS");
    } else {
      console.log();
      console.log("[daily-ops] ✅ Corpus health: HEALTHY");
    }
  } finally {
    await pool.end();
  }
}

async function runEvalBenchmark() {
  console.log("[daily-ops] Running DACH eval benchmark (quick, no rerank)...");
  try {
    const { execSync } = await import("child_process");
    const scriptPath = join(process.cwd(), "src/eval/dach-legal-retrieval/run.ts");
    if (!existsSync(scriptPath)) {
      console.log("[daily-ops] Eval harness not found, skipping.");
      return;
    }
    const output = execSync(`bun run ${scriptPath} --top-k 8 --output /tmp/dach-daily.jsonl 2>&1`, {
      encoding: "utf-8",
      timeout: 300_000,
      cwd: process.cwd(),
    });
    // Extract last few lines which contain summary
    const lines = output.trim().split("\n");
    const summaryLines = lines.slice(-10);
    for (const line of summaryLines) {
      if (
        line.includes("Hit@") ||
        line.includes("MRR") ||
        line.includes("Overall") ||
        line.includes("PASS") ||
        line.includes("FAIL")
      ) {
        console.log(`  ${line}`);
      }
    }
  } catch (err: any) {
    console.log(`[daily-ops] Eval benchmark skipped: ${err.message}`);
  }
}

function loadPreviousReport(trendLogPath: string, currentDate: string): any | null {
  if (!existsSync(trendLogPath)) return null;
  try {
    const content = readFileSync(trendLogPath, "utf-8");
    const lines = content.trim().split("\n").filter(Boolean);
    if (lines.length === 0) return null;

    // Find the most recent entry that's NOT today
    for (let i = lines.length - 1; i >= 0; i--) {
      const entry = JSON.parse(lines[i]);
      if (entry.report_date && entry.report_date !== currentDate) {
        return entry;
      }
    }
    return null;
  } catch {
    return null;
  }
}

async function sendSlackNotification(webhookUrl: string, report: any) {
  try {
    const statusIcon =
      report.health_status === "healthy" ? "✅" : report.health_status === "warnings" ? "⚠️" : "❌";
    const text = [
      `${statusIcon} *Corpus Daily Report — ${report.report_date}*`,
      `Health: ${report.health_score}/100 (${report.health_status})`,
      `Pages: ${report.corpus.total_pages.toLocaleString()} | Chunks: ${report.corpus.total_chunks.toLocaleString()}`,
      `Embedding: ${report.corpus.embedding_coverage_pct.toFixed(1)}% | Stale: ${report.corpus.stale_chunks.toLocaleString()}`,
      report.search
        ? `Search (7d): ${report.search.total_calls_7d.toLocaleString()} calls, ${(report.search.cache_hit_rate_7d * 100).toFixed(0)}% cache`
        : null,
      `Snapshots: ${report.snapshots.current_snapshots} current`,
      `Amendments (30d): ${report.amendments.total_amendments_30d} in ${report.amendments.statutes_affected} statutes`,
    ]
      .filter(Boolean)
      .join("\n");

    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    console.log("[daily-ops] Slack notification sent.");
  } catch (err: any) {
    console.log(`[daily-ops] Slack notification failed: ${err.message}`);
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
