/**
 * Component Evaluation CI Test
 *
 * Runs the 4-stage component evaluation in mock mode with the CI fixture
 * subset (6 fixtures). Verifies:
 *   1. All 4 stages produce metrics
 *   2. Attribution report correctly identifies failed stages
 *   3. fabricated_count === 0 gate
 *   4. CI runtime < 60s
 *   5. JSON output is valid
 *   6. Report format contains all 4 stage tables
 */

import { describe, test, expect } from "bun:test";
import { runComponentEval, formatReportTable } from "../src/eval/lab-dach/component-eval.ts";
import { CI_FIXTURES } from "../src/eval/lab-dach/component-eval-fixtures.ts";

describe("Component Evaluation (CI, Mock Mode)", () => {
  test("runs all 4 stages for all CI fixtures", async () => {
    const summary = await runComponentEval({
      fixtures: CI_FIXTURES,
    });

    expect(summary.total_fixtures).toBe(6);
    expect(summary.reports.length).toBe(6);

    for (const report of summary.reports) {
      expect(report.stages.query_rewriting).toBeDefined();
      expect(report.stages.retrieval).toBeDefined();
      expect(report.stages.answer).toBeDefined();
      expect(report.stages.citations).toBeDefined();

      expect(typeof report.stages.query_rewriting.concept_f1).toBe("number");
      expect(typeof report.stages.retrieval.modes.balanced.mrr).toBe("number");
      expect(typeof report.stages.answer.judge_score).toBe("number");
      expect(typeof report.stages.citations.verified_ratio).toBe("number");
    }
  });

  test("mock mode produces all-pass for all fixtures", async () => {
    const summary = await runComponentEval({
      fixtures: CI_FIXTURES,
    });

    for (const report of summary.reports) {
      expect(report.all_pass).toBe(true);
      expect(report.attribution.failed_stages.length).toBe(0);
      expect(report.attribution.first_failure).toBeNull();
    }

    expect(summary.all_pass_count).toBe(6);
    expect(summary.all_pass_rate).toBe(1.0);
  });

  test("fabricated citations count is 0 in mock mode", async () => {
    const summary = await runComponentEval({
      fixtures: CI_FIXTURES,
    });

    for (const report of summary.reports) {
      expect(report.stages.citations.fabricated_count).toBe(0);
      expect(report.stages.citations.fabricated_must_be_zero).toBe(true);
    }
  });

  test("retrieval measures all 3 search modes", async () => {
    const summary = await runComponentEval({
      fixtures: CI_FIXTURES,
    });

    for (const report of summary.reports) {
      const modes = report.stages.retrieval.modes;
      expect(modes.conservative).toBeDefined();
      expect(modes.balanced).toBeDefined();
      expect(modes.tokenmax).toBeDefined();

      expect(typeof modes.conservative.recall_4k).toBe("number");
      expect(typeof modes.balanced.recall_12k).toBe("number");
      expect(typeof modes.tokenmax.hit_at_5).toBe("boolean");
    }
  });

  test("truncated token-budget recall is computed", async () => {
    const summary = await runComponentEval({
      fixtures: CI_FIXTURES,
    });

    for (const report of summary.reports) {
      const trunc = report.stages.retrieval.truncated;
      expect(typeof trunc.recall_4k).toBe("number");
      expect(typeof trunc.recall_12k).toBe("number");
      expect(trunc.recall_4k).toBeGreaterThanOrEqual(0);
      expect(trunc.recall_4k).toBeLessThanOrEqual(1);
      expect(trunc.recall_12k).toBeGreaterThanOrEqual(trunc.recall_4k);
    }
  });

  test("attribution correctly identifies failed stages", async () => {
    const summary = await runComponentEval({
      fixtures: [CI_FIXTURES[0]],
      planQueryFn: async () => ({
        intent: "case_analysis",
        sub_queries: [{ query: "irrelevant", source_type: "all" as const }],
        decomposed: false,
      }),
    });

    expect(summary.reports[0].stages.query_rewriting.intent_correct).toBe(false);
    expect(summary.reports[0].stages.query_rewriting.pass).toBe(false);
    expect(summary.reports[0].attribution.failed_stages).toContain("query_rewriting");
    expect(summary.reports[0].attribution.first_failure).toBe("query_rewriting");
    expect(summary.reports[0].all_pass).toBe(false);
  });

  test("stage pass rates are computed correctly", async () => {
    const summary = await runComponentEval({
      fixtures: CI_FIXTURES,
    });

    expect(summary.stage_pass_rates.query_rewriting).toBe(1.0);
    expect(summary.stage_pass_rates.retrieval).toBe(1.0);
    expect(summary.stage_pass_rates.answer).toBe(1.0);
    expect(summary.stage_pass_rates.citations).toBe(1.0);
  });

  test("failure attribution counts are correct", async () => {
    const badPlanFn = async () => ({
      intent: "case_analysis" as const,
      sub_queries: [{ query: "irrelevant", source_type: "all" as const }],
      decomposed: false,
    });

    const summary = await runComponentEval({
      fixtures: CI_FIXTURES,
      planQueryFn: badPlanFn,
    });

    expect(summary.stage_failure_attribution["query_rewriting"]).toBe(6);
    expect(summary.all_pass_count).toBe(0);
  });

  test("report format contains all 4 stage tables", async () => {
    const summary = await runComponentEval({
      fixtures: CI_FIXTURES,
    });

    const report = formatReportTable(summary);

    expect(report).toContain("Stage 1: Query Rewriting");
    expect(report).toContain("Stage 2: Retrieval");
    expect(report).toContain("Stage 3: Answer Generation");
    expect(report).toContain("Stage 4: Citations");
    expect(report).toContain("Attribution Summary");
    expect(report).toContain("Stage Pass Rates");
    expect(report).toContain("Failure Attribution");
  });

  test("JSON serialization is valid", async () => {
    const summary = await runComponentEval({
      fixtures: CI_FIXTURES,
    });

    const json = JSON.stringify(summary);
    const parsed = JSON.parse(json);

    expect(parsed.total_fixtures).toBe(6);
    expect(parsed.reports.length).toBe(6);
    expect(parsed.reports[0].stages.query_rewriting).toBeDefined();
    expect(parsed.reports[0].stages.retrieval.modes.balanced).toBeDefined();
    expect(parsed.reports[0].stages.answer).toBeDefined();
    expect(parsed.reports[0].stages.citations).toBeDefined();
  });

  test("CI runtime is under 60 seconds", async () => {
    const start = performance.now();

    await runComponentEval({
      fixtures: CI_FIXTURES,
    });

    const elapsed = (performance.now() - start) / 1000;
    expect(elapsed).toBeLessThan(60);
  });

  test("query rewriting extracts laws and sections from plan", async () => {
    const summary = await runComponentEval({
      fixtures: CI_FIXTURES,
    });

    const de1 = summary.reports[0];
    expect(de1.fixture_id).toBe("comp-de-001");
    expect(de1.stages.query_rewriting.intent_correct).toBe(true);
    expect(de1.stages.query_rewriting.extracted_laws).toContain("BGB");
    expect(de1.stages.query_rewriting.extracted_sections).toContain("434");
    expect(de1.stages.query_rewriting.concept_recall).toBeGreaterThan(0);
  });

  test("gold citation coverage is 1.0 in mock mode", async () => {
    const summary = await runComponentEval({
      fixtures: CI_FIXTURES,
    });

    for (const report of summary.reports) {
      expect(report.stages.citations.gold_citation_coverage).toBe(1.0);
      expect(report.stages.citations.verified_ratio).toBe(1.0);
    }
  });
});
