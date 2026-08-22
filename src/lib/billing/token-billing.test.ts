/**
 * Tests für Token-Based Credit Billing (Reservation + Idempotency + Token-Deduction).
 *
 * Verifiziert:
 *   - reserveCredits: atomic reservation, verhindert Overdraft
 *   - refundCredits: überschüssige Reservation zurückgeben
 *   - deductTokenCredits: token-genaue Abbuchung mit Idempotency
 *   - Idempotency: keine Double-Counting bei Retries
 *   - getTokenUsageByModel: Dashboard-Query
 */

import { describe, it, expect, beforeEach } from "bun:test";
import {
  addCredits,
  getBalance,
  reserveCredits,
  refundCredits,
  deductTokenCredits,
  getTokenUsageByModel,
  type OwnerType,
} from "@/lib/billing/credits";
import { calculateTokenCredits, type TokenUsage } from "@/lib/billing/credit-rate-card";

// Verwende Memory-Fallback (kein PG Pool in Tests)
const OWNER_ID = "test-owner-token-billing";
const OWNER_TYPE: OwnerType = "user";

describe("token-based credit billing", () => {
  beforeEach(async () => {
    // Reset: Start mit 100 Credits
    // Memory-Fallback: addCredits erstellt Balance falls nicht vorhanden
    await addCredits(OWNER_ID, OWNER_TYPE, 100, { type: "grant", description: "test setup" });
    const balance = await getBalance(OWNER_ID, OWNER_TYPE);
    // Ensure we have at least 100 (addCredits ist kumulativ)
    if (balance.balance < 100) {
      await addCredits(OWNER_ID, OWNER_TYPE, 100 - balance.balance, { type: "grant" });
    }
  });

  // ── reserveCredits ─────────────────────────────────────────────────────

  describe("reserveCredits", () => {
    it("reserves credits successfully when balance is sufficient", async () => {
      const result = await reserveCredits(OWNER_ID, OWNER_TYPE, 10, "reserve-1");
      expect(result.ok).toBe(true);
      expect(result.reservedCredits).toBe(10);
      expect(result.idempotencyKey).toBe("reserve-1");
    });

    it("fails when balance is insufficient", async () => {
      const result = await reserveCredits(OWNER_ID, OWNER_TYPE, 10000, "reserve-2");
      expect(result.ok).toBe(false);
      expect(result.reservedCredits).toBe(0);
    });

    it("is idempotent — same key returns same reservation", async () => {
      const result1 = await reserveCredits(OWNER_ID, OWNER_TYPE, 5, "reserve-idem-1");
      const result2 = await reserveCredits(OWNER_ID, OWNER_TYPE, 5, "reserve-idem-1");
      // Second call should be idempotent (not deduct again)
      expect(result1.ok).toBe(true);
      expect(result2.ok).toBe(true);
      expect(result2.reservedCredits).toBe(result1.reservedCredits);
    });

    it("returns ok=true with 0 for zero reservation", async () => {
      const result = await reserveCredits(OWNER_ID, OWNER_TYPE, 0, "reserve-zero");
      expect(result.ok).toBe(true);
      expect(result.reservedCredits).toBe(0);
    });
  });

  // ── refundCredits ──────────────────────────────────────────────────────

  describe("refundCredits", () => {
    it("refunds unused reservation", async () => {
      const reserved = await reserveCredits(OWNER_ID, OWNER_TYPE, 20, "refund-test-1");
      expect(reserved.ok).toBe(true);

      const refund = await refundCredits(OWNER_ID, OWNER_TYPE, 20, 5, "refund-test-1");
      // Reserved 20, actual 5 → refund 15
      expect(refund.refunded).toBe(15);
      expect(refund.balanceAfter).toBeGreaterThan(0);
    });

    it("refunds nothing when actual >= reserved", async () => {
      const reserved = await reserveCredits(OWNER_ID, OWNER_TYPE, 10, "refund-test-2");
      expect(reserved.ok).toBe(true);

      const refund = await refundCredits(OWNER_ID, OWNER_TYPE, 10, 15, "refund-test-2");
      // Reserved 10, actual 15 → refund 0 (no negative refund)
      expect(refund.refunded).toBe(0);
    });

    it("is idempotent — same refund key returns 0 on second call", async () => {
      await reserveCredits(OWNER_ID, OWNER_TYPE, 20, "refund-idem-1");
      const refund1 = await refundCredits(OWNER_ID, OWNER_TYPE, 20, 5, "refund-idem-1");
      const refund2 = await refundCredits(OWNER_ID, OWNER_TYPE, 20, 5, "refund-idem-1");
      expect(refund1.refunded).toBe(15);
      expect(refund2.refunded).toBe(0); // Already refunded
    });
  });

  // ── deductTokenCredits ─────────────────────────────────────────────────

  describe("deductTokenCredits", () => {
    it("deducts credits based on token usage + model rate", async () => {
      const usage: TokenUsage = {
        modelId: "anthropic:claude-haiku-4-5",
        inputTokens: 500_000, // 0.5M × 2 = 1 credit
        cachedInputTokens: 0,
        cacheCreateTokens: 0,
        outputTokens: 100_000, // 0.1M × 10 = 1 credit
      };
      const result = await deductTokenCredits(OWNER_ID, OWNER_TYPE, usage, "deduct-1", "test-case");
      expect(result.ok).toBe(true);
      expect(result.credits).toBe(2); // 1 + 1 = 2 credits
      expect(result.idempotent).toBe(false);
    });

    it("is idempotent — same key returns cached result, no double-deduction", async () => {
      const usage: TokenUsage = {
        modelId: "anthropic:claude-haiku-4-5",
        inputTokens: 100_000,
        cachedInputTokens: 0,
        cacheCreateTokens: 0,
        outputTokens: 50_000,
      };
      const result1 = await deductTokenCredits(
        OWNER_ID,
        OWNER_TYPE,
        usage,
        "deduct-idem-1",
        "test-case"
      );
      const result2 = await deductTokenCredits(
        OWNER_ID,
        OWNER_TYPE,
        usage,
        "deduct-idem-1",
        "test-case"
      );
      expect(result1.ok).toBe(true);
      expect(result2.ok).toBe(true);
      expect(result2.idempotent).toBe(true);
      expect(result2.credits).toBe(result1.credits);
    });

    it("deducts more credits for Opus than Haiku (same tokens)", async () => {
      const tokens = {
        inputTokens: 100_000,
        cachedInputTokens: 0,
        cacheCreateTokens: 0,
        outputTokens: 50_000,
      };
      const haikuUsage: TokenUsage = { modelId: "anthropic:claude-haiku-4-5", ...tokens };
      const opusUsage: TokenUsage = { modelId: "anthropic:claude-opus-4-8", ...tokens };

      const haikuResult = await deductTokenCredits(
        OWNER_ID,
        OWNER_TYPE,
        haikuUsage,
        "deduct-haiku-1"
      );
      const opusResult = await deductTokenCredits(OWNER_ID, OWNER_TYPE, opusUsage, "deduct-opus-1");

      expect(opusResult.credits).toBeGreaterThan(haikuResult.credits);
    });

    it("deducts fewer credits with cache hits (cached rate = 10%)", async () => {
      const noCache: TokenUsage = {
        modelId: "anthropic:claude-haiku-4-5",
        inputTokens: 100_000,
        cachedInputTokens: 0,
        cacheCreateTokens: 0,
        outputTokens: 0,
      };
      const withCache: TokenUsage = {
        modelId: "anthropic:claude-haiku-4-5",
        inputTokens: 0,
        cachedInputTokens: 100_000, // Same tokens but cached
        cacheCreateTokens: 0,
        outputTokens: 0,
      };

      const noCacheResult = await deductTokenCredits(
        OWNER_ID,
        OWNER_TYPE,
        noCache,
        "deduct-nocache-1"
      );
      const withCacheResult = await deductTokenCredits(
        OWNER_ID,
        OWNER_TYPE,
        withCache,
        "deduct-cache-1"
      );

      // Cached should be 10% of non-cached
      expect(withCacheResult.credits).toBeLessThan(noCacheResult.credits);
      expect(withCacheResult.credits).toBeCloseTo(noCacheResult.credits * 0.1, 2);
    });

    it("returns ok=true with 0 credits for zero tokens", async () => {
      const usage: TokenUsage = {
        modelId: "anthropic:claude-haiku-4-5",
        inputTokens: 0,
        cachedInputTokens: 0,
        cacheCreateTokens: 0,
        outputTokens: 0,
      };
      const result = await deductTokenCredits(OWNER_ID, OWNER_TYPE, usage, "deduct-zero-1");
      expect(result.ok).toBe(true);
      expect(result.credits).toBe(0);
    });

    it("fails when balance is insufficient", async () => {
      const usage: TokenUsage = {
        modelId: "anthropic:claude-opus-4-8",
        inputTokens: 100_000_000, // 100M tokens → 1000 credits
        cachedInputTokens: 0,
        cacheCreateTokens: 0,
        outputTokens: 100_000_000, // → 5000 credits
      };
      const result = await deductTokenCredits(OWNER_ID, OWNER_TYPE, usage, "deduct-insufficient-1");
      expect(result.ok).toBe(false);
    });
  });

  // ── Full Pipeline Flow (Reservation → Settlement → Refund) ────────────

  describe("full pipeline flow", () => {
    it("charges actual usage exactly once via reservation settlement", async () => {
      const pipelineKey = "pipeline-flow-test-1";
      const startingBalance = (await getBalance(OWNER_ID, OWNER_TYPE)).balance;

      // 1. Reserve 20 credits
      const reservation = await reserveCredits(OWNER_ID, OWNER_TYPE, 20, pipelineKey);
      expect(reservation.ok).toBe(true);

      // 2. Simulate 3 layer calls. Token usage is measured, not debited:
      // the reservation already removed the estimated amount from balance.
      const layer1: TokenUsage = {
        modelId: "anthropic:claude-haiku-4-5",
        inputTokens: 200_000,
        cachedInputTokens: 0,
        cacheCreateTokens: 0,
        outputTokens: 50_000,
      };
      const layer2: TokenUsage = {
        modelId: "anthropic:claude-sonnet-5",
        inputTokens: 150_000,
        cachedInputTokens: 0,
        cacheCreateTokens: 0,
        outputTokens: 80_000,
      };
      const layer3: TokenUsage = {
        modelId: "anthropic:claude-opus-4-8",
        inputTokens: 50_000,
        cachedInputTokens: 0,
        cacheCreateTokens: 0,
        outputTokens: 30_000,
      };

      const actualTotal =
        calculateTokenCredits(layer1) +
        calculateTokenCredits(layer2) +
        calculateTokenCredits(layer3);

      // 3. Refund unused reservation
      const refund = await refundCredits(OWNER_ID, OWNER_TYPE, 20, actualTotal, pipelineKey);
      expect(refund.refunded).toBeGreaterThan(0);
      expect(refund.refunded).toBe(roundCredits(20 - actualTotal));

      const finalBalance = await getBalance(OWNER_ID, OWNER_TYPE);
      expect(finalBalance.balance).toBeCloseTo(startingBalance - actualTotal, 2);
    });
  });
});

function roundCredits(n: number): number {
  return Math.round(n * 100) / 100;
}
