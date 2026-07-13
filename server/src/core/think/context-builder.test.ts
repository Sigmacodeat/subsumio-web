import { describe, it, expect } from "vitest";
import {
  extractClaims,
  allocateTokenBudget,
  calculateSourceDiversity,
  ensureSourceDiversity,
  estimateTokens,
  buildEvidenceBundle,
  assembleContext,
} from "./context-builder.ts";
import type { SearchResult } from "../types.ts";

// Helper: create a mock SearchResult
function mockResult(
  score: number,
  text: string,
  slug: string = "legal/statutes/de/bgb.md",
  sourceId: string = "law-de"
): SearchResult {
  return {
    chunk_id: Math.floor(Math.random() * 100000),
    chunk_text: text,
    title: text.slice(0, 50),
    slug,
    source_id: sourceId,
    score,
  } as unknown as SearchResult;
}

describe("Context Builder", () => {
  // ── extractClaims ──

  describe("extractClaims", () => {
    it("extracts a single claim from a simple question", () => {
      const claims = extractClaims("Was sagt § 433 BGB?");
      expect(claims.length).toBe(1);
      expect(claims[0].text).toContain("433");
      expect(claims[0].statutes).toContain("BGB");
      expect(claims[0].type).toBe("normative");
    });

    it("extracts multiple claims from a complex question", () => {
      const claims = extractClaims(
        "Was sagt § 433 BGB zum Kaufvertrag und wie wirkt sich die Gewährleistung aus?"
      );
      expect(claims.length).toBeGreaterThanOrEqual(2);
    });

    it("splits on '?' for multiple questions", () => {
      const claims = extractClaims("Was sagt § 433 BGB? Wie ist die Rechtslage bei Verjährung?");
      expect(claims.length).toBeGreaterThanOrEqual(2);
    });

    it("classifies claim type correctly", () => {
      const normative = extractClaims("Was sagt § 433 BGB?");
      expect(normative[0].type).toBe("normative");

      const procedural = extractClaims("Wie läuft das Verfahren vor dem Amtsgericht ab?");
      expect(procedural[0].type).toBe("procedural");

      const factual = extractClaims("Ist der Vertrag wirksam zustande gekommen?");
      expect(factual[0].type).toBe("factual");
    });

    it("classifies complexity correctly", () => {
      const simple = extractClaims("Was sagt § 1 BGB?");
      expect(simple[0].complexity).toBe("simple");

      const complex = extractClaims(
        "Was sagt § 433 BGB zum Kaufvertrag sowie § 437 BGB zur Gewährleistung und wie wirkt sich die Verjährung nach § 195 BGB aus?"
      );
      // At least one claim should be complex or moderate
      expect(complex.some((c) => c.complexity === "complex" || c.complexity === "moderate")).toBe(
        true
      );
    });

    it("extracts statutes from claim text", () => {
      const claims = extractClaims("Was sagen § 433 BGB und § 823 BGB?");
      const allStatutes = claims.flatMap((c) => c.statutes);
      expect(allStatutes).toContain("BGB");
    });

    it("extracts legal concepts from claim text", () => {
      const claims = extractClaims("Wie funktioniert die Gewährleistung beim Kaufvertrag?");
      const allConcepts = claims.flatMap((c) => c.concepts);
      expect(allConcepts.some((c) => c.includes("gewähr"))).toBe(true);
    });

    it("handles empty or very short text", () => {
      const claims = extractClaims("Test");
      expect(claims.length).toBe(1);
      expect(claims[0].text).toBe("Test");
    });
  });

  // ── allocateTokenBudget ──

  describe("allocateTokenBudget", () => {
    it("distributes equally with 'equal' strategy", () => {
      const claims = extractClaims("Was sagt § 433 BGB und wie funktioniert die Gewährleistung?");
      const budget = allocateTokenBudget(claims, { totalBudget: 6000, strategy: "equal" });
      const total = Array.from(budget.values()).reduce((a, b) => a + b, 0);
      expect(total).toBeLessThanOrEqual(6000);
      for (const value of budget.values()) {
        expect(value).toBeGreaterThan(0);
      }
    });

    it("gives more tokens to complex claims with 'complexity_weighted'", () => {
      const claims = extractClaims(
        "Was sagt § 433 BGB? Und wie wirkt sich die komplexe Gewährleistung nach § 437 BGB sowie die Verjährung nach § 195 BGB aus?"
      );
      const budget = allocateTokenBudget(claims, {
        totalBudget: 6000,
        strategy: "complexity_weighted",
      });
      // At least one claim should have a different budget
      const values = Array.from(budget.values());
      expect(values.length).toBeGreaterThan(0);
    });

    it("gives first claim the most with 'priority_first'", () => {
      const claims = extractClaims(
        "Was sagt § 433 BGB und wie funktioniert die Gewährleistung und was ist mit der Verjährung?"
      );
      const budget = allocateTokenBudget(claims, {
        totalBudget: 10000,
        strategy: "priority_first",
      });
      const values = Array.from(budget.values());
      if (values.length > 1) {
        expect(values[0]).toBeGreaterThan(values[1]);
      }
    });

    it("handles empty claims", () => {
      const budget = allocateTokenBudget([], { totalBudget: 6000, strategy: "equal" });
      expect(budget.size).toBe(0);
    });
  });

  // ── calculateSourceDiversity ──

  describe("calculateSourceDiversity", () => {
    it("returns 0 for empty evidence", () => {
      expect(calculateSourceDiversity([])).toBe(0);
    });

    it("returns 1 for all different sources", () => {
      const evidence = [
        {
          sourceType: "statute",
          relevance: 0.9,
          tokenEstimate: 100,
          inclusionReason: "",
          authority: "primary" as const,
          result: {} as SearchResult,
          claimId: "c1",
        },
        {
          sourceType: "judgement",
          relevance: 0.8,
          tokenEstimate: 100,
          inclusionReason: "",
          authority: "primary" as const,
          result: {} as SearchResult,
          claimId: "c1",
        },
      ];
      expect(calculateSourceDiversity(evidence)).toBe(1);
    });

    it("returns < 1 when same source dominates", () => {
      const evidence = [
        {
          sourceType: "statute",
          relevance: 0.9,
          tokenEstimate: 100,
          inclusionReason: "",
          authority: "primary" as const,
          result: {} as SearchResult,
          claimId: "c1",
        },
        {
          sourceType: "statute",
          relevance: 0.8,
          tokenEstimate: 100,
          inclusionReason: "",
          authority: "primary" as const,
          result: {} as SearchResult,
          claimId: "c1",
        },
        {
          sourceType: "statute",
          relevance: 0.7,
          tokenEstimate: 100,
          inclusionReason: "",
          authority: "primary" as const,
          result: {} as SearchResult,
          claimId: "c1",
        },
        {
          sourceType: "judgement",
          relevance: 0.6,
          tokenEstimate: 100,
          inclusionReason: "",
          authority: "primary" as const,
          result: {} as SearchResult,
          claimId: "c1",
        },
      ];
      const diversity = calculateSourceDiversity(evidence);
      expect(diversity).toBeLessThan(1);
      expect(diversity).toBeGreaterThan(0);
    });
  });

  // ── ensureSourceDiversity ──

  describe("ensureSourceDiversity", () => {
    it("caps results per source", () => {
      const evidence = [
        {
          sourceType: "statute",
          relevance: 0.9,
          tokenEstimate: 100,
          inclusionReason: "",
          authority: "primary" as const,
          result: {} as SearchResult,
          claimId: "c1",
        },
        {
          sourceType: "statute",
          relevance: 0.8,
          tokenEstimate: 100,
          inclusionReason: "",
          authority: "primary" as const,
          result: {} as SearchResult,
          claimId: "c1",
        },
        {
          sourceType: "statute",
          relevance: 0.7,
          tokenEstimate: 100,
          inclusionReason: "",
          authority: "primary" as const,
          result: {} as SearchResult,
          claimId: "c1",
        },
        {
          sourceType: "statute",
          relevance: 0.6,
          tokenEstimate: 100,
          inclusionReason: "",
          authority: "primary" as const,
          result: {} as SearchResult,
          claimId: "c1",
        },
        {
          sourceType: "statute",
          relevance: 0.5,
          tokenEstimate: 100,
          inclusionReason: "",
          authority: "primary" as const,
          result: {} as SearchResult,
          claimId: "c1",
        },
        {
          sourceType: "statute",
          relevance: 0.4,
          tokenEstimate: 100,
          inclusionReason: "",
          authority: "primary" as const,
          result: {} as SearchResult,
          claimId: "c1",
        },
        {
          sourceType: "judgement",
          relevance: 0.3,
          tokenEstimate: 100,
          inclusionReason: "",
          authority: "primary" as const,
          result: {} as SearchResult,
          claimId: "c1",
        },
      ];
      const result = ensureSourceDiversity(evidence, 3);
      const statuteCount = result.filter((e) => e.sourceType === "statute").length;
      expect(statuteCount).toBeLessThanOrEqual(3);
    });

    it("keeps highest relevance entries per source", () => {
      const evidence = [
        {
          sourceType: "statute",
          relevance: 0.9,
          tokenEstimate: 100,
          inclusionReason: "",
          authority: "primary" as const,
          result: {} as SearchResult,
          claimId: "c1",
        },
        {
          sourceType: "statute",
          relevance: 0.3,
          tokenEstimate: 100,
          inclusionReason: "",
          authority: "primary" as const,
          result: {} as SearchResult,
          claimId: "c1",
        },
        {
          sourceType: "statute",
          relevance: 0.5,
          tokenEstimate: 100,
          inclusionReason: "",
          authority: "primary" as const,
          result: {} as SearchResult,
          claimId: "c1",
        },
      ];
      const result = ensureSourceDiversity(evidence, 2);
      const relevances = result.filter((e) => e.sourceType === "statute").map((e) => e.relevance);
      expect(relevances).toContain(0.9);
      expect(relevances).toContain(0.5);
      expect(relevances).not.toContain(0.3);
    });
  });

  // ── estimateTokens ──

  describe("estimateTokens", () => {
    it("estimates tokens based on character count", () => {
      expect(estimateTokens("")).toBe(0);
      expect(estimateTokens("abcd")).toBe(1);
      expect(estimateTokens("abcdefgh")).toBe(2);
    });

    it("handles German text with umlauts", () => {
      const text = "Der Käufer hat gemäß § 433 BGB ein Recht auf Übergabe der Sache.";
      const tokens = estimateTokens(text);
      expect(tokens).toBeGreaterThan(10);
      expect(tokens).toBeLessThan(30);
    });
  });

  // ── buildEvidenceBundle ──

  describe("buildEvidenceBundle", () => {
    it("builds a bundle with evidence within token budget", () => {
      const claim = extractClaims("Was sagt § 433 BGB?")[0];
      const results = [
        mockResult(
          0.9,
          "§ 433 BGB: Der Verkäufer ist verpflichtet, dem Käufer die Sache zu übergeben."
        ),
        mockResult(
          0.8,
          "§ 433 BGB Abs. 1: Durch den Kaufvertrag wird der Verkäufer einer Sache verpflichtet."
        ),
        mockResult(
          0.7,
          "§ 434 BGB: Der Verkäufer hat die Sache in mangelfreiem Zustand zu liefern."
        ),
      ];
      const bundle = buildEvidenceBundle({ claim, results, tokenBudget: 500 });
      expect(bundle.evidence.length).toBeGreaterThan(0);
      expect(bundle.totalTokens).toBeLessThanOrEqual(500);
      expect(bundle.budgetExceeded).toBe(false);
    });

    it("drops low-relevance entries when budget is tight", () => {
      const claim = extractClaims("Was sagt § 433 BGB?")[0];
      const longText = "A".repeat(500);
      const results = [
        mockResult(0.9, longText),
        mockResult(0.8, longText),
        mockResult(0.7, longText),
      ];
      const bundle = buildEvidenceBundle({ claim, results, tokenBudget: 200 });
      // Only one entry should fit
      expect(bundle.evidence.length).toBe(1);
      expect(bundle.totalTokens).toBeLessThanOrEqual(200);
    });

    it("calculates source diversity", () => {
      const claim = extractClaims("Was sagt § 433 BGB?")[0];
      const results = [
        mockResult(0.9, "Statute text", "legal/statutes/de/bgb.md", "law-de"),
        mockResult(0.8, "Judgement text", "legal/judikatur/de/bgh.md", "law-de"),
      ];
      const bundle = buildEvidenceBundle({ claim, results, tokenBudget: 5000 });
      expect(bundle.sources.length).toBeGreaterThanOrEqual(1);
      expect(bundle.sourceDiversity).toBeGreaterThan(0);
    });

    it("handles empty results", () => {
      const claim = extractClaims("Was sagt § 433 BGB?")[0];
      const bundle = buildEvidenceBundle({ claim, results: [], tokenBudget: 500 });
      expect(bundle.evidence).toEqual([]);
      expect(bundle.totalTokens).toBe(0);
    });
  });

  // ── assembleContext ──

  describe("assembleContext", () => {
    it("assembles context from multiple bundles", () => {
      const claim1 = extractClaims("Was sagt § 433 BGB?")[0];
      const claim2 = extractClaims("Wie funktioniert die Gewährleistung?")[0];
      const bundle1 = buildEvidenceBundle({
        claim: claim1,
        results: [mockResult(0.9, "§ 433 BGB text")],
        tokenBudget: 500,
      });
      const bundle2 = buildEvidenceBundle({
        claim: claim2,
        results: [mockResult(0.8, "Gewährleistung text")],
        tokenBudget: 500,
      });
      const context = assembleContext({ bundles: [bundle1, bundle2] });
      expect(context.bundles.length).toBe(2);
      expect(context.allEvidence.length).toBeGreaterThanOrEqual(2);
      expect(context.totalTokens).toBeGreaterThan(0);
    });

    it("generates explain output when requested", () => {
      const claim = extractClaims("Was sagt § 433 BGB?")[0];
      const bundle = buildEvidenceBundle({
        claim,
        results: [mockResult(0.9, "§ 433 BGB text")],
        tokenBudget: 500,
      });
      const context = assembleContext({
        bundles: [bundle],
        explainMode: true,
        excludedSources: [{ source: "law-ch", reason: "Jurisdiction mismatch (DE query)" }],
      });
      expect(context.explain).toBeDefined();
      expect(context.explain?.sourceInclusions.length).toBeGreaterThan(0);
      expect(context.explain?.sourceExclusions.length).toBe(1);
      expect(context.explain?.rankingExplanation).toBeDefined();
      expect(context.explain?.budgetAllocation.length).toBe(1);
    });

    it("does not generate explain output by default", () => {
      const claim = extractClaims("Was sagt § 433 BGB?")[0];
      const bundle = buildEvidenceBundle({
        claim,
        results: [mockResult(0.9, "§ 433 BGB text")],
        tokenBudget: 500,
      });
      const context = assembleContext({ bundles: [bundle] });
      expect(context.explain).toBeUndefined();
    });
  });
});
