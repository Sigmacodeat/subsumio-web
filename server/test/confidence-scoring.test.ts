import { describe, test, expect } from "bun:test";
import {
  decomposeClaims,
  computeDocumentConfidence,
  computeECE,
  buildCalibrationRecord,
  confidenceLabel,
  confidenceToScore,
  type ConfidenceInput,
  type CalibrationSample,
} from "../src/core/confidence-scoring.ts";
import type { GuardrailResult } from "../src/core/citation-guardrail.ts";
import type { CrossVerifyResult } from "../src/core/think/cross-verify.ts";

// ── Fixtures ──────────────────────────────────────────────────────────

const CONTEXT_WITH_BGB = `
## § 433 BGB — Vertragstypische Pflichten
(1) Der Verkäufer ist verpflichtet, dem Käufer die Sache zu übergeben und das Eigentum an ihr zu verschaffen.
(2) Der Käufer ist verpflichtet, dem Verkäufer den vereinbarten Kaufpreis zu zahlen.

## § 434 BGB — Sachmangel
(1) Die Sache ist frei von Sachmängeln, wenn sie bei Gefahrübergang die vereinbarte Beschaffenheit hat.
`;

const GUARDRAIL_PASSED: GuardrailResult = {
  passed: true,
  flags: [],
  all_citations: ["§ 433 BGB"],
  ungrounded_citations: [],
  non_existent_laws: [],
  fabricated_references: [],
  hedging_phrases: [],
  cross_law_contamination: [],
  context_citations: ["§ 433 BGB"],
  retrieved_laws: ["bgb"],
  answer_length: 100,
  context_length: 500,
  check_count: 5,
};

const GUARDRAIL_FAILED: GuardrailResult = {
  passed: false,
  flags: [
    {
      type: "ungrounded_citation",
      detail: 'Citation "§ 999 BGB" not found in retrieved context',
      citation: "§ 999 BGB",
      severity: "high",
    },
  ],
  all_citations: ["§ 433 BGB", "§ 999 BGB"],
  ungrounded_citations: ["§ 999 BGB"],
  non_existent_laws: [],
  fabricated_references: [],
  hedging_phrases: [],
  cross_law_contamination: [],
  context_citations: ["§ 433 BGB"],
  retrieved_laws: ["bgb"],
  answer_length: 100,
  context_length: 500,
  check_count: 5,
};

const CROSS_VERIFY_CLEAN: CrossVerifyResult = {
  clean: true,
  flags: [],
  verified_citations: ["§ 433 BGB"],
  flagged_citations: [],
};

const CROSS_VERIFY_FLAGGED: CrossVerifyResult = {
  clean: false,
  flags: [
    {
      type: "wrong_application",
      detail: "§ 434 BGB wird falsch angewendet",
      citation: "§ 434 BGB",
      severity: "high",
    },
  ],
  verified_citations: ["§ 433 BGB"],
  flagged_citations: ["§ 434 BGB"],
};

// ── decomposeClaims ───────────────────────────────────────────────────

describe("decomposeClaims", () => {
  test("extracts normative sentences as claims", () => {
    const answer = "Der Verkäufer muss die Sache übergeben. § 433 BGB regelt dies. Vielen Dank.";
    const claims = decomposeClaims(answer);
    expect(claims.length).toBeGreaterThanOrEqual(2);
    expect(claims.some((c) => c.includes("muss"))).toBe(true);
    expect(claims.some((c) => c.includes("§ 433"))).toBe(true);
  });

  test("excludes trivially short fragments", () => {
    const answer = "Ja. Nein. OK. Der Verkäufer ist verpflichtet, die Sache zu übergeben.";
    const claims = decomposeClaims(answer);
    expect(claims.every((c) => c.length >= 10)).toBe(true);
  });

  test("deduplicates overlapping sentences", () => {
    const answer = "Der Verkäufer ist verpflichtet, die Sache zu übergeben. Der Verkäufer ist verpflichtet, die Sache zu übergeben.";
    const claims = decomposeClaims(answer);
    expect(claims.length).toBe(1);
  });

  test("returns empty for non-claim text", () => {
    const answer = "Vielen Dank für Ihre Anfrage. Mit freundlichen Grüßen.";
    const claims = decomposeClaims(answer);
    expect(claims.length).toBe(0);
  });

  test("captures sentences with §-citations even without normative verbs", () => {
    const answer = "§ 433 BGB regelt die Vertragspflichten beim Kaufvertrag.";
    const claims = decomposeClaims(answer);
    expect(claims.length).toBeGreaterThanOrEqual(1);
    expect(claims[0]).toContain("§ 433");
  });
});

// ── computeDocumentConfidence ─────────────────────────────────────────

describe("computeDocumentConfidence", () => {
  test("returns low confidence for empty answer", () => {
    const result = computeDocumentConfidence({
      answer: "",
      context: CONTEXT_WITH_BGB,
    });
    expect(result.overall_confidence).toBe(0);
    expect(result.confidence_level).toBe("low");
    expect(result.claim_confidences).toEqual([]);
  });

  test("returns high confidence for well-grounded answer with clean guardrail + cross-verify", () => {
    const answer = "Der Verkäufer ist verpflichtet, dem Käufer die Sache zu übergeben. § 433 BGB regelt die Vertragspflichten.";
    const result = computeDocumentConfidence({
      answer,
      context: CONTEXT_WITH_BGB,
      guardrailResult: GUARDRAIL_PASSED,
      crossVerifyResult: CROSS_VERIFY_CLEAN,
      retrievedSlugs: ["legal/statutes/de/bgb/p-433"],
    });
    expect(result.confidence_level).toBe("high");
    expect(result.overall_confidence).toBeGreaterThanOrEqual(0.8);
    expect(result.claim_confidences.length).toBeGreaterThanOrEqual(1);
    // Find the claim with the citation (second claim)
    const citedClaim = result.claim_confidences.find((c) => c.factors.has_citation);
    expect(citedClaim).toBeDefined();
    expect(citedClaim!.factors.citation_grounded).toBe(true);
    expect(citedClaim!.factors.citation_verified).toBe(true);
    expect(citedClaim!.factors.hedging_detected).toBe(false);
  });

  test("returns lower confidence when guardrail flags are present", () => {
    const answer = "Der Verkäufer muss die Sache übergeben. § 999 BGB regelt dies.";
    const result = computeDocumentConfidence({
      answer,
      context: CONTEXT_WITH_BGB,
      guardrailResult: GUARDRAIL_FAILED,
    });
    // § 999 BGB is not in context → not grounded → lower confidence
    const flagClaim = result.claim_confidences.find((c) => c.claim_text.includes("§ 999"));
    expect(flagClaim).toBeDefined();
    expect(flagClaim!.factors.citation_grounded).toBe(false);
    expect(flagClaim!.confidence).toBeLessThan(0.8);
  });

  test("returns lower confidence when cross-verify flags are present", () => {
    const answer = "Der Verkäufer ist verpflichtet, die Sache zu übergeben. § 434 BGB definiert den Sachmangel.";
    const result = computeDocumentConfidence({
      answer,
      context: CONTEXT_WITH_BGB,
      guardrailResult: GUARDRAIL_PASSED,
      crossVerifyResult: CROSS_VERIFY_FLAGGED,
    });
    const flaggedClaim = result.claim_confidences.find((c) => c.claim_text.includes("§ 434"));
    expect(flaggedClaim).toBeDefined();
    expect(flaggedClaim!.factors.cross_verify_flags).toBeGreaterThan(0);
    // Cross-verify flag → crossVerifyScore=0 → confidence = 0.4*1 + 0.25*1 + 0.15*1 + 0.2*0 = 0.8
    expect(flaggedClaim!.confidence).toBeLessThanOrEqual(0.8);
  });

  test("detects hedging language and reduces confidence", () => {
    const answer = "Der Verkäufer ist verpflichtet, die Sache zu übergeben. Diese Pflicht ist nicht explizit in den Quellen genannt.";
    const result = computeDocumentConfidence({
      answer,
      context: CONTEXT_WITH_BGB,
    });
    const hedgingClaim = result.claim_confidences.find((c) => c.factors.hedging_detected);
    expect(hedgingClaim).toBeDefined();
    expect(hedgingClaim!.confidence).toBeLessThan(0.8);
  });

  test("claims without citations get medium confidence (0.5 base)", () => {
    const answer = "Der Verkäufer ist verpflichtet, die Sache zu übergeben.";
    const result = computeDocumentConfidence({
      answer,
      context: CONTEXT_WITH_BGB,
    });
    const claim = result.claim_confidences[0];
    expect(claim.factors.has_citation).toBe(false);
    // Without citation, groundedScore = 0.5, crossVerify = 0.5
    // C = 0.4*0.5 + 0.25*1 + 0.15*1 + 0.2*0.5 = 0.2 + 0.25 + 0.15 + 0.1 = 0.7
    expect(claim.confidence).toBeCloseTo(0.7, 2);
  });

  test("supporting_passages populated for grounded claims with slug info", () => {
    const answer = "Der Verkäufer ist verpflichtet, dem Käufer die Sache zu übergeben. § 433 BGB regelt dies.";
    const result = computeDocumentConfidence({
      answer,
      context: CONTEXT_WITH_BGB,
      guardrailResult: GUARDRAIL_PASSED,
      retrievedSlugs: ["legal/statutes/de/bgb/p-433", "legal/statutes/de/bgb/p-434"],
    });
    const claimWithCite = result.claim_confidences.find((c) => c.factors.has_citation);
    expect(claimWithCite).toBeDefined();
    expect(claimWithCite!.supporting_passages.length).toBeGreaterThan(0);
    expect(claimWithCite!.supporting_passages.some((s) => s.includes("433"))).toBe(true);
  });

  test("confidence_level thresholds are correct", () => {
    // High: ≥ 0.8
    const highResult = computeDocumentConfidence({
      answer: "Der Verkäufer ist verpflichtet, die Sache zu übergeben. § 433 BGB regelt dies.",
      context: CONTEXT_WITH_BGB,
      guardrailResult: GUARDRAIL_PASSED,
      crossVerifyResult: CROSS_VERIFY_CLEAN,
    });
    expect(highResult.confidence_level).toBe("high");

    // Low: < 0.5 (empty)
    const lowResult = computeDocumentConfidence({
      answer: "",
      context: CONTEXT_WITH_BGB,
    });
    expect(lowResult.confidence_level).toBe("low");
  });

  test("calibration metadata is present", () => {
    const result = computeDocumentConfidence({
      answer: "Test.",
      context: "",
    });
    expect(result.calibration).toBeDefined();
    expect(result.calibration.ece).toBe(0);
    expect(result.calibration.sample_count).toBe(0);
    expect(result.calibration.last_updated).toBeTruthy();
  });
});

// ── computeECE ────────────────────────────────────────────────────────

describe("computeECE", () => {
  test("returns 0 for empty samples", () => {
    expect(computeECE([])).toBe(0);
  });

  test("returns 0 for perfectly calibrated samples", () => {
    const samples: CalibrationSample[] = [
      { predicted_confidence: 1.0, actual_correctness: 1 },
      { predicted_confidence: 1.0, actual_correctness: 1 },
      { predicted_confidence: 0.0, actual_correctness: 0 },
      { predicted_confidence: 0.0, actual_correctness: 0 },
    ];
    expect(computeECE(samples)).toBe(0);
  });

  test("returns high ECE for poorly calibrated samples", () => {
    const samples: CalibrationSample[] = [
      { predicted_confidence: 0.9, actual_correctness: 0 },
      { predicted_confidence: 0.9, actual_correctness: 0 },
      { predicted_confidence: 0.1, actual_correctness: 1 },
      { predicted_confidence: 0.1, actual_correctness: 1 },
    ];
    const ece = computeECE(samples);
    expect(ece).toBeGreaterThan(0.5);
  });

  test("handles single sample", () => {
    const samples: CalibrationSample[] = [
      { predicted_confidence: 0.7, actual_correctness: 1 },
    ];
    const ece = computeECE(samples);
    expect(ece).toBeGreaterThanOrEqual(0);
    expect(ece).toBeLessThanOrEqual(1);
  });

  test("respects custom bin count", () => {
    const samples: CalibrationSample[] = Array.from({ length: 100 }, (_, i) => ({
      predicted_confidence: (i + 1) / 100,
      actual_correctness: i < 50 ? 0 : 1,
    }));
    const ece5 = computeECE(samples, 5);
    const ece10 = computeECE(samples, 10);
    // Different bin counts should produce different (but valid) ECE values
    expect(ece5).toBeGreaterThanOrEqual(0);
    expect(ece10).toBeGreaterThanOrEqual(0);
  });
});

// ── buildCalibrationRecord ────────────────────────────────────────────

describe("buildCalibrationRecord", () => {
  test("builds record with ECE and sample count", () => {
    const samples: CalibrationSample[] = [
      { predicted_confidence: 0.8, actual_correctness: 1 },
      { predicted_confidence: 0.6, actual_correctness: 0 },
    ];
    const record = buildCalibrationRecord(samples);
    expect(record.sample_count).toBe(2);
    expect(record.ece).toBeGreaterThanOrEqual(0);
    expect(record.last_updated).toBeTruthy();
  });
});

// ── confidenceLabel ───────────────────────────────────────────────────

describe("confidenceLabel", () => {
  test("returns correct labels for each level", () => {
    expect(confidenceLabel("high").label).toBe("Hoch");
    expect(confidenceLabel("medium").label).toBe("Mittel");
    expect(confidenceLabel("low").label).toBe("Niedrig");
  });

  test("returns color classes for each level", () => {
    expect(confidenceLabel("high").color).toContain("emerald");
    expect(confidenceLabel("medium").color).toContain("amber");
    expect(confidenceLabel("low").color).toContain("red");
  });
});

// ── confidenceToScore ─────────────────────────────────────────────────

describe("confidenceToScore", () => {
  test("converts 0-1 confidence to 0-100 score", () => {
    const doc = computeDocumentConfidence({
      answer: "Der Verkäufer ist verpflichtet, die Sache zu übergeben. § 433 BGB regelt dies.",
      context: CONTEXT_WITH_BGB,
      guardrailResult: GUARDRAIL_PASSED,
      crossVerifyResult: CROSS_VERIFY_CLEAN,
    });
    const score = confidenceToScore(doc);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
    expect(Number.isInteger(score)).toBe(true);
  });
});

// ── Edge Cases ────────────────────────────────────────────────────────

describe("edge cases", () => {
  test("answer with only non-claim text gets low confidence", () => {
    const result = computeDocumentConfidence({
      answer: "Vielen Dank. Mit freundlichen Grüßen.",
      context: CONTEXT_WITH_BGB,
    });
    expect(result.overall_confidence).toBe(0);
    expect(result.confidence_level).toBe("low");
  });

  test("multiple claims with mixed grounding", () => {
    const answer = "Der Verkäufer muss die Sache übergeben. § 433 BGB regelt dies. § 999 BGB definiert Sonderregeln.";
    const result = computeDocumentConfidence({
      answer,
      context: CONTEXT_WITH_BGB,
    });
    expect(result.claim_confidences.length).toBeGreaterThanOrEqual(2);
    const grounded = result.claim_confidences.find((c) => c.claim_text.includes("§ 433"));
    const ungrounded = result.claim_confidences.find((c) => c.claim_text.includes("§ 999"));
    expect(grounded!.factors.citation_grounded).toBe(true);
    expect(ungrounded!.factors.citation_grounded).toBe(false);
    expect(grounded!.confidence).toBeGreaterThan(ungrounded!.confidence);
  });

  test("no guardrail or cross-verify → neutral confidence", () => {
    const answer = "Der Verkäufer ist verpflichtet, die Sache zu übergeben. § 433 BGB regelt dies.";
    const result = computeDocumentConfidence({
      answer,
      context: CONTEXT_WITH_BGB,
    });
    // Without guardrail/cross-verify, noGuardrailScore=1, crossVerifyScore=0.5
    // C = 0.4*1 + 0.25*1 + 0.15*1 + 0.2*0.5 = 0.4 + 0.25 + 0.15 + 0.1 = 0.9
    expect(result.overall_confidence).toBeGreaterThan(0.8);
  });
});
