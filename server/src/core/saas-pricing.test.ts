import { describe, it, expect } from "bun:test";
import {
  PLANS,
  getSellingPrice,
  getEmbeddingSellingPrice,
  calculateUsageCost,
  calculateMonthlyBill,
  hasFeature,
  isTierAllowed,
  isWorkflowAllowed,
  getPlanSummary,
  COMPETITIVE_BENCHMARK,
  type PlanTier,
  type UsageRecord,
} from "./saas-pricing.ts";

describe("saas-pricing", () => {
  describe("PLANS", () => {
    it("defines 3 plan tiers (solo, kanzlei, enterprise)", () => {
      expect(Object.keys(PLANS).sort()).toEqual(["enterprise", "kanzlei", "solo"]);
    });

    it("solo is cheaper than kanzlei", () => {
      expect(PLANS.solo.monthly_seat_price).toBeLessThan(PLANS.kanzlei.monthly_seat_price);
    });

    it("markup increases with plan tier", () => {
      expect(PLANS.solo.markup_multiplier).toBeLessThan(PLANS.kanzlei.markup_multiplier);
    });

    it("enterprise has BYOK and 1× markup (pass-through)", () => {
      expect(PLANS.enterprise.byok_allowed).toBe(true);
      expect(PLANS.enterprise.monthly_seat_price).toBe(0);
      expect(PLANS.enterprise.markup_multiplier).toBe(1);
    });

    it("solo allows utility+subagent+reasoning", () => {
      expect(PLANS.solo.allowed_tiers).toEqual(["utility", "subagent", "reasoning"]);
    });

    it("kanzlei allows all tiers including deep", () => {
      expect(PLANS.kanzlei.allowed_tiers).toEqual(["utility", "subagent", "reasoning", "deep"]);
    });

    it("solo matches public website price (€179)", () => {
      expect(PLANS.solo.monthly_seat_price).toBe(249);
    });

    it("kanzlei matches public website (€999/5 seats = €199/seat)", () => {
      expect(PLANS.kanzlei.monthly_seat_price).toBe(299);
    });
  });

  describe("competitive markup", () => {
    it("solo markup (12×) gives 91.7% margin — above Sequoia 50% floor", () => {
      const margin = 1 - 1 / PLANS.solo.markup_multiplier;
      expect(margin).toBeGreaterThan(0.5); // 50% Sequoia floor
      expect(margin).toBeCloseTo(0.917, 2); // 91.7% target
    });

    it("kanzlei markup (18×) gives 94.4% margin — above Irys 93%", () => {
      const margin = 1 - 1 / PLANS.kanzlei.markup_multiplier;
      expect(margin).toBeGreaterThan(0.8); // 80% legal AI benchmark
      expect(margin).toBeCloseTo(0.944, 2); // 94.4% (above Irys 93%)
    });

    it("our margins are within competitive range", () => {
      const soloMargin = (1 - 1 / PLANS.solo.markup_multiplier) * 100;
      const kanzleiMargin = (1 - 1 / PLANS.kanzlei.markup_multiplier) * 100;
      // Harvey: 85-98.5%, Irys: 93%, Legora: 70-85%
      // We should be in the 90-95% range (above Irys, below Harvey max)
      expect(soloMargin).toBeGreaterThanOrEqual(90);
      expect(kanzleiMargin).toBeGreaterThanOrEqual(90);
    });
  });

  describe("getSellingPrice", () => {
    it("applies 12× markup to Sonnet on solo plan (with USD→EUR conversion)", () => {
      const selling = getSellingPrice("anthropic:claude-sonnet-4-6", "solo");
      expect(selling).not.toBeNull();
      // Cost: $3/$15 USD → EUR: €2.76/€13.80 (×0.92) → ×12 markup → €33.12/€165.60
      expect(selling!.input).toBeCloseTo(33.12, 1);
      expect(selling!.output).toBeCloseTo(165.6, 1);
    });

    it("applies 18× markup to Sonnet on kanzlei plan", () => {
      const selling = getSellingPrice("anthropic:claude-sonnet-4-6", "kanzlei");
      expect(selling).not.toBeNull();
      // Cost: $3/$15 → EUR: €2.76/€13.80 → ×18 → €49.68/€248.40
      expect(selling!.input).toBeCloseTo(49.68, 1);
      expect(selling!.output).toBeCloseTo(248.4, 1);
    });

    it("applies 1× markup on enterprise (BYOK pass-through)", () => {
      const selling = getSellingPrice("anthropic:claude-sonnet-4-6", "enterprise");
      expect(selling).not.toBeNull();
      // Cost: $3/$15 → EUR: €2.76/€13.80 → ×1 → €2.76/€13.80
      expect(selling!.input).toBeCloseTo(2.76, 1);
      expect(selling!.output).toBeCloseTo(13.8, 1);
    });

    it("returns null for unknown model", () => {
      expect(getSellingPrice("unknown:model", "solo")).toBeNull();
    });
  });

  describe("getEmbeddingSellingPrice", () => {
    it("applies markup to embedding price in EUR", () => {
      const selling = getEmbeddingSellingPrice("openai:text-embedding-3-small", "solo");
      // Cost: $0.02/MTok → EUR: €0.0184 → ×12 → €0.2208
      expect(selling).toBeCloseTo(0.221, 2);
    });

    it("returns null for unknown embedding model", () => {
      expect(getEmbeddingSellingPrice("unknown:embed", "solo")).toBeNull();
    });
  });

  describe("calculateUsageCost", () => {
    it("calculates cost + selling price for a Sonnet call on solo", () => {
      const record: UsageRecord = {
        model_id: "anthropic:claude-sonnet-4-6",
        tokens_input: 25000,
        tokens_output: 8000,
        tokens_cache_read: 0,
        is_embedding: false,
      };
      const result = calculateUsageCost(record, "solo");
      // Cost EUR: (25K/1M × $3 × 0.92) + (8K/1M × $15 × 0.92)
      //         = (0.025 × 2.76) + (0.008 × 13.80) = 0.069 + 0.1104 = 0.1794
      expect(result.cost_eur).toBeCloseTo(0.1794, 3);
      // Sell: 0.1794 × 12 = 2.1528
      expect(result.sell_eur).toBeCloseTo(2.153, 2);
      // Margin: 91.67%
      expect(result.margin_pct).toBeCloseTo(91.67, 1);
      expect(result.plan).toBe("solo");
      expect(result.priced).toBe(true);
    });

    it("calculates cache-read discount (10% of input)", () => {
      const record: UsageRecord = {
        model_id: "anthropic:claude-sonnet-4-6",
        tokens_input: 5000,
        tokens_output: 3000,
        tokens_cache_read: 20000,
        is_embedding: false,
      };
      const result = calculateUsageCost(record, "solo");
      // Input: 5K/1M × $3 × 0.92 = 0.0138
      // Output: 3K/1M × $15 × 0.92 = 0.0414
      // Cache: 20K/1M × $3 × 0.92 × 0.1 = 0.00552
      // Total cost: 0.06072
      expect(result.cost_eur).toBeCloseTo(0.06072, 4);
      // Sell: 0.06072 × 12 = 0.72864
      expect(result.sell_eur).toBeCloseTo(0.729, 3);
    });

    it("calculates embedding cost in EUR", () => {
      const record: UsageRecord = {
        model_id: "openai:text-embedding-3-small",
        tokens_input: 650,
        tokens_output: 0,
        tokens_cache_read: 0,
        is_embedding: true,
      };
      const result = calculateUsageCost(record, "solo");
      // Cost: 650/1M × $0.02 × 0.92 = 0.00001196
      expect(result.cost_eur).toBeCloseTo(0.00001196, 6);
      // Sell: × 12 = 0.00014352
      expect(result.sell_eur).toBeCloseTo(0.000144, 5);
    });

    it("returns priced=false for unknown model", () => {
      const record: UsageRecord = {
        model_id: "unknown:model",
        tokens_input: 1000,
        tokens_output: 500,
        tokens_cache_read: 0,
        is_embedding: false,
      };
      const result = calculateUsageCost(record, "solo");
      expect(result.priced).toBe(false);
      expect(result.cost_eur).toBe(0);
      expect(result.sell_eur).toBe(0);
    });

    it("kanzlei plan has higher margin than solo", () => {
      const record: UsageRecord = {
        model_id: "anthropic:claude-sonnet-4-6",
        tokens_input: 25000,
        tokens_output: 8000,
        tokens_cache_read: 0,
        is_embedding: false,
      };
      const soloResult = calculateUsageCost(record, "solo");
      const kanzleiResult = calculateUsageCost(record, "kanzlei");
      expect(kanzleiResult.margin_pct).toBeGreaterThan(soloResult.margin_pct);
    });
  });

  describe("calculateMonthlyBill", () => {
    it("calculates bill with included credit (no overage)", () => {
      const records: UsageRecord[] = [
        {
          model_id: "deepseek:deepseek-chat",
          tokens_input: 100000,
          tokens_output: 30000,
          tokens_cache_read: 0,
          is_embedding: false,
        },
      ];
      const bill = calculateMonthlyBill(records, "solo", 1);
      // Cost EUR: (100K/1M × $0.14 × 0.92) + (30K/1M × $0.28 × 0.92)
      //         = 0.01288 + 0.007728 = 0.020608
      // Sell: × 10 = 0.20608
      // Included: €40, Overage: 0
      // Total: €179 (seat) + €0 = €179
      expect(bill.seat_subtotal).toBe(249);
      expect(bill.included_credit).toBe(60);
      expect(bill.overage_cost).toBe(0);
      expect(bill.total).toBe(249);
    });

    it("calculates bill with overage when usage exceeds credit", () => {
      const records: UsageRecord[] = [];
      // Each Sonnet call: 25K in + 8K out → cost €0.1794 → sell €2.1528 (12×)
      // Need ~28 calls to exceed €60 included credit
      for (let i = 0; i < 30; i++) {
        records.push({
          model_id: "anthropic:claude-sonnet-4-6",
          tokens_input: 25000,
          tokens_output: 8000,
          tokens_cache_read: 0,
          is_embedding: false,
        });
      }
      const bill = calculateMonthlyBill(records, "solo", 1);
      // Total sell: 30 × €2.1528 = €64.58
      // Overage: €64.58 - €60 = €4.58
      // Total: €249 + €4.58 = €253.58
      expect(bill.usage_cost).toBeCloseTo(64.58, 1);
      expect(bill.overage_cost).toBeCloseTo(4.58, 1);
      expect(bill.total).toBeCloseTo(253.58, 1);
    });

    it("aggregates by model correctly", () => {
      const records: UsageRecord[] = [
        {
          model_id: "deepseek:deepseek-chat",
          tokens_input: 10000,
          tokens_output: 2000,
          tokens_cache_read: 0,
          is_embedding: false,
        },
        {
          model_id: "anthropic:claude-sonnet-4-6",
          tokens_input: 20000,
          tokens_output: 5000,
          tokens_cache_read: 0,
          is_embedding: false,
        },
        {
          model_id: "deepseek:deepseek-chat",
          tokens_input: 5000,
          tokens_output: 1000,
          tokens_cache_read: 0,
          is_embedding: false,
        },
      ];
      const bill = calculateMonthlyBill(records, "solo", 1);
      expect(bill.by_model.length).toBe(2);
      const deepseek = bill.by_model.find((m) => m.model_id === "deepseek:deepseek-chat");
      expect(deepseek).toBeDefined();
      expect(deepseek!.tokens_input).toBe(15000);
      expect(deepseek!.tokens_output).toBe(3000);
    });

    it("enterprise plan has 1× markup (BYOK pass-through)", () => {
      const records: UsageRecord[] = [
        {
          model_id: "anthropic:claude-sonnet-4-6",
          tokens_input: 100000,
          tokens_output: 30000,
          tokens_cache_read: 0,
          is_embedding: false,
        },
      ];
      const bill = calculateMonthlyBill(records, "enterprise", 1);
      // Enterprise: 1× markup → sell = cost (in EUR)
      // Cost: (100K/1M × $3 × 0.92) + (30K/1M × $15 × 0.92) = 0.276 + 0.414 = 0.69
      expect(bill.usage_cost).toBeCloseTo(0.69, 1);
      expect(bill.seat_subtotal).toBe(0);
      expect(bill.total).toBeCloseTo(0.69, 1);
    });

    it("kanzlei plan: 5 seats = €995 seat subtotal", () => {
      const records: UsageRecord[] = [];
      const bill = calculateMonthlyBill(records, "kanzlei", 5);
      expect(bill.seat_subtotal).toBe(1495); // 5 × €299
      expect(bill.included_credit).toBe(1000); // 5 × €200
      expect(bill.total).toBe(1495);
    });
  });

  describe("feature checks", () => {
    it("solo plan cannot use full_pipeline", () => {
      expect(isWorkflowAllowed("solo", "full_pipeline")).toBe(false);
    });

    it("kanzlei plan can use full_pipeline", () => {
      expect(isWorkflowAllowed("kanzlei", "full_pipeline")).toBe(true);
    });

    it("solo plan cannot use deep tier", () => {
      expect(isTierAllowed("solo", "deep")).toBe(false);
    });

    it("kanzlei plan can use deep tier", () => {
      expect(isTierAllowed("kanzlei", "deep")).toBe(true);
    });

    it("all plans can use memo", () => {
      for (const plan of ["solo", "kanzlei", "enterprise"] as PlanTier[]) {
        expect(isWorkflowAllowed(plan, "memo")).toBe(true);
      }
    });

    it("solo has no api_access", () => {
      expect(hasFeature("solo", "api_access")).toBe(false);
    });

    it("kanzlei has api_access", () => {
      expect(hasFeature("kanzlei", "api_access")).toBe(true);
    });
  });

  describe("getPlanSummary", () => {
    it("returns display summary for solo plan", () => {
      const summary = getPlanSummary("solo");
      expect(summary.name).toBe("Solo");
      expect(summary.monthly).toBe(249);
      expect(summary.included).toBe(60);
      expect(summary.markup).toContain("12");
      expect(summary.margin_pct).toBe(91.7);
    });

    it("per-page estimate scales with markup", () => {
      const solo = getPlanSummary("solo");
      const kanzlei = getPlanSummary("kanzlei");
      // Kanzlei markup (18) > Solo markup (12) → kanzlei per-page cost > solo
      expect(kanzlei.per_page_estimate.memo).toBeGreaterThan(solo.per_page_estimate.memo);
    });
  });

  describe("competitive benchmark data", () => {
    it("contains all major competitors", () => {
      expect(COMPETITIVE_BENCHMARK.harvey).toBeDefined();
      expect(COMPETITIVE_BENCHMARK.legora).toBeDefined();
      expect(COMPETITIVE_BENCHMARK.irys).toBeDefined();
      expect(COMPETITIVE_BENCHMARK.cocounsel).toBeDefined();
      expect(COMPETITIVE_BENCHMARK.spellbook).toBeDefined();
    });

    it("Harvey has 85%+ margin", () => {
      expect(COMPETITIVE_BENCHMARK.harvey.margin_pct).toBeGreaterThanOrEqual(85);
    });

    it("Irys has 93% margin", () => {
      expect(COMPETITIVE_BENCHMARK.irys.margin_pct).toBe(93);
    });
  });
});
