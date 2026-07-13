/**
 * LAB-DACH v3 — Challenge Runner Tests
 *
 * Verifies the guardrail challenge runner correctly:
 *   1. Runs against all 100 challenge entries
 *   2. Produces correct aggregate stats
 *   3. Per-type breakdowns are consistent
 *   4. False negatives are properly identified
 */

import { describe, it, expect } from "vitest";
import { runChallengeSet, type ChallengeReport } from "./challenge-runner.ts";
import { CHALLENGE_SET } from "./challenge-set.ts";
import { GOLD_DE_LITIGATION } from "./gold-tasks-de-litigation.ts";
import { GOLD_DE_CRIMINAL } from "./gold-tasks-de-criminal.ts";
import { GOLD_AT_LITIGATION } from "./gold-tasks-at-litigation.ts";

const taskMap = new Map<string, string>();
const slugMap = new Map<string, string[]>();
for (const t of [...GOLD_DE_LITIGATION, ...GOLD_DE_CRIMINAL, ...GOLD_AT_LITIGATION]) {
  if (t.reference_output) {
    taskMap.set(t.id, t.reference_output);
  }
  if (t.qrels?.relevant) {
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

const getRef = (taskId: string) => taskMap.get(taskId);
const getSlugs = (taskId: string) => slugMap.get(taskId) ?? [];

describe("Challenge Runner", () => {
  const report: ChallengeReport = runChallengeSet(CHALLENGE_SET, getRef, getSlugs);

  it("should process all 100 challenge entries", () => {
    expect(report.total).toBe(100);
    expect(report.results.length).toBe(100);
  });

  it("detected + false_negatives should equal total", () => {
    expect(report.detected + report.false_negatives).toBe(report.total);
  });

  it("detection_rate should be between 0 and 1", () => {
    expect(report.detection_rate).toBeGreaterThanOrEqual(0);
    expect(report.detection_rate).toBeLessThanOrEqual(1);
  });

  it("should have breakdowns for all 10 manipulation types", () => {
    expect(Object.keys(report.by_manipulation_type).length).toBe(10);
  });

  it("per-type totals should sum to total", () => {
    const sum = Object.values(report.by_manipulation_type).reduce((s, m) => s + m.total, 0);
    expect(sum).toBe(report.total);
  });

  it("per-type detected should sum to total detected", () => {
    const sum = Object.values(report.by_manipulation_type).reduce((s, m) => s + m.detected, 0);
    expect(sum).toBe(report.detected);
  });

  it("per-type false_negatives should sum to total false_negatives", () => {
    const sum = Object.values(report.by_manipulation_type).reduce(
      (s, m) => s + m.false_negatives,
      0
    );
    expect(sum).toBe(report.false_negatives);
  });

  it("per-jurisdiction totals should sum to total", () => {
    const sum = Object.values(report.by_jurisdiction).reduce((s, j) => s + j.total, 0);
    expect(sum).toBe(report.total);
  });

  it("per-severity totals should sum to total", () => {
    const sum = Object.values(report.by_severity).reduce((s, se) => s + se.total, 0);
    expect(sum).toBe(report.total);
  });

  it("every result should have consistent detected vs false_negative", () => {
    for (const r of report.results) {
      expect(r.detected).toBe(!r.false_negative);
    }
  });

  it("every detected result should have at least one actual flag", () => {
    for (const r of report.results) {
      if (r.detected) {
        expect(r.actual_flags.length).toBeGreaterThanOrEqual(1);
        expect(r.actual_flag_types.length).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it("every false negative should have guardrail_passed=true", () => {
    for (const r of report.results) {
      if (r.false_negative) {
        expect(r.guardrail_passed).toBe(true);
      }
    }
  });

  it("wrong_jurisdiction entries should have a meaningful detection rate (>=30%)", () => {
    const stats = report.by_manipulation_type["wrong_jurisdiction"];
    expect(stats).toBeTruthy();
    expect(stats.detection_rate).toBeGreaterThanOrEqual(0.3);
  });

  it("fabricated_law entries should have a meaningful detection rate (>=40%)", () => {
    const stats = report.by_manipulation_type["fabricated_law"];
    expect(stats).toBeTruthy();
    expect(stats.detection_rate).toBeGreaterThanOrEqual(0.4);
  });

  it("fabricated_paragraph entries should have some detection (>=20%)", () => {
    const stats = report.by_manipulation_type["fabricated_paragraph"];
    expect(stats).toBeTruthy();
    expect(stats.detection_rate).toBeGreaterThanOrEqual(0.2);
  });

  it("language_contamination entries may not be detected by deterministic guardrail (>=0%)", () => {
    const stats = report.by_manipulation_type["language_contamination"];
    expect(stats).toBeTruthy();
    // Deterministic guardrail does not check language — LLM cross-verify is needed
    expect(stats.detection_rate).toBeGreaterThanOrEqual(0);
  });

  it("overall detection rate should be >=30% (deterministic guardrail only)", () => {
    // The deterministic Tier-0 guardrail catches citation-level manipulations but
    // not semantic ones (wrong_conclusion, removed_uncertainty, language_contamination).
    // Cross-verify (Tier-1) is needed for those.
    expect(report.detection_rate).toBeGreaterThanOrEqual(0.3);
  });
});
