/**
 * LAB-DACH v3 — Guardrail Challenge Runner
 *
 * Runs the citation guardrail against every entry in the Challenge Set.
 * Measures: detection rate (true positives), false negatives, per-type breakdown.
 *
 * The guardrail receives the manipulated output + the original reference_output
 * as "context" (simulating retrieved sources). If the guardrail flags the
 * manipulated output, that's a true positive (correctly detected manipulation).
 * If the guardrail passes it, that's a false negative (missed detection).
 *
 * Usage:
 *   bun run server/src/eval/lab-dach/challenge-runner.ts
 *   bun run server/src/eval/lab-dach/challenge-runner.ts --json > /tmp/challenge-results.json
 */

import {
  checkCitationGrounding,
  type GuardrailResult,
  type FlagType,
} from "../../core/citation-guardrail.ts";
import { CHALLENGE_SET } from "./challenge-set.ts";
import type { ChallengeEntry, ManipulationType } from "./types.ts";

// ── Types ─────────────────────────────────────────────────────────────

export interface ChallengeResult {
  entry_id: string;
  source_task_id: string;
  jurisdiction: string;
  manipulation_type: ManipulationType;
  detected: boolean;
  expected_flag: string;
  expected_severity: string;
  actual_flags: string[];
  actual_flag_types: FlagType[];
  actual_max_severity: string | null;
  guardrail_passed: boolean;
  false_negative: boolean;
}

export interface ChallengeReport {
  total: number;
  detected: number;
  false_negatives: number;
  detection_rate: number;
  false_negative_rate: number;
  by_manipulation_type: Record<
    string,
    {
      total: number;
      detected: number;
      false_negatives: number;
      detection_rate: number;
    }
  >;
  by_jurisdiction: Record<
    string,
    {
      total: number;
      detected: number;
      detection_rate: number;
    }
  >;
  by_severity: Record<
    string,
    {
      total: number;
      detected: number;
      detection_rate: number;
    }
  >;
  results: ChallengeResult[];
}

// ── Runner ────────────────────────────────────────────────────────────

/**
 * Run the guardrail against a single challenge entry.
 * The reference_output serves as "context" (simulating retrieved sources).
 * The manipulated_output is the "answer" the guardrail should flag.
 */
function runChallengeEntry(
  entry: ChallengeEntry,
  referenceOutput: string,
  topSlugs: string[]
): ChallengeResult {
  const guardrailResult: GuardrailResult = checkCitationGrounding({
    answer: entry.manipulated_output,
    context: referenceOutput,
    topSlugs,
  });

  const detected = !guardrailResult.passed;
  const actualFlags = guardrailResult.flags.map((f) => `${f.type}: ${f.detail}`);
  const actualFlagTypes = guardrailResult.flags.map((f) => f.type);
  const severityOrder: Record<string, number> = { critical: 3, high: 2, medium: 1, low: 0 };
  const actualMaxSeverity: string | null =
    guardrailResult.flags.length > 0
      ? guardrailResult.flags.reduce(
          (max, f) => (severityOrder[f.severity] > severityOrder[max] ? f.severity : max),
          "low"
        )
      : null;

  return {
    entry_id: entry.id,
    source_task_id: entry.source_task_id,
    jurisdiction: entry.jurisdiction,
    manipulation_type: entry.manipulation_type,
    detected,
    expected_flag: entry.expected_guardrail_flag,
    expected_severity: entry.expected_flag_severity,
    actual_flags: actualFlags,
    actual_flag_types: actualFlagTypes,
    actual_max_severity: actualMaxSeverity,
    guardrail_passed: guardrailResult.passed,
    false_negative: !detected,
  };
}

/**
 * Run the guardrail against all challenge entries and produce a report.
 */
export function runChallengeSet(
  entries: ChallengeEntry[],
  getReferenceOutput: (taskId: string) => string | undefined,
  getTopSlugs: (taskId: string) => string[]
): ChallengeReport {
  const results: ChallengeResult[] = [];

  for (const entry of entries) {
    const refOutput = getReferenceOutput(entry.source_task_id) ?? "";
    const slugs = getTopSlugs(entry.source_task_id);
    results.push(runChallengeEntry(entry, refOutput, slugs));
  }

  return buildReport(results);
}

// ── Report Builder ────────────────────────────────────────────────────

function buildReport(results: ChallengeResult[]): ChallengeReport {
  const total = results.length;
  const detected = results.filter((r) => r.detected).length;
  const falseNegatives = results.filter((r) => r.false_negative).length;

  const byManipulationType: ChallengeReport["by_manipulation_type"] = {};
  const byJurisdiction: ChallengeReport["by_jurisdiction"] = {};
  const bySeverity: ChallengeReport["by_severity"] = {};

  for (const r of results) {
    // By manipulation type
    if (!byManipulationType[r.manipulation_type]) {
      byManipulationType[r.manipulation_type] = {
        total: 0,
        detected: 0,
        false_negatives: 0,
        detection_rate: 0,
      };
    }
    byManipulationType[r.manipulation_type].total++;
    if (r.detected) byManipulationType[r.manipulation_type].detected++;
    if (r.false_negative) byManipulationType[r.manipulation_type].false_negatives++;

    // By jurisdiction
    if (!byJurisdiction[r.jurisdiction]) {
      byJurisdiction[r.jurisdiction] = { total: 0, detected: 0, detection_rate: 0 };
    }
    byJurisdiction[r.jurisdiction].total++;
    if (r.detected) byJurisdiction[r.jurisdiction].detected++;

    // By expected severity
    if (!bySeverity[r.expected_severity]) {
      bySeverity[r.expected_severity] = { total: 0, detected: 0, detection_rate: 0 };
    }
    bySeverity[r.expected_severity].total++;
    if (r.detected) bySeverity[r.expected_severity].detected++;
  }

  // Compute rates
  for (const key of Object.keys(byManipulationType)) {
    const m = byManipulationType[key];
    m.detection_rate = m.total > 0 ? m.detected / m.total : 0;
  }
  for (const key of Object.keys(byJurisdiction)) {
    const j = byJurisdiction[key];
    j.detection_rate = j.total > 0 ? j.detected / j.total : 0;
  }
  for (const key of Object.keys(bySeverity)) {
    const s = bySeverity[key];
    s.detection_rate = s.total > 0 ? s.detected / s.total : 0;
  }

  return {
    total,
    detected,
    false_negatives: falseNegatives,
    detection_rate: total > 0 ? detected / total : 0,
    false_negative_rate: total > 0 ? falseNegatives / total : 0,
    by_manipulation_type: byManipulationType,
    by_jurisdiction: byJurisdiction,
    by_severity: bySeverity,
    results,
  };
}

// ── CLI ───────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const jsonMode = args.includes("--json");
  const verbose = args.includes("--verbose");

  // Build task ID → reference output map from gold tasks
  const { GOLD_DE_LITIGATION } = await import("./gold-tasks-de-litigation.ts");
  const { GOLD_DE_CRIMINAL } = await import("./gold-tasks-de-criminal.ts");
  const { GOLD_AT_LITIGATION } = await import("./gold-tasks-at-litigation.ts");

  const taskMap = new Map<string, string>();
  const slugMap = new Map<string, string[]>();
  for (const t of [...GOLD_DE_LITIGATION, ...GOLD_DE_CRIMINAL, ...GOLD_AT_LITIGATION]) {
    if (t.reference_output) {
      taskMap.set(t.id, t.reference_output);
    }
    if (t.qrels?.relevant) {
      // Convert paragraph-level slugs (law/de/bgb/§-437) to law-level slugs (law/de/bgb)
      // The guardrail strips the prefix and compares the remainder to law abbreviations
      const lawSlugs = new Set<string>();
      for (const r of t.qrels.relevant) {
        const parts = r.slug.split("/");
        if (parts.length >= 3) {
          lawSlugs.add(`${parts[0]}/${parts[1]}/${parts[2]}`);
        }
      }
      slugMap.set(t.id, [...lawSlugs]);
    }
  }

  const report = runChallengeSet(
    CHALLENGE_SET,
    (taskId) => taskMap.get(taskId),
    (taskId) => slugMap.get(taskId) ?? []
  );

  if (jsonMode) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    // Human-readable report
    console.log("═══════════════════════════════════════════════════════════════");
    console.log("  GUARDRAIL CHALLENGE RUNNER — LAB-DACH v3");
    console.log("═══════════════════════════════════════════════════════════════");
    console.log();
    console.log(`  Total entries:     ${report.total}`);
    console.log(`  Detected (TP):     ${report.detected}`);
    console.log(`  False negatives:   ${report.false_negatives}`);
    console.log(`  Detection rate:    ${(report.detection_rate * 100).toFixed(1)}%`);
    console.log(`  FN rate:           ${(report.false_negative_rate * 100).toFixed(1)}%`);
    console.log();
    console.log("── By Manipulation Type ──────────────────────────────────────");
    for (const [type, stats] of Object.entries(report.by_manipulation_type)) {
      const pct = (stats.detection_rate * 100).toFixed(1);
      const fn = stats.false_negatives;
      console.log(`  ${type.padEnd(25)} ${stats.detected}/${stats.total} (${pct}%)  FN=${fn}`);
    }
    console.log();
    console.log("── By Jurisdiction ──────────────────────────────────────────");
    for (const [jur, stats] of Object.entries(report.by_jurisdiction)) {
      const pct = (stats.detection_rate * 100).toFixed(1);
      console.log(`  ${jur.padEnd(25)} ${stats.detected}/${stats.total} (${pct}%)`);
    }
    console.log();
    console.log("── By Expected Severity ─────────────────────────────────────");
    for (const [sev, stats] of Object.entries(report.by_severity)) {
      const pct = (stats.detection_rate * 100).toFixed(1);
      console.log(`  ${sev.padEnd(25)} ${stats.detected}/${stats.total} (${pct}%)`);
    }

    if (verbose) {
      console.log();
      console.log("── False Negatives (Detail) ─────────────────────────────────");
      const fns = report.results.filter((r) => r.false_negative);
      if (fns.length === 0) {
        console.log("  (none)");
      } else {
        for (const fn of fns) {
          console.log(`  ${fn.entry_id} [${fn.manipulation_type}] ${fn.source_task_id}`);
          console.log(`    Expected: ${fn.expected_flag}`);
          console.log(`    Guardrail passed (no flags) — MISSED`);
        }
      }
    }

    console.log();
    console.log("═══════════════════════════════════════════════════════════════");
  }
}

if (import.meta.main) {
  main();
}
