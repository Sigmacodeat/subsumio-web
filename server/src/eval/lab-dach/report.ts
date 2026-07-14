/**
 * LAB-DACH v3 — Report Module
 *
 * Generates human-readable Markdown and JSON reports from a full E2E run.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { E2ERunResult } from "./e2e-harness.ts";
import { generateReport } from "./scoring.ts";

/**
 * Generate a full Markdown report for a LAB-DACH run.
 */
export function generateFullReport(run: E2ERunResult): string {
  const lines: string[] = [];

  lines.push("# LAB-DACH v3 Run Report");
  lines.push("");
  lines.push(`- **Run ID**: ${run.run_id}`);
  lines.push(`- **Mode**: ${run.mode === "live" ? "LIVE ⚠️" : "MOCK (offline)"}`);
  lines.push(`- **Started**: ${run.started_at}`);
  lines.push(`- **Completed**: ${run.completed_at}`);
  lines.push(`- **Tasks**: ${run.tasks.length}`);
  if (run.total_cost_usd !== undefined && run.total_cost_usd > 0) {
    lines.push(`- **Total cost**: $${run.total_cost_usd.toFixed(4)}`);
  }
  if (run.total_tokens) {
    lines.push(`- **Total tokens**: ${run.total_tokens.input.toLocaleString()} in / ${run.total_tokens.output.toLocaleString()} out`);
  }
  if (run.provider_errors && run.provider_errors.length > 0) {
    lines.push(`- **Provider errors**: ${run.provider_errors.length}`);
  }
  lines.push("");

  lines.push(generateReport(run.aggregate_score));
  lines.push("");

  lines.push("--- Per-Task Results ---");
  lines.push("");

  for (let i = 0; i < run.rubric_results.length; i++) {
    const rubric = run.rubric_results[i];
    const task = run.tasks[i];
    const receipt = run.run_receipts[i];

    lines.push(`## ${task.id} — ${task.title}${task.review_status === "draft" ? " [DRAFT]" : ""}`);
    lines.push(`- **Workflow**: ${task.workflow}`);
    lines.push(`- **Jurisdiction**: ${task.jurisdiction}${task.review_status === "draft" ? " (draft — excluded from aggregates)" : ""}`);
    lines.push(`- **All-pass**: ${rubric.all_pass ? "✅" : "❌"}`);
    lines.push(`- **Strict all-pass**: ${rubric.strict_all_pass ? "✅" : "❌"}`);
    lines.push(`- **Critical all-pass**: ${rubric.critical_all_pass ? "✅" : "❌"}`);
    lines.push(`- **Criteria**: ${rubric.criteria_passed}/${rubric.criteria_total} passed`);
    lines.push(`- **Critical**: ${rubric.critical_passed}/${rubric.critical_total} passed`);
    lines.push(`- **Verification state**: ${rubric.verification_state ?? "n/a"}`);
    lines.push(`- **Receipt**: ${receipt.run_id}`);
    lines.push(`- **Prompt hash**: ${receipt.prompt_hash}`);
    lines.push(`- **Output hash**: ${receipt.output_hash ?? "n/a"}`);
    lines.push(`- **Corpus hash**: ${receipt.corpus_hash ?? "n/a"}`);
    lines.push("");

    lines.push("### Criteria");
    for (const c of rubric.criteria) {
      lines.push(
        `- ${c.passed ? "✅" : "❌"} **${c.criterion_id}**${c.critical ? " (critical)" : ""} — ${c.details}`
      );
    }
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Generate a JSON-serializable summary of a run.
 */
export function generateRunJSON(run: E2ERunResult): unknown {
  return {
    run_id: run.run_id,
    mode: run.mode,
    started_at: run.started_at,
    completed_at: run.completed_at,
    tasks: run.tasks.map((t) => t.id),
    total_cost_usd: run.total_cost_usd,
    total_tokens: run.total_tokens,
    provider_errors: run.provider_errors,
    aggregate_score: run.aggregate_score,
    rubric_results: run.rubric_results,
    run_receipts: run.run_receipts,
  };
}

function ensureDir(filePath: string): void {
  mkdirSync(dirname(filePath), { recursive: true });
}

/**
 * Write a Markdown report to disk.
 */
export function writeReport(run: E2ERunResult, filePath: string): void {
  ensureDir(filePath);
  writeFileSync(filePath, generateFullReport(run), "utf-8");
}

/**
 * Write a JSON report to disk.
 */
export function writeJSONReport(run: E2ERunResult, filePath: string): void {
  ensureDir(filePath);
  writeFileSync(filePath, JSON.stringify(generateRunJSON(run), null, 2), "utf-8");
}

/**
 * Write all artifacts for a run: report, JSON report, and receipts.
 */
export function writeAllArtifacts(
  run: E2ERunResult,
  outputDir: string,
  receiptWriter: (receiptPath: string) => void
): void {
  mkdirSync(outputDir, { recursive: true });
  writeReport(run, join(outputDir, "report.md"));
  writeJSONReport(run, join(outputDir, "report.json"));
  receiptWriter(join(outputDir, "receipts"));
}
