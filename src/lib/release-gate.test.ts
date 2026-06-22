// @vitest-environment node

import { describe, test, expect, vi, afterEach } from "vitest";
import {
  evaluateReleaseGate,
  DEFAULT_THRESHOLDS,
  loadBaseline,
  saveBaseline,
  loadEvalHistory,
  appendEvalHistory,
  type GateThresholds,
} from "./release-gate";
import type { EvalSummary } from "./rag-eval";
import type { AIQualityReport } from "./ai-quality";

// ── Helpers ─────────────────────────────────────────────────────────────

function makeSummary(overrides: Partial<EvalSummary> = {}): EvalSummary {
  return {
    overallPrecision: 0.7,
    overallRecall: 0.6,
    overallMrr: 0.5,
    overallNdcg: 0.55,
    byCategory: {},
    results: [],
    timestamp: new Date().toISOString(),
    fixtureVersion: "2.0.0",
    totalQueries: 25,
    ...overrides,
  };
}

function makeQuality(overrides: Partial<AIQualityReport> = {}): AIQualityReport {
  return {
    citation: {
      total_citations: 100,
      verified_citations: 90,
      unverified_citations: 10,
      citation_verification_rate: 0.9,
      false_citation_rate: 0.1,
      corpus_checked: true,
    },
    claims: {
      total_claims: 20,
      supported_claims: 15,
      unsupported_claims: 5,
      unsupported_claim_rate: 0.25,
    },
    deadlines: {
      total_detected: 10,
      correct: 8,
      false_positives: 2,
      false_negatives: 2,
      precision: 0.8,
      recall: 0.8,
      f1: 0.8,
    },
    contract_issues: {
      total_detected: 5,
      correct: 4,
      false_positives: 1,
      false_negatives: 1,
      precision: 0.8,
      recall: 0.8,
      f1: 0.8,
    },
    overall_score: 0.85,
    generated_at: new Date().toISOString(),
    ...overrides,
  };
}

// ── DEFAULT_THRESHOLDS ──────────────────────────────────────────────────

describe("DEFAULT_THRESHOLDS", () => {
  test("has all required threshold fields", () => {
    expect(DEFAULT_THRESHOLDS.min_citation_verification_rate).toBeDefined();
    expect(DEFAULT_THRESHOLDS.min_precision).toBeDefined();
    expect(DEFAULT_THRESHOLDS.min_recall).toBeDefined();
    expect(DEFAULT_THRESHOLDS.min_mrr).toBeDefined();
    expect(DEFAULT_THRESHOLDS.max_false_citation_rate).toBeDefined();
    expect(DEFAULT_THRESHOLDS.max_unsupported_claim_rate).toBeDefined();
    expect(DEFAULT_THRESHOLDS.min_deadline_f1).toBeDefined();
    expect(DEFAULT_THRESHOLDS.min_contract_issue_f1).toBeDefined();
    expect(DEFAULT_THRESHOLDS.max_precision_regression).toBeDefined();
    expect(DEFAULT_THRESHOLDS.max_recall_regression).toBeDefined();
    expect(DEFAULT_THRESHOLDS.max_mrr_regression).toBeDefined();
  });

  test("thresholds are reasonable for Legal-AI", () => {
    expect(DEFAULT_THRESHOLDS.min_citation_verification_rate).toBeGreaterThanOrEqual(0.5);
    expect(DEFAULT_THRESHOLDS.max_false_citation_rate).toBeLessThanOrEqual(0.3);
    expect(DEFAULT_THRESHOLDS.min_precision).toBeGreaterThanOrEqual(0.4);
    expect(DEFAULT_THRESHOLDS.min_recall).toBeGreaterThanOrEqual(0.4);
  });
});

// ── evaluateReleaseGate — Absolute Thresholds ───────────────────────────

describe("evaluateReleaseGate — absolute thresholds", () => {
  test("passes when all metrics meet thresholds", () => {
    const result = evaluateReleaseGate(makeSummary(), makeQuality(), null);
    expect(result.status).toBe("pass");
    expect(result.checks.every((c) => c.status === "pass")).toBe(true);
  });

  test("fails when citation verification rate is below threshold", () => {
    const quality = makeQuality({
      citation: { ...makeQuality().citation, citation_verification_rate: 0.5 },
    });
    const result = evaluateReleaseGate(makeSummary(), quality, null);
    expect(result.status).toBe("fail");
    expect(
      result.checks.some((c) => c.name === "citation_verification_rate" && c.status === "fail")
    ).toBe(true);
  });

  test("fails when false citation rate exceeds threshold", () => {
    const quality = makeQuality({
      citation: { ...makeQuality().citation, false_citation_rate: 0.3 },
    });
    const result = evaluateReleaseGate(makeSummary(), quality, null);
    expect(result.status).toBe("fail");
    expect(result.checks.some((c) => c.name === "false_citation_rate" && c.status === "fail")).toBe(
      true
    );
  });

  test("warns when unsupported claim rate exceeds threshold", () => {
    const quality = makeQuality({
      claims: { ...makeQuality().claims, unsupported_claim_rate: 0.5 },
    });
    const result = evaluateReleaseGate(makeSummary(), quality, null);
    expect(
      result.checks.some((c) => c.name === "unsupported_claim_rate" && c.status === "warn")
    ).toBe(true);
  });

  test("fails when precision is below threshold", () => {
    const result = evaluateReleaseGate(makeSummary({ overallPrecision: 0.3 }), makeQuality(), null);
    expect(result.status).toBe("fail");
    expect(result.checks.some((c) => c.name === "precision_absolute" && c.status === "fail")).toBe(
      true
    );
  });

  test("fails when recall is below threshold", () => {
    const result = evaluateReleaseGate(makeSummary({ overallRecall: 0.3 }), makeQuality(), null);
    expect(result.status).toBe("fail");
    expect(result.checks.some((c) => c.name === "recall_absolute" && c.status === "fail")).toBe(
      true
    );
  });

  test("warns when MRR is below threshold", () => {
    const result = evaluateReleaseGate(makeSummary({ overallMrr: 0.1 }), makeQuality(), null);
    expect(result.checks.some((c) => c.name === "mrr_absolute" && c.status === "warn")).toBe(true);
  });

  test("fails when deadline F1 is below threshold", () => {
    const quality = makeQuality({
      deadlines: { ...makeQuality().deadlines!, f1: 0.5 },
    });
    const result = evaluateReleaseGate(makeSummary(), quality, null);
    expect(result.status).toBe("fail");
    expect(result.checks.some((c) => c.name === "deadline_f1" && c.status === "fail")).toBe(true);
  });

  test("warns when contract issue F1 is below threshold", () => {
    const quality = makeQuality({
      contract_issues: { ...makeQuality().contract_issues!, f1: 0.4 },
    });
    const result = evaluateReleaseGate(makeSummary(), quality, null);
    expect(result.checks.some((c) => c.name === "contract_issue_f1" && c.status === "warn")).toBe(
      true
    );
  });

  test("skips deadline check when quality.deadlines is null", () => {
    const quality = makeQuality({ deadlines: null });
    const result = evaluateReleaseGate(makeSummary(), quality, null);
    expect(result.checks.some((c) => c.name === "deadline_f1")).toBe(false);
  });

  test("skips contract issue check when quality.contract_issues is null", () => {
    const quality = makeQuality({ contract_issues: null });
    const result = evaluateReleaseGate(makeSummary(), quality, null);
    expect(result.checks.some((c) => c.name === "contract_issue_f1")).toBe(false);
  });

  test("uses quality=null: citation/claims checks are skipped, only precision/recall/mrr", () => {
    const result = evaluateReleaseGate(makeSummary(), null, null);
    // Citation/claims checks are conditional on quality?.citation && corpus_checked
    expect(result.checks.some((c) => c.name === "citation_verification_rate")).toBe(false);
    expect(result.checks.some((c) => c.name === "false_citation_rate")).toBe(false);
    expect(result.checks.some((c) => c.name === "unsupported_claim_rate")).toBe(false);
    // Only precision/recall/mrr checks
    expect(result.checks.some((c) => c.name === "precision_absolute")).toBe(true);
    expect(result.checks.some((c) => c.name === "recall_absolute")).toBe(true);
    expect(result.checks.some((c) => c.name === "mrr_absolute")).toBe(true);
    expect(result.status).toBe("pass");
  });

  test("skips citation checks when corpus_checked is false", () => {
    const quality = makeQuality({
      citation: { ...makeQuality().citation, corpus_checked: false },
    });
    const result = evaluateReleaseGate(makeSummary(), quality, null);
    expect(result.checks.some((c) => c.name === "citation_verification_rate")).toBe(false);
    expect(result.checks.some((c) => c.name === "false_citation_rate")).toBe(false);
  });
});

// ── evaluateReleaseGate — Regression Checks ─────────────────────────────

describe("evaluateReleaseGate — regression checks", () => {
  test("passes when no baseline is provided", () => {
    const result = evaluateReleaseGate(makeSummary(), makeQuality(), null);
    expect(result.checks.some((c) => c.name === "precision_regression")).toBe(false);
    expect(result.status).toBe("pass");
  });

  test("passes when current matches baseline", () => {
    const baseline = makeSummary();
    const result = evaluateReleaseGate(makeSummary(), makeQuality(), baseline);
    expect(
      result.checks.some((c) => c.name === "precision_regression" && c.status === "pass")
    ).toBe(true);
    expect(result.status).toBe("pass");
  });

  test("fails when precision drops more than allowed regression", () => {
    const baseline = makeSummary({ overallPrecision: 0.8 });
    const current = makeSummary({ overallPrecision: 0.6 });
    const result = evaluateReleaseGate(current, makeQuality(), baseline);
    expect(
      result.checks.some((c) => c.name === "precision_regression" && c.status === "fail")
    ).toBe(true);
    expect(result.status).toBe("fail");
  });

  test("passes when precision drops within allowed regression", () => {
    const baseline = makeSummary({ overallPrecision: 0.7 });
    const current = makeSummary({ overallPrecision: 0.67 });
    const result = evaluateReleaseGate(current, makeQuality(), baseline);
    expect(
      result.checks.some((c) => c.name === "precision_regression" && c.status === "pass")
    ).toBe(true);
  });

  test("fails when recall drops more than allowed regression", () => {
    const baseline = makeSummary({ overallRecall: 0.7 });
    const current = makeSummary({ overallRecall: 0.5 });
    const result = evaluateReleaseGate(current, makeQuality(), baseline);
    expect(result.checks.some((c) => c.name === "recall_regression" && c.status === "fail")).toBe(
      true
    );
  });

  test("warns when MRR drops more than allowed regression", () => {
    const baseline = makeSummary({ overallMrr: 0.6 });
    const current = makeSummary({ overallMrr: 0.4 });
    const result = evaluateReleaseGate(current, makeQuality(), baseline);
    expect(result.checks.some((c) => c.name === "mrr_regression" && c.status === "warn")).toBe(
      true
    );
  });

  test("passes when current is better than baseline", () => {
    const baseline = makeSummary({ overallPrecision: 0.5, overallRecall: 0.4, overallMrr: 0.3 });
    const current = makeSummary({ overallPrecision: 0.7, overallRecall: 0.6, overallMrr: 0.5 });
    const result = evaluateReleaseGate(current, makeQuality(), baseline);
    expect(
      result.checks.some((c) => c.name === "precision_regression" && c.status === "pass")
    ).toBe(true);
    expect(result.status).toBe("pass");
  });
});

// ── evaluateReleaseGate — Overall Status ────────────────────────────────

describe("evaluateReleaseGate — overall status", () => {
  test("status is 'pass' when all checks pass", () => {
    const result = evaluateReleaseGate(makeSummary(), makeQuality(), null);
    expect(result.status).toBe("pass");
  });

  test("status is 'fail' when any check fails", () => {
    const result = evaluateReleaseGate(makeSummary({ overallPrecision: 0.1 }), makeQuality(), null);
    expect(result.status).toBe("fail");
  });

  test("status is 'warn' when checks warn but none fail", () => {
    const quality = makeQuality({
      citation: {
        ...makeQuality().citation,
        citation_verification_rate: 0.9,
        false_citation_rate: 0.1,
      },
      claims: { ...makeQuality().claims, unsupported_claim_rate: 0.5 },
      deadlines: null,
      contract_issues: null,
    });
    const result = evaluateReleaseGate(makeSummary(), quality, null);
    // unsupported_claim_rate warns, MRR might warn if below threshold
    expect(result.status).toBe("warn");
  });

  test("fail takes precedence over warn", () => {
    const quality = makeQuality({
      citation: {
        ...makeQuality().citation,
        citation_verification_rate: 0.5,
        false_citation_rate: 0.1,
      },
      claims: { ...makeQuality().claims, unsupported_claim_rate: 0.5 },
      deadlines: null,
      contract_issues: null,
    });
    const result = evaluateReleaseGate(makeSummary(), quality, null);
    expect(result.status).toBe("fail");
  });

  test("summary message for pass", () => {
    const result = evaluateReleaseGate(makeSummary(), makeQuality(), null);
    expect(result.summary).toContain("bestanden");
  });

  test("summary message for fail includes failed check names", () => {
    const result = evaluateReleaseGate(makeSummary({ overallPrecision: 0.1 }), null, null);
    expect(result.summary).toContain("fehlgeschlagen");
  });

  test("summary message for warn includes warning check names", () => {
    const quality = makeQuality({
      claims: { ...makeQuality().claims, unsupported_claim_rate: 0.5 },
      deadlines: null,
      contract_issues: null,
    });
    const result = evaluateReleaseGate(makeSummary(), quality, null);
    expect(result.summary).toContain("Warnung");
  });
});

// ── evaluateReleaseGate — Result Structure ──────────────────────────────

describe("evaluateReleaseGate — result structure", () => {
  test("returns checks array with name, status, current, message for each check", () => {
    const result = evaluateReleaseGate(makeSummary(), makeQuality(), null);
    for (const check of result.checks) {
      expect(check.name).toBeTruthy();
      expect(["pass", "fail", "warn"]).toContain(check.status);
      expect(typeof check.current).toBe("number");
      expect(check.message).toBeTruthy();
    }
  });

  test("includes eval_timestamp from current summary", () => {
    const ts = "2026-06-20T10:00:00Z";
    const result = evaluateReleaseGate(makeSummary({ timestamp: ts }), makeQuality(), null);
    expect(result.eval_timestamp).toBe(ts);
  });

  test("includes baseline_timestamp when baseline is provided", () => {
    const ts = "2026-06-19T10:00:00Z";
    const baseline = makeSummary({ timestamp: ts });
    const result = evaluateReleaseGate(makeSummary(), makeQuality(), baseline);
    expect(result.baseline_timestamp).toBe(ts);
  });

  test("baseline_timestamp is undefined when no baseline", () => {
    const result = evaluateReleaseGate(makeSummary(), makeQuality(), null);
    expect(result.baseline_timestamp).toBeUndefined();
  });

  test("includes thresholds in result", () => {
    const result = evaluateReleaseGate(makeSummary(), makeQuality(), null);
    expect(result.thresholds).toBe(DEFAULT_THRESHOLDS);
  });

  test("uses custom thresholds when provided", () => {
    const custom: GateThresholds = {
      ...DEFAULT_THRESHOLDS,
      min_precision: 0.01,
    };
    const result = evaluateReleaseGate(
      makeSummary({ overallPrecision: 0.05 }),
      makeQuality(),
      null,
      custom
    );
    expect(result.thresholds).toBe(custom);
    // Should pass because 0.05 >= 0.01
    expect(result.checks.some((c) => c.name === "precision_absolute" && c.status === "pass")).toBe(
      true
    );
  });
});

// ── evaluateReleaseGate — Custom Thresholds ─────────────────────────────

describe("evaluateReleaseGate — custom thresholds", () => {
  test("stricter thresholds can cause failures", () => {
    const strict: GateThresholds = {
      ...DEFAULT_THRESHOLDS,
      min_citation_verification_rate: 0.95,
    };
    const result = evaluateReleaseGate(makeSummary(), makeQuality(), null, strict);
    expect(result.status).toBe("fail");
    expect(
      result.checks.some((c) => c.name === "citation_verification_rate" && c.status === "fail")
    ).toBe(true);
  });

  test("lenient thresholds can turn failures into passes", () => {
    const lenient: GateThresholds = {
      ...DEFAULT_THRESHOLDS,
      min_precision: 0.01,
      min_recall: 0.01,
      min_citation_verification_rate: 0.01,
    };
    const result = evaluateReleaseGate(
      makeSummary({ overallPrecision: 0.05, overallRecall: 0.05 }),
      makeQuality({ citation: { ...makeQuality().citation, citation_verification_rate: 0.05 } }),
      null,
      lenient
    );
    expect(result.checks.some((c) => c.name === "precision_absolute" && c.status === "pass")).toBe(
      true
    );
  });
});

// ── Baseline Persistence (mocked fetch) ─────────────────────────────────

describe("loadBaseline", () => {
  afterEach(() => vi.restoreAllMocks());

  test("returns null when fetch fails", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("Network error"));
    const result = await loadBaseline("http://engine.test", {});
    expect(result).toBeNull();
  });

  test("returns null when response is not ok", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("Not found", { status: 404 }));
    const result = await loadBaseline("http://engine.test", {});
    expect(result).toBeNull();
  });

  test("returns baseline from frontmatter when response is ok", async () => {
    const baseline = makeSummary();
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ frontmatter: { baseline } }), { status: 200 })
    );
    const result = await loadBaseline("http://engine.test", {});
    expect(result).toEqual(baseline);
  });

  test("returns null when frontmatter has no baseline", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ frontmatter: {} }), { status: 200 })
    );
    const result = await loadBaseline("http://engine.test", {});
    expect(result).toBeNull();
  });
});

describe("saveBaseline", () => {
  afterEach(() => vi.restoreAllMocks());

  test("does not throw on success", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("ok", { status: 200 }));
    await expect(saveBaseline("http://engine.test", {}, makeSummary())).resolves.not.toThrow();
  });

  test("does not throw on fetch error (non-fatal)", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("Network error"));
    await expect(saveBaseline("http://engine.test", {}, makeSummary())).resolves.not.toThrow();
  });
});

// ── Eval History Persistence (mocked fetch) ─────────────────────────────

describe("loadEvalHistory", () => {
  afterEach(() => vi.restoreAllMocks());

  test("returns empty array when fetch fails", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("Network error"));
    const result = await loadEvalHistory("http://engine.test", {});
    expect(result).toEqual([]);
  });

  test("returns empty array when response is not ok", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("Not found", { status: 404 }));
    const result = await loadEvalHistory("http://engine.test", {});
    expect(result).toEqual([]);
  });

  test("returns history array from frontmatter", async () => {
    const history = [makeSummary(), makeSummary({ overallPrecision: 0.8 })];
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ frontmatter: { history } }), { status: 200 })
    );
    const result = await loadEvalHistory("http://engine.test", {});
    expect(result).toEqual(history);
    expect(result).toHaveLength(2);
  });

  test("returns empty array when history is not an array", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ frontmatter: { history: "not an array" } }), { status: 200 })
    );
    const result = await loadEvalHistory("http://engine.test", {});
    expect(result).toEqual([]);
  });

  test("returns empty array when frontmatter has no history", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ frontmatter: {} }), { status: 200 })
    );
    const result = await loadEvalHistory("http://engine.test", {});
    expect(result).toEqual([]);
  });
});

describe("appendEvalHistory", () => {
  afterEach(() => vi.restoreAllMocks());

  test("prepends new summary to existing history", async () => {
    const existing = [makeSummary({ timestamp: "2026-06-19T10:00:00Z" })];
    const newSummary = makeSummary({ timestamp: "2026-06-20T10:00:00Z" });

    const fetchSpy = vi.spyOn(globalThis, "fetch");
    // First call: loadEvalHistory
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ frontmatter: { history: existing } }), { status: 200 })
    );
    // Second call: save
    fetchSpy.mockResolvedValueOnce(new Response("ok", { status: 200 }));

    await appendEvalHistory("http://engine.test", {}, newSummary);

    // Check the save call body
    const saveCall = fetchSpy.mock.calls[1];
    const saveBody = JSON.parse((saveCall[1] as RequestInit).body as string);
    expect(saveBody.frontmatter.history[0]).toEqual(newSummary);
    expect(saveBody.frontmatter.history[1]).toEqual(existing[0]);
  });

  test("caps history at 50 entries", async () => {
    const existing = Array.from({ length: 50 }, (_, i) =>
      makeSummary({ timestamp: `2026-06-${String(i + 1).padStart(2, "0")}T10:00:00Z` })
    );
    const newSummary = makeSummary({ timestamp: "2026-07-01T10:00:00Z" });

    const fetchSpy = vi.spyOn(globalThis, "fetch");
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ frontmatter: { history: existing } }), { status: 200 })
    );
    fetchSpy.mockResolvedValueOnce(new Response("ok", { status: 200 }));

    await appendEvalHistory("http://engine.test", {}, newSummary);

    const saveCall = fetchSpy.mock.calls[1];
    const saveBody = JSON.parse((saveCall[1] as RequestInit).body as string);
    expect(saveBody.frontmatter.history).toHaveLength(50);
    expect(saveBody.frontmatter.history[0]).toEqual(newSummary);
  });

  test("does not throw on fetch error (non-fatal)", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("Network error"));
    await expect(appendEvalHistory("http://engine.test", {}, makeSummary())).resolves.not.toThrow();
  });
});

// ── Boundary value tests (exactly at threshold) ─────────────────────────

describe("evaluateReleaseGate — boundary values at exact threshold", () => {
  test("precision exactly at min_precision threshold passes", () => {
    const result = evaluateReleaseGate(
      makeSummary({ overallPrecision: DEFAULT_THRESHOLDS.min_precision }),
      null,
      null
    );
    const check = result.checks.find((c) => c.name === "precision_absolute");
    expect(check?.status).toBe("pass");
  });

  test("recall exactly at min_recall threshold passes", () => {
    const result = evaluateReleaseGate(
      makeSummary({ overallRecall: DEFAULT_THRESHOLDS.min_recall }),
      null,
      null
    );
    const check = result.checks.find((c) => c.name === "recall_absolute");
    expect(check?.status).toBe("pass");
  });

  test("MRR exactly at min_mrr threshold passes", () => {
    const result = evaluateReleaseGate(
      makeSummary({ overallMrr: DEFAULT_THRESHOLDS.min_mrr }),
      null,
      null
    );
    const check = result.checks.find((c) => c.name === "mrr_absolute");
    expect(check?.status).toBe("pass");
  });

  test("citation verification rate exactly at threshold passes", () => {
    const quality = makeQuality({
      citation: {
        total_citations: 10,
        verified_citations: 7,
        unverified_citations: 3,
        citation_verification_rate: DEFAULT_THRESHOLDS.min_citation_verification_rate,
        false_citation_rate: 0.1,
        corpus_checked: true,
      },
    });
    const result = evaluateReleaseGate(makeSummary(), quality, null);
    const check = result.checks.find((c) => c.name === "citation_verification_rate");
    expect(check?.status).toBe("pass");
  });

  test("false citation rate exactly at threshold passes", () => {
    const quality = makeQuality({
      citation: {
        total_citations: 10,
        verified_citations: 8,
        unverified_citations: 2,
        citation_verification_rate: 0.8,
        false_citation_rate: DEFAULT_THRESHOLDS.max_false_citation_rate,
        corpus_checked: true,
      },
    });
    const result = evaluateReleaseGate(makeSummary(), quality, null);
    const check = result.checks.find((c) => c.name === "false_citation_rate");
    expect(check?.status).toBe("pass");
  });

  test("unsupported claim rate exactly at threshold passes", () => {
    const quality = makeQuality({
      claims: {
        total_claims: 10,
        supported_claims: 6,
        unsupported_claims: 4,
        unsupported_claim_rate: DEFAULT_THRESHOLDS.max_unsupported_claim_rate,
      },
    });
    const result = evaluateReleaseGate(makeSummary(), quality, null);
    const check = result.checks.find((c) => c.name === "unsupported_claim_rate");
    expect(check?.status).toBe("pass");
  });

  test("deadline F1 exactly at threshold passes", () => {
    const quality = makeQuality({
      deadlines: {
        total_detected: 10,
        correct: 8,
        false_positives: 2,
        false_negatives: 2,
        precision: 0.8,
        recall: 0.8,
        f1: DEFAULT_THRESHOLDS.min_deadline_f1,
      },
    });
    const result = evaluateReleaseGate(makeSummary(), quality, null);
    const check = result.checks.find((c) => c.name === "deadline_f1");
    expect(check?.status).toBe("pass");
  });

  test("precision regression exactly at allowed limit passes", () => {
    // Use exact arithmetic: baseline=0.85, drop=0.05, current=0.80
    const baseline = makeSummary({ overallPrecision: 0.85 });
    const current = makeSummary({ overallPrecision: 0.8 });
    const result = evaluateReleaseGate(current, makeQuality(), baseline);
    const check = result.checks.find((c) => c.name === "precision_regression");
    expect(check?.status).toBe("pass");
  });

  test("recall regression exactly at allowed limit passes", () => {
    // Use exact arithmetic: baseline=0.85, drop=0.05, current=0.80
    const baseline = makeSummary({ overallRecall: 0.85 });
    const current = makeSummary({ overallRecall: 0.8 });
    const result = evaluateReleaseGate(current, makeQuality(), baseline);
    const check = result.checks.find((c) => c.name === "recall_regression");
    expect(check?.status).toBe("pass");
  });
});
