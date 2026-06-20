import { describe, it, expect } from "vitest";
import {
  runSuperbrainEval,
  SUPERBRAIN_EVAL_FIXTURES,
  type MatterContextForEval,
} from "@/lib/superbrain-eval";

function makeMockContext(overrides: Partial<MatterContextForEval> = {}): MatterContextForEval {
  return {
    parties: [],
    deadlines: [],
    documents: [],
    coverage: {
      completeness_score: 0,
      sources: [],
    },
    gaps: [],
    engine_reachable: true,
    ...overrides,
  };
}

describe("runSuperbrainEval", () => {
  it("returns summary with correct totals", async () => {
    const fetcher = async (): Promise<MatterContextForEval> => makeMockContext();
    const summary = await runSuperbrainEval(fetcher, SUPERBRAIN_EVAL_FIXTURES);
    expect(summary.total).toBe(SUPERBRAIN_EVAL_FIXTURES.length);
    expect(summary.passed + summary.failed).toBe(summary.total);
    expect(summary.timestamp).toBeTruthy();
  });

  it("passes when all expected gaps are found", async () => {
    const fixture = SUPERBRAIN_EVAL_FIXTURES.find((f) => f.id === "gaps-missing-vollmacht")!;
    const fetcher = async (): Promise<MatterContextForEval> =>
      makeMockContext({
        parties: [{ slug: "c1", name: "Client", role: "client" }],
        gaps: [{ type: "missing_power_of_attorney", severity: "high", title: "Vollmacht fehlt" }],
      });
    const summary = await runSuperbrainEval(fetcher, [fixture]);
    expect(summary.passed).toBe(1);
    expect(summary.results[0].gap_accuracy).toBe(1);
  });

  it("fails when expected gaps are missing", async () => {
    const fixture = SUPERBRAIN_EVAL_FIXTURES.find((f) => f.id === "gaps-overdue-deadline")!;
    const fetcher = async (): Promise<MatterContextForEval> =>
      makeMockContext({
        deadlines: [{ id: "d1", title: "Frist", date: "2025-01-01", urgency: "normal" }],
        gaps: [],
      });
    const summary = await runSuperbrainEval(fetcher, [fixture]);
    expect(summary.failed).toBe(1);
    expect(summary.results[0].gap_accuracy).toBe(0);
  });

  it("detects source leakage in permission tests", async () => {
    const fixture = SUPERBRAIN_EVAL_FIXTURES.find((f) => f.id === "permissions-no-leakage")!;
    const fetcher = async (): Promise<MatterContextForEval> =>
      makeMockContext({
        coverage: {
          completeness_score: 0.5,
          sources: [
            { source_id: "opposing_counsel_notes", source_type: "dms", connected: true },
          ],
        },
      });
    const summary = await runSuperbrainEval(fetcher, [fixture]);
    expect(summary.failed).toBe(1);
    const leakCheck = summary.results[0].checks.find((c) => c.name === "no_source_leakage");
    expect(leakCheck?.passed).toBe(false);
  });

  it("passes permission test when no forbidden sources present", async () => {
    const fixture = SUPERBRAIN_EVAL_FIXTURES.find((f) => f.id === "permissions-no-leakage")!;
    const fetcher = async (): Promise<MatterContextForEval> =>
      makeMockContext({
        coverage: {
          completeness_score: 0.5,
          sources: [
            { source_id: "upload", source_type: "upload", connected: true },
          ],
        },
      });
    const summary = await runSuperbrainEval(fetcher, [fixture]);
    expect(summary.passed).toBe(1);
  });

  it("handles context fetcher returning null", async () => {
    const fetcher = async (): Promise<MatterContextForEval | null> => null;
    const summary = await runSuperbrainEval(fetcher, [SUPERBRAIN_EVAL_FIXTURES[0]]);
    expect(summary.failed).toBe(1);
    expect(summary.results[0].checks[0].name).toBe("context_fetch");
  });

  it("handles context fetcher throwing", async () => {
    const fetcher = async (): Promise<MatterContextForEval> => {
      throw new Error("engine down");
    };
    const summary = await runSuperbrainEval(fetcher, [SUPERBRAIN_EVAL_FIXTURES[0]]);
    expect(summary.failed).toBe(1);
    const errorCheck = summary.results[0].checks.find((c) => c.name === "no_exception");
    expect(errorCheck?.passed).toBe(false);
  });

  it("calculates byCategory breakdown correctly", async () => {
    const fetcher = async (): Promise<MatterContextForEval> => makeMockContext();
    const summary = await runSuperbrainEval(fetcher, SUPERBRAIN_EVAL_FIXTURES);
    expect(summary.byCategory.coverage).toBeDefined();
    expect(summary.byCategory.gaps).toBeDefined();
    expect(summary.byCategory.permissions).toBeDefined();
    expect(summary.byCategory.temporal).toBeDefined();
    expect(summary.byCategory.explainability).toBeDefined();
  });

  it("calculates pass_rate correctly", async () => {
    const fetcher = async (): Promise<MatterContextForEval> => makeMockContext();
    const summary = await runSuperbrainEval(fetcher, SUPERBRAIN_EVAL_FIXTURES);
    expect(summary.pass_rate).toBeGreaterThanOrEqual(0);
    expect(summary.pass_rate).toBeLessThanOrEqual(1);
  });

  it("measures duration_ms for each result", async () => {
    const fetcher = async (): Promise<MatterContextForEval> => makeMockContext();
    const summary = await runSuperbrainEval(fetcher, [SUPERBRAIN_EVAL_FIXTURES[0]]);
    expect(summary.results[0].duration_ms).toBeGreaterThanOrEqual(0);
  });

  it("checks parties_min threshold", async () => {
    const fixture = SUPERBRAIN_EVAL_FIXTURES.find((f) => f.id === "gaps-missing-vollmacht")!;
    const fetcher = async (): Promise<MatterContextForEval> =>
      makeMockContext({
        parties: [{ slug: "c1", name: "Client", role: "client" }],
        gaps: [{ type: "missing_power_of_attorney", severity: "high", title: "test" }],
      });
    const summary = await runSuperbrainEval(fetcher, [fixture]);
    const partiesCheck = summary.results[0].checks.find((c) => c.name === "parties_min");
    expect(partiesCheck?.passed).toBe(true);
    expect(partiesCheck?.actual).toBe("1");
  });

  it("checks coverage_min threshold", async () => {
    const fetcher = async (): Promise<MatterContextForEval> =>
      makeMockContext({
        coverage: { completeness_score: 0.8, sources: [] },
      });
    const summary = await runSuperbrainEval(fetcher, [SUPERBRAIN_EVAL_FIXTURES[0]]);
    const coverageCheck = summary.results[0].checks.find((c) => c.name === "coverage_min");
    expect(coverageCheck?.passed).toBe(true);
  });
});
