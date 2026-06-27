// @vitest-environment node

import { describe, test, expect } from "vitest";
import {
  computeCitationQuality,
  computeClaimQuality,
  computeDeadlineQuality,
  computeContractIssueQuality,
  computeQualityReport,
  qualityGrade,
  type ExpectedDeadline,
  type ExpectedContractIssue,
  type DetectedContractIssue,
} from "./ai-quality";
import type { GroundingMetadata } from "./citation-gate";
import type { GroundedCitation } from "./types";
import type { DetectedDeadline } from "./ai-deadline-detect";

// ── Helpers ─────────────────────────────────────────────────────────────

function makeGrounding(overrides: Partial<GroundingMetadata> = {}): GroundingMetadata {
  return {
    citations_verified: 5,
    citations_unverified: 1,
    corpus_checked: true,
    grounded_citations: [],
    analyzed_at: new Date().toISOString(),
    ...overrides,
  };
}

function makeGroundedCitations(n: number, verified: boolean): GroundedCitation[] {
  return Array.from({ length: n }, (_, i) => ({
    code: "BGB",
    paragraph: `§ ${i + 1}`,
    context: "test context",
    verified,
  }));
}

function makeDetectedDeadlines(n: number): DetectedDeadline[] {
  return Array.from({ length: n }, (_, i) => ({
    type: `deadline-type-${i}`,
    description: `Frist ${i + 1}`,
    date: `2026-0${(i % 9) + 1}-15`,
    confidence: "high" as const,
    sourceSnippet: "test snippet",
    matchedRule: "test-rule",
  }));
}

// ── computeCitationQuality ──────────────────────────────────────────────

describe("computeCitationQuality", () => {
  test("returns zero metrics when grounding is null", () => {
    const result = computeCitationQuality(null);
    expect(result.total_citations).toBe(0);
    expect(result.verified_citations).toBe(0);
    expect(result.unverified_citations).toBe(0);
    expect(result.citation_verification_rate).toBe(0);
    expect(result.false_citation_rate).toBe(0);
    expect(result.corpus_checked).toBe(false);
  });

  test("returns zero metrics when grounding is undefined", () => {
    const result = computeCitationQuality(undefined);
    expect(result.total_citations).toBe(0);
    expect(result.corpus_checked).toBe(false);
  });

  test("returns zero metrics when corpus_checked is false", () => {
    const result = computeCitationQuality(makeGrounding({ corpus_checked: false }));
    expect(result.total_citations).toBe(0);
    expect(result.corpus_checked).toBe(false);
  });

  test("computes rates correctly for mixed citations", () => {
    const result = computeCitationQuality(
      makeGrounding({
        citations_verified: 8,
        citations_unverified: 2,
      })
    );
    expect(result.total_citations).toBe(10);
    expect(result.verified_citations).toBe(8);
    expect(result.unverified_citations).toBe(2);
    expect(result.citation_verification_rate).toBeCloseTo(0.8, 5);
    expect(result.false_citation_rate).toBeCloseTo(0.2, 5);
    expect(result.corpus_checked).toBe(true);
  });

  test("returns perfect rate when all citations verified", () => {
    const result = computeCitationQuality(
      makeGrounding({
        citations_verified: 10,
        citations_unverified: 0,
      })
    );
    expect(result.citation_verification_rate).toBe(1);
    expect(result.false_citation_rate).toBe(0);
  });

  test("returns zero rate when no citations verified", () => {
    const result = computeCitationQuality(
      makeGrounding({
        citations_verified: 0,
        citations_unverified: 5,
      })
    );
    expect(result.citation_verification_rate).toBe(0);
    expect(result.false_citation_rate).toBe(1);
  });

  test("handles zero total citations (verified=0, unverified=0) with perfect rate", () => {
    const result = computeCitationQuality(
      makeGrounding({
        citations_verified: 0,
        citations_unverified: 0,
        corpus_checked: true,
      })
    );
    expect(result.total_citations).toBe(0);
    expect(result.citation_verification_rate).toBe(1);
    expect(result.false_citation_rate).toBe(0);
  });
});

// ── computeClaimQuality ─────────────────────────────────────────────────

describe("computeClaimQuality", () => {
  test("returns zero metrics for empty text", () => {
    const result = computeClaimQuality("", null);
    expect(result.total_claims).toBe(0);
    expect(result.supported_claims).toBe(0);
    expect(result.unsupported_claims).toBe(0);
    expect(result.unsupported_claim_rate).toBe(0);
  });

  test("returns zero metrics for text without claims", () => {
    const result = computeClaimQuality("Hallo Welt. Ein Test.", null);
    expect(result.total_claims).toBe(0);
  });

  test("detects claims with normative language", () => {
    const text = "Der Käufer muss die Ware abnehmen. Der Verkäufer ist zur Lieferung verpflichtet.";
    const result = computeClaimQuality(text, null);
    expect(result.total_claims).toBeGreaterThan(0);
  });

  test("detects claims with 'gilt' keyword", () => {
    const text = "Die Frist gilt ab Zustellung.";
    const result = computeClaimQuality(text, null);
    expect(result.total_claims).toBeGreaterThanOrEqual(1);
  });

  test("detects claims with 'kann' keyword", () => {
    const text = "Der Kläger kann Rücktritt erklären.";
    const result = computeClaimQuality(text, null);
    expect(result.total_claims).toBeGreaterThanOrEqual(1);
  });

  test("claims with § citations count as supported", () => {
    const text = "Der Käufer muss die Ware abnehmen gemäß § 433 BGB.";
    const result = computeClaimQuality(text, []);
    expect(result.total_claims).toBeGreaterThanOrEqual(1);
    expect(result.supported_claims).toBeGreaterThanOrEqual(1);
    expect(result.unsupported_claims).toBeLessThanOrEqual(result.total_claims - 1);
  });

  test("claims without citations are unsupported", () => {
    const text = "Der Käufer muss die Ware abnehmen.";
    const result = computeClaimQuality(text, null);
    expect(result.total_claims).toBeGreaterThanOrEqual(1);
    expect(result.supported_claims).toBe(0);
    expect(result.unsupported_claims).toBe(result.total_claims);
    expect(result.unsupported_claim_rate).toBe(1);
  });

  test("unsupported_claim_rate is between 0 and 1", () => {
    const text =
      "Der Käufer muss abnehmen gem. § 433 BGB. Der Verkäufer muss liefern. Die Frist gilt ab Zustellung.";
    const result = computeClaimQuality(text, null);
    expect(result.unsupported_claim_rate).toBeGreaterThanOrEqual(0);
    expect(result.unsupported_claim_rate).toBeLessThanOrEqual(1);
  });

  test("handles unicode in text", () => {
    const text = "Der Käufer muss die Ware abnehmen gemäß § 433 BGB.";
    const result = computeClaimQuality(text, null);
    expect(result.total_claims).toBeGreaterThanOrEqual(1);
  });
});

// ── computeDeadlineQuality ──────────────────────────────────────────────

describe("computeDeadlineQuality", () => {
  test("perfect match: all detected match expected", () => {
    const detected: DetectedDeadline[] = [
      {
        type: "berufung",
        description: "Berufung",
        date: "2026-07-01",
        confidence: "high",
        sourceSnippet: "test",
        matchedRule: "r1",
      },
    ];
    const expected: ExpectedDeadline[] = [{ type: "berufung", date: "2026-07-01" }];
    const result = computeDeadlineQuality(detected, expected);
    expect(result.correct).toBe(1);
    expect(result.false_positives).toBe(0);
    expect(result.false_negatives).toBe(0);
    expect(result.precision).toBe(1);
    expect(result.recall).toBe(1);
    expect(result.f1).toBe(1);
  });

  test("no match: completely different", () => {
    const detected: DetectedDeadline[] = [
      {
        type: "revision",
        description: "Revision",
        date: "2026-08-01",
        confidence: "high",
        sourceSnippet: "test",
        matchedRule: "r1",
      },
    ];
    const expected: ExpectedDeadline[] = [{ type: "berufung", date: "2026-07-01" }];
    const result = computeDeadlineQuality(detected, expected);
    expect(result.correct).toBe(0);
    expect(result.false_positives).toBe(1);
    expect(result.false_negatives).toBe(1);
    expect(result.precision).toBe(0);
    expect(result.recall).toBe(0);
    expect(result.f1).toBe(0);
  });

  test("partial match: 2 of 3 correct", () => {
    const detected: DetectedDeadline[] = [
      {
        type: "berufung",
        description: "a",
        date: "2026-07-01",
        confidence: "high",
        sourceSnippet: "test",
        matchedRule: "r1",
      },
      {
        type: "revision",
        description: "b",
        date: "2026-08-01",
        confidence: "high",
        sourceSnippet: "test",
        matchedRule: "r2",
      },
    ];
    const expected: ExpectedDeadline[] = [
      { type: "berufung", date: "2026-07-01" },
      { type: "klage", date: "2026-09-01" },
    ];
    const result = computeDeadlineQuality(detected, expected);
    expect(result.correct).toBe(1);
    expect(result.false_positives).toBe(1);
    expect(result.false_negatives).toBe(1);
    expect(result.precision).toBeCloseTo(0.5, 5);
    expect(result.recall).toBeCloseTo(0.5, 5);
    expect(result.f1).toBeCloseTo(0.5, 5);
  });

  test("empty detected and expected: zero metrics", () => {
    const result = computeDeadlineQuality([], []);
    expect(result.total_detected).toBe(0);
    expect(result.correct).toBe(0);
    expect(result.precision).toBe(0);
    expect(result.recall).toBe(0);
    expect(result.f1).toBe(0);
  });

  test("all detected are false positives (no expected)", () => {
    const detected: DetectedDeadline[] = [
      {
        type: "berufung",
        description: "a",
        date: "2026-07-01",
        confidence: "high",
        sourceSnippet: "test",
        matchedRule: "r1",
      },
    ];
    const result = computeDeadlineQuality(detected, []);
    expect(result.correct).toBe(0);
    expect(result.false_positives).toBe(1);
    expect(result.false_negatives).toBe(0);
    expect(result.precision).toBe(0);
    expect(result.recall).toBe(0);
  });

  test("all expected are false negatives (nothing detected)", () => {
    const expected: ExpectedDeadline[] = [{ type: "berufung", date: "2026-07-01" }];
    const result = computeDeadlineQuality([], expected);
    expect(result.correct).toBe(0);
    expect(result.false_positives).toBe(0);
    expect(result.false_negatives).toBe(1);
    expect(result.precision).toBe(0);
    expect(result.recall).toBe(0);
  });

  test("uses daysFromNow when date is not set", () => {
    const detected: DetectedDeadline[] = [
      {
        type: "frist",
        description: "a",
        daysFromNow: 14,
        confidence: "high",
        sourceSnippet: "test",
        matchedRule: "r1",
      },
    ];
    const expected: ExpectedDeadline[] = [{ type: "frist", daysFromNow: 14 }];
    const result = computeDeadlineQuality(detected, expected);
    expect(result.correct).toBe(1);
  });

  test("deduplicates by type:date key", () => {
    const detected: DetectedDeadline[] = [
      {
        type: "berufung",
        description: "a",
        date: "2026-07-01",
        confidence: "high",
        sourceSnippet: "test",
        matchedRule: "r1",
      },
      {
        type: "berufung",
        description: "b",
        date: "2026-07-01",
        confidence: "medium",
        sourceSnippet: "test",
        matchedRule: "r1",
      },
    ];
    const expected: ExpectedDeadline[] = [{ type: "berufung", date: "2026-07-01" }];
    const result = computeDeadlineQuality(detected, expected);
    // Set deduplication: 1 unique detected key, 1 expected key, 1 correct
    expect(result.correct).toBe(1);
    expect(result.total_detected).toBe(2); // array length, not set size
    expect(result.false_positives).toBe(1); // 2 - 1 = 1
  });
});

// ── computeContractIssueQuality ─────────────────────────────────────────

describe("computeContractIssueQuality", () => {
  test("perfect match", () => {
    const detected: DetectedContractIssue[] = [{ clause_type: "liability", risk_level: "high" }];
    const expected: ExpectedContractIssue[] = [{ clause_type: "liability", risk_level: "high" }];
    const result = computeContractIssueQuality(detected, expected);
    expect(result.correct).toBe(1);
    expect(result.precision).toBe(1);
    expect(result.recall).toBe(1);
    expect(result.f1).toBe(1);
  });

  test("no match", () => {
    const detected: DetectedContractIssue[] = [{ clause_type: "payment", risk_level: "medium" }];
    const expected: ExpectedContractIssue[] = [{ clause_type: "liability", risk_level: "high" }];
    const result = computeContractIssueQuality(detected, expected);
    expect(result.correct).toBe(0);
    expect(result.precision).toBe(0);
    expect(result.recall).toBe(0);
    expect(result.f1).toBe(0);
  });

  test("partial match with F1 = 0.5", () => {
    const detected: DetectedContractIssue[] = [
      { clause_type: "a", risk_level: "high" },
      { clause_type: "b", risk_level: "low" },
    ];
    const expected: ExpectedContractIssue[] = [
      { clause_type: "a", risk_level: "high" },
      { clause_type: "c", risk_level: "medium" },
    ];
    const result = computeContractIssueQuality(detected, expected);
    expect(result.correct).toBe(1);
    expect(result.false_positives).toBe(1);
    expect(result.false_negatives).toBe(1);
    expect(result.precision).toBeCloseTo(0.5, 5);
    expect(result.recall).toBeCloseTo(0.5, 5);
    expect(result.f1).toBeCloseTo(0.5, 5);
  });

  test("empty inputs: zero metrics", () => {
    const result = computeContractIssueQuality([], []);
    expect(result.total_detected).toBe(0);
    expect(result.correct).toBe(0);
    expect(result.f1).toBe(0);
  });

  test("risk_level mismatch means no match", () => {
    const detected: DetectedContractIssue[] = [{ clause_type: "liability", risk_level: "low" }];
    const expected: ExpectedContractIssue[] = [{ clause_type: "liability", risk_level: "high" }];
    const result = computeContractIssueQuality(detected, expected);
    expect(result.correct).toBe(0);
  });
});

// ── computeQualityReport ────────────────────────────────────────────────

describe("computeQualityReport", () => {
  test("generates report with all sections", () => {
    const result = computeQualityReport({
      answerText: "Der Käufer muss abnehmen gem. § 433 BGB.",
      grounding: makeGrounding(),
      detectedDeadlines: makeDetectedDeadlines(1),
      expectedDeadlines: [{ type: "deadline-type-0", date: "2026-01-15" }],
      detectedContractIssues: [{ clause_type: "test", risk_level: "high" }],
      expectedContractIssues: [{ clause_type: "test", risk_level: "high" }],
      sourceEndpoint: "/api/legal/analyze",
    });

    expect(result.citation).toBeDefined();
    expect(result.claims).toBeDefined();
    expect(result.deadlines).toBeDefined();
    expect(result.contract_issues).toBeDefined();
    expect(result.overall_score).toBeGreaterThanOrEqual(0);
    expect(result.overall_score).toBeLessThanOrEqual(1);
    expect(result.generated_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(result.source_endpoint).toBe("/api/legal/analyze");
  });

  test("deadlines null when not provided", () => {
    const result = computeQualityReport({
      answerText: "Test.",
      grounding: makeGrounding(),
    });
    expect(result.deadlines).toBeNull();
  });

  test("contract_issues null when not provided", () => {
    const result = computeQualityReport({
      answerText: "Test.",
      grounding: makeGrounding(),
    });
    expect(result.contract_issues).toBeNull();
  });

  test("overall_score is rounded to 3 decimal places", () => {
    const result = computeQualityReport({
      answerText: "Test.",
      grounding: makeGrounding({ citations_verified: 7, citations_unverified: 3 }),
    });
    const decimals = (result.overall_score.toString().split(".")[1] ?? "").length;
    expect(decimals).toBeLessThanOrEqual(3);
  });

  test("perfect quality report scores high", () => {
    const result = computeQualityReport({
      answerText: "Der Käufer muss die Ware abnehmen gemäß § 433 BGB.",
      grounding: makeGrounding({ citations_verified: 10, citations_unverified: 0 }),
      detectedDeadlines: makeDetectedDeadlines(1),
      expectedDeadlines: [{ type: "deadline-type-0", date: "2026-01-15" }],
      detectedContractIssues: [{ clause_type: "test", risk_level: "high" }],
      expectedContractIssues: [{ clause_type: "test", risk_level: "high" }],
    });
    expect(result.overall_score).toBeGreaterThan(0.8);
  });

  test("poor quality report scores low", () => {
    const result = computeQualityReport({
      answerText: "Der Käufer muss abnehmen ohne Grundlage und ohne Zitat.",
      grounding: makeGrounding({ citations_verified: 0, citations_unverified: 10 }),
      detectedDeadlines: [
        {
          type: "wrong",
          description: "wrong",
          date: "2026-12-31",
          confidence: "medium",
          sourceSnippet: "test",
          matchedRule: "r1",
        },
      ],
      expectedDeadlines: [{ type: "right", date: "2026-01-01" }],
      detectedContractIssues: [{ clause_type: "wrong", risk_level: "high" }],
      expectedContractIssues: [{ clause_type: "right", risk_level: "high" }],
    });
    expect(result.overall_score).toBeLessThan(0.5);
  });

  test("missing deadline/contract data doesn't penalize score", () => {
    const result = computeQualityReport({
      answerText: "Test.",
      grounding: makeGrounding({ citations_verified: 10, citations_unverified: 0 }),
    });
    // Full weight for deadlines + contract since they're null
    expect(result.overall_score).toBeGreaterThan(0.8);
  });

  test("uses grounding.grounded_citations for claim support", () => {
    const citations = makeGroundedCitations(3, true);
    const result = computeQualityReport({
      answerText: "Der Käufer muss abnehmen gem. § 1 BGB.",
      grounding: makeGrounding({ grounded_citations: citations }),
    });
    expect(result.claims.total_claims).toBeGreaterThanOrEqual(1);
  });
});

// ── qualityGrade ────────────────────────────────────────────────────────

describe("qualityGrade", () => {
  test("returns 'Exzellent' for score >= 0.85", () => {
    expect(qualityGrade(0.85).label).toBe("Exzellent");
    expect(qualityGrade(0.85).color).toBe("emerald");
  });

  test("returns 'Exzellent' for score = 1.0", () => {
    expect(qualityGrade(1.0).label).toBe("Exzellent");
  });

  test("returns 'Gut' for score >= 0.7", () => {
    expect(qualityGrade(0.7).label).toBe("Gut");
    expect(qualityGrade(0.7).color).toBe("blue");
  });

  test("returns 'Ausreichend' for score >= 0.5", () => {
    expect(qualityGrade(0.5).label).toBe("Ausreichend");
    expect(qualityGrade(0.5).color).toBe("amber");
  });

  test("returns 'Kritisch' for score < 0.5", () => {
    expect(qualityGrade(0.49).label).toBe("Kritisch");
    expect(qualityGrade(0.49).color).toBe("red");
  });

  test("returns 'Kritisch' for score = 0", () => {
    expect(qualityGrade(0).label).toBe("Kritisch");
  });

  test("handles boundary 0.85 exactly", () => {
    expect(qualityGrade(0.85).label).toBe("Exzellent");
  });

  test("handles boundary 0.7 exactly", () => {
    expect(qualityGrade(0.7).label).toBe("Gut");
  });

  test("handles boundary 0.5 exactly", () => {
    expect(qualityGrade(0.5).label).toBe("Ausreichend");
  });
});
