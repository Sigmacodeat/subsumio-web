import { describe, it, expect } from "vitest";
import {
  rougeN,
  rougeL,
  jaccardSimilarity,
  citationOverlap,
  computeSemanticScore,
  computeSemanticBatch,
  formatSemanticReport,
} from "./semantic-similarity.ts";

describe("rougeN", () => {
  it("returns zeros for empty strings", () => {
    const result = rougeN("", "", 1);
    expect(result.precision).toBe(0);
    expect(result.recall).toBe(0);
    expect(result.f1).toBe(0);
  });

  it("computes ROUGE-1 for identical strings", () => {
    const text = "Der Käufer kann Nacherfüllung verlangen";
    const result = rougeN(text, text, 1);
    expect(result.precision).toBe(1.0);
    expect(result.recall).toBe(1.0);
    expect(result.f1).toBe(1.0);
  });

  it("computes ROUGE-1 for partial overlap", () => {
    const ref = "Der Käufer kann Nacherfüllung verlangen";
    const cand = "Der Käufer kann Schadensersatz verlangen";
    const result = rougeN(ref, cand, 1);
    expect(result.precision).toBeGreaterThan(0.5);
    expect(result.recall).toBeGreaterThan(0.5);
    expect(result.f1).toBeGreaterThan(0.5);
  });

  it("computes ROUGE-2 for identical strings", () => {
    const text = "Die regelmäßige Verjährungsfrist beträgt drei Jahre";
    const result = rougeN(text, text, 2);
    expect(result.f1).toBe(1.0);
  });
});

describe("rougeL", () => {
  it("returns zeros for empty strings", () => {
    const result = rougeL("", "");
    expect(result.f1).toBe(0);
  });

  it("computes LCS for identical strings", () => {
    const text = "§ 823 BGB regelt die Schadensersatzpflicht";
    const result = rougeL(text, text);
    expect(result.f1).toBe(1.0);
  });

  it("computes LCS for partial overlap", () => {
    const ref = "Der Vermieter kann die Miete bis zur ortsüblichen Vergleichsmiete erhöhen";
    const cand = "Der Vermieter kann die Miete erhöhen";
    const result = rougeL(ref, cand);
    expect(result.precision).toBe(1.0);
    expect(result.recall).toBeLessThan(1.0);
    expect(result.f1).toBeGreaterThan(0.5);
  });
});

describe("jaccardSimilarity", () => {
  it("returns 1.0 for identical strings", () => {
    expect(jaccardSimilarity("Kaufvertrag Gewährleistung", "Kaufvertrag Gewährleistung")).toBe(1.0);
  });

  it("returns 0 for completely different strings", () => {
    expect(jaccardSimilarity("Kaufvertrag", "Diebstahl")).toBe(0);
  });

  it("returns 0 for empty strings", () => {
    expect(jaccardSimilarity("", "")).toBe(1.0);
    expect(jaccardSimilarity("test", "")).toBe(0);
  });

  it("computes partial overlap", () => {
    const result = jaccardSimilarity("Kaufvertrag Gewährleistung Mangel", "Kaufvertrag Mangel");
    expect(result).toBeGreaterThan(0.3);
    expect(result).toBeLessThan(0.8);
  });
});

describe("citationOverlap", () => {
  it("finds matching citations", () => {
    const ref = "Gemäß § 823 BGB und § 254 BGB";
    const cand = "Nach § 823 BGB und § 254 BGB";
    const result = citationOverlap(ref, cand);
    expect(result.expected_citations).toBe(2);
    expect(result.found_citations).toBe(2);
    expect(result.recall).toBe(1.0);
    expect(result.f1).toBe(1.0);
  });

  it("detects missing citations", () => {
    const ref = "Gemäß § 823 BGB und § 254 BGB";
    const cand = "Nach § 823 BGB";
    const result = citationOverlap(ref, cand);
    expect(result.found_citations).toBe(1);
    expect(result.missing).toContain("BGB§254");
  });

  it("detects extra citations", () => {
    const ref = "Gemäß § 823 BGB";
    const cand = "Nach § 823 BGB und § 242 BGB";
    const result = citationOverlap(ref, cand);
    expect(result.extra).toContain("BGB§242");
  });
});

describe("computeSemanticScore", () => {
  it("computes all metrics together", () => {
    const ref =
      "Gemäß § 437 BGB kann der Käufer Nacherfüllung verlangen. Die Frist beträgt zwei Jahre nach § 438 BGB.";
    const cand =
      "Nach § 437 BGB hat der Käufer ein Recht auf Nacherfüllung. Die Verjährung erfolgt in zwei Jahren gemäß § 438 BGB.";
    const score = computeSemanticScore(ref, cand);
    expect(score.rouge_1.f1).toBeGreaterThan(0.3);
    expect(score.rouge_l.f1).toBeGreaterThan(0.3);
    expect(score.jaccard).toBeGreaterThan(0.3);
    expect(score.citation_overlap.found_citations).toBe(2);
    expect(score.composite).toBeGreaterThan(0.3);
  });

  it("gives low scores for completely different answers", () => {
    const ref = "§ 823 BGB Schadensersatz";
    const cand = "Das Wetter ist schön heute";
    const score = computeSemanticScore(ref, cand);
    expect(score.composite).toBeLessThan(0.2);
  });
});

describe("computeSemanticBatch", () => {
  it("processes multiple items", () => {
    const results = computeSemanticBatch([
      { question_id: "q1", reference: "test answer one", candidate: "test answer one" },
      { question_id: "q2", reference: "completely different", candidate: "not matching at all" },
    ]);
    expect(results.length).toBe(2);
    expect(results[0].score.rouge_1.f1).toBe(1.0);
    expect(results[1].score.rouge_1.f1).toBeLessThan(0.5);
  });
});

describe("formatSemanticReport", () => {
  it("formats a report for results", () => {
    const results = computeSemanticBatch([
      { question_id: "q1", reference: "test answer", candidate: "test answer" },
    ]);
    const report = formatSemanticReport(results);
    expect(report).toContain("Semantic Similarity Report");
    expect(report).toContain("ROUGE-1 F1");
    expect(report).toContain("Composite");
  });

  it("handles empty results", () => {
    const report = formatSemanticReport([]);
    expect(report).toContain("No results");
  });
});
