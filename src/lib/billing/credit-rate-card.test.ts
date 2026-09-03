/**
 * Tests für Token-Based Credit Rate Card.
 *
 * Verifiziert:
 *   - Credit-Berechnung pro Modell (Haiku/Sonnet/Opus)
 *   - Cached-Input Rate (10% von input)
 *   - Pipeline-Estimate pro Tier + Aktgröße
 *   - Tier-Empfehlung
 *   - Idempotency der Berechnung
 */

import { describe, it, expect } from "vitest";
import {
  CREDIT_RATE_CARD,
  DEFAULT_CREDIT_RATE,
  getCreditRate,
  calculateTokenCredits,
  calculateTotalCredits,
  roundCredits,
  estimatePipelineCredits,
  recommendTier,
  type TokenUsage,
} from "@/lib/billing/credit-rate-card";
import { CANONICAL_PRICING } from "../../../server/src/core/model-pricing";

describe("credit-rate-card", () => {
  // ── Rate Card Lookup ───────────────────────────────────────────────────

  describe("getCreditRate", () => {
    it("returns Haiku 4.5 rate", () => {
      const rate = getCreditRate("anthropic:claude-haiku-4-5");
      expect(rate.input).toBe(12);
      expect(rate.cachedInput).toBe(1.2);
      expect(rate.output).toBe(60);
    });

    it("returns Opus 4.8 rate", () => {
      const rate = getCreditRate("anthropic:claude-opus-4-8");
      expect(rate.input).toBe(60);
      expect(rate.cachedInput).toBe(6);
      expect(rate.output).toBe(300);
    });

    it("returns Sonnet 5 rate", () => {
      const rate = getCreditRate("anthropic:claude-sonnet-5");
      expect(rate.input).toBe(24);
      expect(rate.cachedInput).toBe(2.4);
      expect(rate.output).toBe(120);
    });

    it("returns GPT-5.4 rate", () => {
      const rate = getCreditRate("openai:gpt-5.4");
      expect(rate.input).toBe(60);
      expect(rate.cachedInput).toBe(6);
      expect(rate.output).toBe(180);
    });

    it("falls back to DEFAULT_CREDIT_RATE for unknown model", () => {
      const rate = getCreditRate("unknown:foo-bar");
      expect(rate).toEqual(DEFAULT_CREDIT_RATE);
    });

    it("cached rate is 10% of input rate (Anthropic Prompt Caching)", () => {
      for (const [_modelId, rate] of Object.entries(CREDIT_RATE_CARD)) {
        const expectedCached = rate.input * 0.1;
        expect(rate.cachedInput).toBeCloseTo(expectedCached, 2);
      }
    });
  });

  // ── Token → Credit Berechnung ──────────────────────────────────────────

  describe("calculateTokenCredits", () => {
    it("calculates credits for 1M Haiku input tokens (no cache)", () => {
      const usage: TokenUsage = {
        modelId: "anthropic:claude-haiku-4-5",
        inputTokens: 1_000_000,
        cachedInputTokens: 0,
        cacheCreateTokens: 0,
        outputTokens: 0,
      };
      // 1M × 12 credits/1M = 12 credits
      expect(calculateTokenCredits(usage)).toBe(12);
    });

    it("calculates credits for 1M Haiku output tokens", () => {
      const usage: TokenUsage = {
        modelId: "anthropic:claude-haiku-4-5",
        inputTokens: 0,
        cachedInputTokens: 0,
        cacheCreateTokens: 0,
        outputTokens: 1_000_000,
      };
      // 1M × 60 credits/1M = 60 credits
      expect(calculateTokenCredits(usage)).toBe(60);
    });

    it("calculates credits for 1M cached Haiku input tokens (10% rate)", () => {
      const usage: TokenUsage = {
        modelId: "anthropic:claude-haiku-4-5",
        inputTokens: 0,
        cachedInputTokens: 1_000_000,
        cacheCreateTokens: 0,
        outputTokens: 0,
      };
      // 1M × 1.2 credits/1M = 1.2 credits
      expect(calculateTokenCredits(usage)).toBe(1.2);
    });

    it("calculates credits for 1M cache-create Haiku tokens (1.25x input rate)", () => {
      const usage: TokenUsage = {
        modelId: "anthropic:claude-haiku-4-5",
        inputTokens: 0,
        cachedInputTokens: 0,
        cacheCreateTokens: 1_000_000,
        outputTokens: 0,
      };
      // 1M × 15 credits/1M = 15 credits (1.25x input rate of 12)
      expect(calculateTokenCredits(usage)).toBe(15);
    });

    it("calculates credits for mixed Haiku call (input + cached + output)", () => {
      const usage: TokenUsage = {
        modelId: "anthropic:claude-haiku-4-5",
        inputTokens: 500_000, // 0.5M × 12 = 6
        cachedInputTokens: 300_000, // 0.3M × 1.2 = 0.36
        cacheCreateTokens: 0,
        outputTokens: 200_000, // 0.2M × 60 = 12
      };
      // Total: 6 + 0.36 + 12 = 18.36
      expect(calculateTokenCredits(usage)).toBe(18.36);
    });

    it("calculates Opus credits (10x teurer als Haiku)", () => {
      const usage: TokenUsage = {
        modelId: "anthropic:claude-opus-4-8",
        inputTokens: 1_000_000,
        cachedInputTokens: 0,
        cacheCreateTokens: 0,
        outputTokens: 0,
      };
      // 1M × 60 credits/1M = 60 credits (vs Haiku 12 credits)
      expect(calculateTokenCredits(usage)).toBe(60);
    });

    it("returns 0 for zero tokens", () => {
      const usage: TokenUsage = {
        modelId: "anthropic:claude-haiku-4-5",
        inputTokens: 0,
        cachedInputTokens: 0,
        cacheCreateTokens: 0,
        outputTokens: 0,
      };
      expect(calculateTokenCredits(usage)).toBe(0);
    });

    it("is deterministic (idempotent)", () => {
      const usage: TokenUsage = {
        modelId: "anthropic:claude-sonnet-5",
        inputTokens: 250_000,
        cachedInputTokens: 100_000,
        cacheCreateTokens: 0,
        outputTokens: 80_000,
      };
      const result1 = calculateTokenCredits(usage);
      const result2 = calculateTokenCredits(usage);
      expect(result1).toBe(result2);
    });
  });

  // ── Total Credits (Pipeline) ───────────────────────────────────────────

  describe("calculateTotalCredits", () => {
    it("sums credits across multiple LLM calls", () => {
      const usages: TokenUsage[] = [
        {
          modelId: "anthropic:claude-haiku-4-5",
          inputTokens: 100_000,
          cachedInputTokens: 0,
          cacheCreateTokens: 0,
          outputTokens: 50_000,
        },
        {
          modelId: "anthropic:claude-sonnet-5",
          inputTokens: 80_000,
          cachedInputTokens: 0,
          cacheCreateTokens: 0,
          outputTokens: 40_000,
        },
        {
          modelId: "anthropic:claude-opus-4-8",
          inputTokens: 20_000,
          cachedInputTokens: 0,
          cacheCreateTokens: 0,
          outputTokens: 10_000,
        },
      ];
      // Haiku: 0.1×12 + 0.05×60 = 1.2 + 3 = 4.2
      // Sonnet: 0.08×24 + 0.04×120 = 1.92 + 4.8 = 6.72
      // Opus: 0.02×60 + 0.01×300 = 1.2 + 3 = 4.2
      // Total: 4.2 + 6.72 + 4.2 = 15.12
      expect(calculateTotalCredits(usages)).toBe(15.12);
    });

    it("returns 0 for empty array", () => {
      expect(calculateTotalCredits([])).toBe(0);
    });
  });

  // ── roundCredits ───────────────────────────────────────────────────────

  describe("roundCredits", () => {
    it("rounds to 2 decimal places", () => {
      expect(roundCredits(3.456)).toBe(3.46);
      expect(roundCredits(3.454)).toBe(3.45);
      expect(roundCredits(3)).toBe(3);
    });
  });

  // ── Pipeline Estimate ──────────────────────────────────────────────────

  describe("estimatePipelineCredits", () => {
    it("estimates Tier 1 for small case (10 pages)", () => {
      const estimate = estimatePipelineCredits(10, 1);
      expect(estimate.tier).toBe(1);
      expect(estimate.layerCount).toBe(5);
      expect(estimate.estimatedCredits).toBeGreaterThan(0);
      expect(estimate.estimatedCredits).toBeLessThan(30); // Small case < 30 credits (12× markup)
    });

    it("estimates Tier 2 for medium case (50 pages)", () => {
      const estimate = estimatePipelineCredits(50, 2);
      expect(estimate.tier).toBe(2);
      expect(estimate.layerCount).toBe(13);
      expect(estimate.estimatedCredits).toBeGreaterThan(12);
      expect(estimate.estimatedCredits).toBeLessThan(120);
    });

    it("estimates Tier 3 for large case (200 pages)", () => {
      const estimate = estimatePipelineCredits(200, 3);
      expect(estimate.tier).toBe(3);
      expect(estimate.layerCount).toBe(27);
      expect(estimate.estimatedCredits).toBeGreaterThan(30);
      expect(estimate.estimatedCredits).toBeLessThan(600);
    });

    it("larger cases cost more credits (monotonic)", () => {
      const small = estimatePipelineCredits(10, 1);
      const medium = estimatePipelineCredits(50, 2);
      const large = estimatePipelineCredits(200, 3);
      expect(large.estimatedCredits).toBeGreaterThan(medium.estimatedCredits);
      expect(medium.estimatedCredits).toBeGreaterThan(small.estimatedCredits);
    });

    it("higher tier costs more for same page count", () => {
      const tier1 = estimatePipelineCredits(50, 1);
      const tier2 = estimatePipelineCredits(50, 2);
      const tier3 = estimatePipelineCredits(50, 3);
      expect(tier3.estimatedCredits).toBeGreaterThan(tier2.estimatedCredits);
      expect(tier2.estimatedCredits).toBeGreaterThan(tier1.estimatedCredits);
    });

    it("estimates token breakdown (input + cached + output)", () => {
      const estimate = estimatePipelineCredits(50, 2);
      expect(estimate.estimatedInputTokens).toBeGreaterThan(0);
      expect(estimate.estimatedOutputTokens).toBeGreaterThan(0);
      expect(estimate.estimatedCachedTokens).toBeGreaterThan(0);
      // Cached should be < total input (cache hit rate < 100%)
      expect(estimate.estimatedCachedTokens).toBeLessThan(estimate.estimatedInputTokens);
    });
  });

  // ── Tier Recommendation ────────────────────────────────────────────────

  describe("recommendTier", () => {
    it("recommends Tier 1 for <20 pages", () => {
      expect(recommendTier(10)).toBe(1);
      expect(recommendTier(19)).toBe(1);
    });

    it("recommends Tier 2 for 20-100 pages", () => {
      expect(recommendTier(20)).toBe(2);
      expect(recommendTier(50)).toBe(2);
      expect(recommendTier(100)).toBe(2);
    });

    it("recommends Tier 3 for >100 pages", () => {
      expect(recommendTier(101)).toBe(3);
      expect(recommendTier(500)).toBe(3);
    });
  });

  // ── Real-world Szenarien ───────────────────────────────────────────────

  describe("real-world scenarios", () => {
    it("small case (10 pages, Tier 1) costs < 12 credits (€12)", () => {
      const estimate = estimatePipelineCredits(10, 1);
      expect(estimate.estimatedCredits).toBeLessThan(12);
    });

    it("medium case (50 pages, Tier 2) costs 12-60 credits (€12-60)", () => {
      const estimate = estimatePipelineCredits(50, 2);
      expect(estimate.estimatedCredits).toBeGreaterThanOrEqual(12);
      expect(estimate.estimatedCredits).toBeLessThanOrEqual(60);
    });

    it("large case (200 pages, Tier 3) costs 60-300 credits (€60-300)", () => {
      const estimate = estimatePipelineCredits(200, 3);
      expect(estimate.estimatedCredits).toBeGreaterThanOrEqual(60);
      expect(estimate.estimatedCredits).toBeLessThanOrEqual(300);
    });

    it("huge case (1000 pages, Tier 3) costs < 1200 credits (€1200)", () => {
      const estimate = estimatePipelineCredits(1000, 3);
      expect(estimate.estimatedCredits).toBeLessThan(1200);
    });
  });

  // ── F6 DRIFT GUARD — CREDIT_RATE_CARD stays derived from CANONICAL_PRICING ──
  // Re-hardcoding a rate here (instead of letting it derive from canonical)
  // is exactly the class of bug this guards against: GPT-5.5 sat at $4/$16
  // in this file while CANONICAL_PRICING said $5/$30. A trip-wire, not an
  // exhaustive re-implementation — one representative id per provider.
  describe("DRIFT GUARD — CREDIT_RATE_CARD stays derived from CANONICAL_PRICING", () => {
    const MARGIN = 12;
    const CACHED_FACTOR = 0.1;

    const sampleIds = [
      "anthropic:claude-haiku-4-5",
      "anthropic:claude-sonnet-5",
      "anthropic:claude-opus-4-8",
      "openai:gpt-5.5",
      "google:gemini-3-pro",
      "deepseek:deepseek-v4-flash",
      "xai:grok-4.3",
      "mistral:mistral-large-3",
    ];

    for (const id of sampleIds) {
      it(`${id}: input/output rate is exactly canonical × ${MARGIN}, cached is ${CACHED_FACTOR * 100}% of input`, () => {
        const canonical = CANONICAL_PRICING[id];
        expect(canonical).toBeDefined();
        const rate = CREDIT_RATE_CARD[id];
        expect(rate).toBeDefined();
        expect(rate!.input).toBeCloseTo(canonical!.input * MARGIN, 6);
        expect(rate!.output).toBeCloseTo(canonical!.output * MARGIN, 6);
        expect(rate!.cachedInput).toBeCloseTo(rate!.input * CACHED_FACTOR, 6);
        expect(rate!.cacheCreate).toBeCloseTo(rate!.input * 1.25, 6);
      });
    }

    it("every curated rate-card id resolves in CANONICAL_PRICING (no orphaned fallback values)", () => {
      for (const id of Object.keys(CREDIT_RATE_CARD)) {
        expect(CANONICAL_PRICING[id], `${id} missing from CANONICAL_PRICING`).toBeDefined();
      }
    });
  });
});
