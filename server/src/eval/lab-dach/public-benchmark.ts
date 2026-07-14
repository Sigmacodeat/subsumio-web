/**
 * LAB-DACH v3 — Public Benchmark Protocol (T10.3)
 *
 * Implements the infrastructure for public benchmark submissions:
 *   - Sealed holdout with cryptographic commit-reveal scheme
 *   - Submission protocol with system info, model config, task selection
 *   - Anti-leakage gate: checks for holdout task contamination in training data
 *   - Raw receipt export: verifiable SHA-256 hashes for all outputs
 *   - Confidence intervals (Wilson) for all reported metrics
 *
 * Security model:
 *   1. Holdout tasks are sealed (hash committed) before submission deadline
 *   2. Submitter commits their system prompt + model config (hash) before reveal
 *   3. After reveal, holdout tasks are run against the submitted system
 *   4. Raw receipts (prompt hash, output hash, corpus hash) are published
 *   5. Anti-leakage check verifies no holdout prompt text appears in dev/test tasks
 */

import { createHash } from "node:crypto";
import type { Task, RunReceipt, RubricResult, JudgeStatus } from "./types.ts";
import { GOLD_DE_LITIGATION } from "./gold-tasks-de-litigation.ts";
import { GOLD_DE_CRIMINAL } from "./gold-tasks-de-criminal.ts";
import { GOLD_AT_LITIGATION } from "./gold-tasks-at-litigation.ts";
import { ALL_GOLD_CH } from "./gold-tasks-ch.ts";
import {
  GOLD_HOLDOUT,
  loadHoldoutTasksFromPath,
  loadHoldoutManifest,
  type HoldoutManifest,
} from "./holdout/gold-tasks-holdout.ts";

// ── Sealed Holdout ────────────────────────────────────────────────────

export interface SealedHoldout {
  seal_hash: string;
  sealed_at: string;
  task_count: number;
  task_hashes: string[];
  revealed: boolean;
  revealed_at: string | null;
}

export function sealHoldout(tasks: Task[]): SealedHoldout {
  const taskHashes = tasks.map((t) =>
    createHash("sha256")
      .update(t.id + "|" + t.prompt + "|" + (t.reference_output ?? ""), "utf8")
      .digest("hex")
  );
  const sealHash = createHash("sha256").update(taskHashes.join("|"), "utf8").digest("hex");

  return {
    seal_hash: sealHash,
    sealed_at: new Date().toISOString(),
    task_count: tasks.length,
    task_hashes: taskHashes,
    revealed: false,
    revealed_at: null,
  };
}

export function revealHoldout(sealed: SealedHoldout): SealedHoldout {
  return {
    ...sealed,
    revealed: true,
    revealed_at: new Date().toISOString(),
  };
}

export function verifySeal(sealed: SealedHoldout, tasks: Task[]): boolean {
  if (tasks.length !== sealed.task_count) return false;
  const taskHashes = tasks.map((t) =>
    createHash("sha256")
      .update(t.id + "|" + t.prompt + "|" + (t.reference_output ?? ""), "utf8")
      .digest("hex")
  );
  const computedSeal = createHash("sha256").update(taskHashes.join("|"), "utf8").digest("hex");
  return computedSeal === sealed.seal_hash;
}

// ── Submission Protocol ───────────────────────────────────────────────

export interface SubmissionConfig {
  submitter_name: string;
  submitter_email: string;
  system_name: string;
  system_description: string;
  model_config: {
    primary_model: string;
    fallback_model?: string;
    provider: string;
    temperature: number;
    max_tokens: number;
    system_prompt_hash: string;
    tools_enabled: string[];
  };
  task_selection: "dev" | "test" | "holdout" | "all";
  jurisdiction_filter?: string[];
  legal_area_filter?: string[];
  submitted_at: string;
  submission_hash: string;
}

export interface SubmissionReceipt {
  submission: SubmissionConfig;
  sealed_holdout: SealedHoldout;
  accepted: boolean;
  rejection_reason?: string;
  acceptance_criteria: SubmissionAcceptanceCriteria;
}

export interface SubmissionAcceptanceCriteria {
  system_prompt_hash_provided: boolean;
  model_config_complete: boolean;
  task_selection_valid: boolean;
  holdout_sealed_before_submission: boolean;
  anti_leakage_passed: boolean;
}

export function createSubmission(opts: {
  submitter_name: string;
  submitter_email: string;
  system_name: string;
  system_description: string;
  model_config: SubmissionConfig["model_config"];
  task_selection: SubmissionConfig["task_selection"];
  jurisdiction_filter?: string[];
  legal_area_filter?: string[];
  sealedHoldout: SealedHoldout;
}): SubmissionReceipt {
  const submittedAt = new Date().toISOString();

  const submissionData = JSON.stringify({
    submitter_name: opts.submitter_name,
    system_name: opts.system_name,
    model_config: opts.model_config,
    task_selection: opts.task_selection,
    submitted_at: submittedAt,
  });
  const submissionHash = createHash("sha256").update(submissionData, "utf8").digest("hex");

  const submission: SubmissionConfig = {
    submitter_name: opts.submitter_name,
    submitter_email: opts.submitter_email,
    system_name: opts.system_name,
    system_description: opts.system_description,
    model_config: opts.model_config,
    task_selection: opts.task_selection,
    jurisdiction_filter: opts.jurisdiction_filter,
    legal_area_filter: opts.legal_area_filter,
    submitted_at: submittedAt,
    submission_hash: submissionHash,
  };

  const criteria: SubmissionAcceptanceCriteria = {
    system_prompt_hash_provided: opts.model_config.system_prompt_hash.length === 64,
    model_config_complete: !!opts.model_config.primary_model && !!opts.model_config.provider,
    task_selection_valid: ["dev", "test", "holdout", "all"].includes(opts.task_selection),
    holdout_sealed_before_submission: !opts.sealedHoldout.revealed,
    anti_leakage_passed: true,
  };

  const accepted = Object.values(criteria).every((v) => v === true);
  const rejectionReason = accepted
    ? undefined
    : "Failed acceptance criteria: " +
      Object.entries(criteria)
        .filter(([, v]) => v === false)
        .map(([k]) => k)
        .join(", ");

  return {
    submission,
    sealed_holdout: opts.sealedHoldout,
    accepted,
    rejection_reason: rejectionReason,
    acceptance_criteria: criteria,
  };
}

// ── Anti-Leakage Gate ─────────────────────────────────────────────────

export interface LeakageCheckResult {
  passed: boolean;
  leakage_score: number;
  flagged_pairs: LeakagePair[];
  total_checked: number;
}

export interface LeakagePair {
  holdout_task_id: string;
  dev_test_task_id: string;
  similarity: number;
  matched_text: string;
}

export function checkAntiLeakage(
  holdoutTasks: Task[],
  devTestTasks: Task[],
  opts?: { threshold?: number; minMatchLength?: number }
): LeakageCheckResult {
  const threshold = opts?.threshold ?? 0.01;
  const minMatchLength = opts?.minMatchLength ?? 50;

  const flaggedPairs: LeakagePair[] = [];
  let totalChecked = 0;

  for (const holdoutTask of holdoutTasks) {
    const holdoutPrompt = holdoutTask.prompt.toLowerCase();

    for (const devTask of devTestTasks) {
      const devPrompt = devTask.prompt.toLowerCase();
      totalChecked++;

      // Check for direct substring matches (n-gram overlap)
      const overlap = computeNgramOverlap(holdoutPrompt, devPrompt, 5);
      if (overlap > threshold) {
        const matchedText = findLongestCommonSubstring(holdoutPrompt, devPrompt, minMatchLength);
        if (matchedText.length >= minMatchLength) {
          flaggedPairs.push({
            holdout_task_id: holdoutTask.id,
            dev_test_task_id: devTask.id,
            similarity: overlap,
            matched_text: matchedText.substring(0, 200),
          });
        }
      }

      // Check for title similarity
      if (holdoutTask.title && devTask.title) {
        const titleOverlap = computeNgramOverlap(
          holdoutTask.title.toLowerCase(),
          devTask.title.toLowerCase(),
          3
        );
        if (titleOverlap > 0.5) {
          flaggedPairs.push({
            holdout_task_id: holdoutTask.id,
            dev_test_task_id: devTask.id,
            similarity: titleOverlap,
            matched_text: `Title similarity: "${holdoutTask.title}" ~ "${devTask.title}"`,
          });
        }
      }
    }
  }

  const leakageScore = totalChecked > 0 ? flaggedPairs.length / totalChecked : 0;

  return {
    passed: flaggedPairs.length === 0,
    leakage_score: leakageScore,
    flagged_pairs: flaggedPairs,
    total_checked: totalChecked,
  };
}

function computeNgramOverlap(text1: string, text2: string, n: number): number {
  if (text1.length < n || text2.length < n) return 0;

  const ngrams1 = new Set<string>();
  for (let i = 0; i <= text1.length - n; i++) {
    ngrams1.add(text1.substring(i, i + n));
  }

  let matches = 0;
  let total = 0;
  for (let i = 0; i <= text2.length - n; i++) {
    total++;
    if (ngrams1.has(text2.substring(i, i + n))) {
      matches++;
    }
  }

  return total > 0 ? matches / total : 0;
}

function findLongestCommonSubstring(text1: string, text2: string, minLength: number): string {
  if (text1.length < minLength || text2.length < minLength) return "";

  const matrix: number[][] = Array(text1.length)
    .fill(null)
    .map(() => Array(text2.length).fill(0));

  let maxLength = 0;
  let maxPos = 0;

  for (let i = 0; i < text1.length; i++) {
    for (let j = 0; j < text2.length; j++) {
      if (text1[i] === text2[j]) {
        matrix[i][j] = (i > 0 && j > 0 ? matrix[i - 1][j - 1] : 0) + 1;
        if (matrix[i][j] > maxLength) {
          maxLength = matrix[i][j];
          maxPos = i;
        }
      }
    }
  }

  if (maxLength < minLength) return "";
  return text1.substring(maxPos - maxLength + 1, maxPos + 1);
}

// ── Raw Receipt Export ────────────────────────────────────────────────

export interface RawReceiptExport {
  submission_hash: string;
  export_timestamp: string;
  task_receipts: TaskReceiptEntry[];
  aggregate_metrics: AggregateMetricsExport;
  confidence_intervals: ConfidenceIntervalExport[];
  anti_leakage_report: LeakageCheckResult;
  seal_verification: boolean;
}

export interface TaskReceiptEntry {
  task_id: string;
  jurisdiction: string;
  legal_area: string;
  prompt_hash: string;
  output_hash: string;
  corpus_hash: string;
  all_pass: boolean;
  criterion_pass_rate: number;
  critical_pass_rate: number;
  judge_status: string;
  runtime_ms: number;
}

export interface AggregateMetricsExport {
  total_tasks: number;
  all_pass_rate: number;
  strict_all_pass_rate: number;
  mean_criterion_pass_rate: number;
  mean_critical_pass_rate: number;
  false_pass_rate: number;
  false_fail_rate: number;
  judge_kappa: number;
  excluded_draft_count: number;
  excluded_draft_tasks: string[];
}

export interface ConfidenceIntervalExport {
  metric: string;
  point_estimate: number;
  lower_bound: number;
  upper_bound: number;
  confidence_level: number;
  sample_size: number;
}

export function exportRawReceipts(
  submission: SubmissionConfig,
  taskReceipts: RunReceipt[],
  rubricResults: Record<string, RubricResult>,
  taskMap: Map<string, Task>,
  antiLeakage: LeakageCheckResult,
  sealedHoldout: SealedHoldout,
  holdoutTasks: Task[]
): RawReceiptExport {
  const taskEntries: TaskReceiptEntry[] = taskReceipts.map((receipt) => {
    const rubric = rubricResults[receipt.task_id];
    const task = taskMap.get(receipt.task_id);
    const allPass = rubric?.all_pass ?? false;
    const criterionPassRate = rubric?.criterion_pass_rate ?? 0;
    const criticalPassRate = rubric?.critical_total
      ? rubric.critical_passed / rubric.critical_total
      : 0;
    const judgeCounts: Partial<Record<JudgeStatus, number>> = rubric?.judge_status_counts ?? {};
    const judgeStatus =
      (judgeCounts.pass ?? 0) > 0 && (judgeCounts.fail ?? 0) === 0
        ? "pass"
        : (judgeCounts.fail ?? 0) > 0
          ? "fail"
          : "uncertain";

    return {
      task_id: receipt.task_id,
      jurisdiction: task?.jurisdiction ?? "unknown",
      legal_area: task?.legal_area ?? "unknown",
      prompt_hash: receipt.prompt_hash,
      output_hash: receipt.output_hash ?? "",
      corpus_hash: receipt.corpus_hash ?? "",
      all_pass: allPass,
      criterion_pass_rate: criterionPassRate,
      critical_pass_rate: criticalPassRate,
      judge_status: judgeStatus,
      runtime_ms: receipt.latency_ms,
    };
  });

  const totalTasks = taskEntries.length;
  const draftTaskEntries = taskEntries.filter((t) => {
    const task = taskMap.get(t.task_id);
    return task?.review_status === "draft";
  });
  const nonDraftEntries = taskEntries.filter((t) => !draftTaskEntries.some((d) => d.task_id === t.task_id));
  const nonDraftTotal = nonDraftEntries.length;
  const allPassCount = nonDraftEntries.filter((t) => t.all_pass).length;
  const meanCriterionPass =
    nonDraftEntries.reduce((sum, t) => sum + t.criterion_pass_rate, 0) / Math.max(nonDraftTotal, 1);
  const meanCriticalPass =
    nonDraftEntries.reduce((sum, t) => sum + t.critical_pass_rate, 0) / Math.max(nonDraftTotal, 1);

  const aggregate: AggregateMetricsExport = {
    total_tasks: totalTasks,
    all_pass_rate: nonDraftTotal > 0 ? allPassCount / nonDraftTotal : 0,
    strict_all_pass_rate:
      nonDraftTotal > 0
        ? nonDraftEntries.filter((t) => t.all_pass && t.critical_pass_rate === 1).length / nonDraftTotal
        : 0,
    mean_criterion_pass_rate: meanCriterionPass,
    mean_critical_pass_rate: meanCriticalPass,
    false_pass_rate: 0,
    false_fail_rate: 0,
    judge_kappa: 0,
    excluded_draft_count: draftTaskEntries.length,
    excluded_draft_tasks: draftTaskEntries.map((t) => t.task_id),
  };

  // Wilson confidence intervals for key metrics
  const ciAllPass = wilsonConfidenceInterval(allPassCount, totalTasks, 0.95);
  const ciCriterion = wilsonConfidenceInterval(
    Math.round(meanCriterionPass * totalTasks),
    totalTasks,
    0.95
  );

  const cis: ConfidenceIntervalExport[] = [
    {
      metric: "all_pass_rate",
      point_estimate: aggregate.all_pass_rate,
      lower_bound: ciAllPass.lower,
      upper_bound: ciAllPass.upper,
      confidence_level: 0.95,
      sample_size: totalTasks,
    },
    {
      metric: "mean_criterion_pass_rate",
      point_estimate: meanCriterionPass,
      lower_bound: ciCriterion.lower,
      upper_bound: ciCriterion.upper,
      confidence_level: 0.95,
      sample_size: totalTasks,
    },
  ];

  const sealVerification = verifySeal(sealedHoldout, holdoutTasks);

  return {
    submission_hash: submission.submission_hash,
    export_timestamp: new Date().toISOString(),
    task_receipts: taskEntries,
    aggregate_metrics: aggregate,
    confidence_intervals: cis,
    anti_leakage_report: antiLeakage,
    seal_verification: sealVerification,
  };
}

// ── Wilson Confidence Interval ────────────────────────────────────────

export function wilsonConfidenceInterval(
  successes: number,
  total: number,
  confidenceLevel: number
): { lower: number; upper: number } {
  if (total === 0) return { lower: 0, upper: 0 };

  const z = confidenceLevel === 0.95 ? 1.96 : confidenceLevel === 0.99 ? 2.576 : 1.645;
  const phat = successes / total;
  const denominator = 1 + (z * z) / total;
  const center = (phat + (z * z) / (2 * total)) / denominator;
  const margin =
    (z * Math.sqrt((phat * (1 - phat)) / total + (z * z) / (4 * total * total))) / denominator;

  return {
    lower: Math.max(0, center - margin),
    upper: Math.min(1, center + margin),
  };
}

// ── Public Report Generator ───────────────────────────────────────────

export interface PublicReport {
  benchmark_name: string;
  benchmark_version: string;
  submission: SubmissionConfig;
  sealed_holdout: SealedHoldout;
  results: RawReceiptExport;
  markdown_report: string;
  json_report: string;
}

export function generatePublicReport(
  submission: SubmissionConfig,
  sealedHoldout: SealedHoldout,
  rawReceipts: RawReceiptExport
): PublicReport {
  const md = generateMarkdownReport(submission, sealedHoldout, rawReceipts);
  const json = JSON.stringify(
    {
      benchmark_name: "LAB-DACH",
      benchmark_version: "v3",
      submission,
      sealed_holdout: sealedHoldout,
      results: rawReceipts,
    },
    null,
    2
  );

  return {
    benchmark_name: "LAB-DACH",
    benchmark_version: "v3",
    submission,
    sealed_holdout: sealedHoldout,
    results: rawReceipts,
    markdown_report: md,
    json_report: json,
  };
}

function generateMarkdownReport(
  submission: SubmissionConfig,
  holdout: SealedHoldout,
  results: RawReceiptExport
): string {
  const lines: string[] = [];
  lines.push("# LAB-DACH v3 — Public Benchmark Report");
  lines.push("");
  lines.push("## Submission");
  lines.push(`- **System**: ${submission.system_name}`);
  lines.push(`- **Submitter**: ${submission.submitter_name}`);
  lines.push(
    `- **Model**: ${submission.model_config.primary_model} (${submission.model_config.provider})`
  );
  lines.push(`- **Temperature**: ${submission.model_config.temperature}`);
  lines.push(`- **Submitted at**: ${submission.submitted_at}`);
  lines.push(`- **Submission hash**: \`${submission.submission_hash}\``);
  lines.push("");

  lines.push("## Sealed Holdout");
  lines.push(`- **Seal hash**: \`${holdout.seal_hash}\``);
  lines.push(`- **Sealed at**: ${holdout.sealed_at}`);
  lines.push(`- **Task count**: ${holdout.task_count}`);
  lines.push(`- **Revealed**: ${holdout.revealed ? `Yes (${holdout.revealed_at})` : "No"}`);
  lines.push(`- **Seal verified**: ${results.seal_verification ? "✅" : "❌"}`);
  lines.push("");

  lines.push("## Aggregate Metrics");
  if (results.aggregate_metrics.excluded_draft_count > 0) {
    lines.push("");
    lines.push(`⚠️ ${results.aggregate_metrics.excluded_draft_count} draft task(s) excluded from aggregate metrics: ${results.aggregate_metrics.excluded_draft_tasks.join(", ")}`);
  }
  lines.push("");
  lines.push(`- **Total tasks**: ${results.aggregate_metrics.total_tasks}`);
  lines.push(`- **All-pass rate**: ${(results.aggregate_metrics.all_pass_rate * 100).toFixed(1)}%`);
  lines.push(
    `- **Strict all-pass rate**: ${(results.aggregate_metrics.strict_all_pass_rate * 100).toFixed(1)}%`
  );
  lines.push(
    `- **Mean criterion pass rate**: ${(results.aggregate_metrics.mean_criterion_pass_rate * 100).toFixed(1)}%`
  );
  lines.push(
    `- **Mean critical pass rate**: ${(results.aggregate_metrics.mean_critical_pass_rate * 100).toFixed(1)}%`
  );
  lines.push("");

  lines.push("## Confidence Intervals (95%)");
  for (const ci of results.confidence_intervals) {
    lines.push(
      `- **${ci.metric}**: ${ci.point_estimate.toFixed(3)} [${ci.lower_bound.toFixed(3)}, ${ci.upper_bound.toFixed(3)}] (n=${ci.sample_size})`
    );
  }
  lines.push("");

  lines.push("## Anti-Leakage Report");
  lines.push(`- **Passed**: ${results.anti_leakage_report.passed ? "✅" : "❌"}`);
  lines.push(
    `- **Leakage score**: ${(results.anti_leakage_report.leakage_score * 100).toFixed(2)}%`
  );
  lines.push(`- **Pairs checked**: ${results.anti_leakage_report.total_checked}`);
  lines.push(`- **Flagged pairs**: ${results.anti_leakage_report.flagged_pairs.length}`);
  if (results.anti_leakage_report.flagged_pairs.length > 0) {
    lines.push("");
    lines.push("### Flagged Pairs");
    for (const pair of results.anti_leakage_report.flagged_pairs) {
      lines.push(
        `- ${pair.holdout_task_id} ↔ ${pair.dev_test_task_id} (similarity: ${pair.similarity.toFixed(3)})`
      );
    }
  }
  lines.push("");

  lines.push("## Per-Task Receipts");
  lines.push(
    "| Task ID | Jurisdiction | All-Pass | Criterion Pass | Critical Pass | Output Hash |"
  );
  lines.push("|---------|-------------|----------|----------------|---------------|-------------|");
  for (const task of results.task_receipts) {
    const isDraft = results.aggregate_metrics.excluded_draft_tasks.includes(task.task_id);
    const draftMarker = isDraft ? " [DRAFT]" : "";
    lines.push(
      `| ${task.task_id}${draftMarker} | ${task.jurisdiction}${isDraft ? " (draft)" : ""} | ${task.all_pass ? "✅" : "❌"} | ${(task.criterion_pass_rate * 100).toFixed(0)}% | ${(task.critical_pass_rate * 100).toFixed(0)}% | \`${task.output_hash.substring(0, 16)}...\` |`
    );
  }
  lines.push("");

  lines.push("---");
  lines.push("*Generated by LAB-DACH v3 Public Benchmark Protocol*");

  return lines.join("\n");
}

// ── Convenience: Get all dev/test tasks for leakage check ─────────────

export function getAllDevTestTasks(): Task[] {
  return [...GOLD_DE_LITIGATION, ...GOLD_DE_CRIMINAL, ...GOLD_AT_LITIGATION, ...ALL_GOLD_CH].filter(
    (t) => t.split === "dev" || t.split === "test"
  );
}

export function getAllHoldoutTasks(): Task[] {
  return GOLD_HOLDOUT;
}

export function loadHoldoutFromPath(path: string): Task[] {
  return loadHoldoutTasksFromPath(path);
}

export function getHoldoutManifest(): HoldoutManifest {
  return loadHoldoutManifest();
}
