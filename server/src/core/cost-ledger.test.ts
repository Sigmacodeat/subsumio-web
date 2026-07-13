/**
 * Tests for EPIC 8 — T8.3 Workflow Receipts and Cost Ledger
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  recordTurn,
  getTurnReceipts,
  getLedgerStats,
  getTotalCost,
  computeTurnCost,
  getAllReceipts,
  getLedgerSize,
  _resetCostLedger,
  type RecordTurnOpts,
} from "./cost-ledger.ts";

const BASE_OPTS: RecordTurnOpts = {
  workflow: "think",
  workflow_id: "wf-001",
  brain_id: "brain-001",
  user_id: "user-001",
  jurisdiction: "at",
  pass_type: "first_pass",
  model_id: "anthropic:claude-opus-4-8",
  tokens: {
    input: 5000,
    output: 2000,
    cache_read: 3000,
    cache_creation: 1000,
  },
  tool_calls: [
    { tool: "search", latency_ms: 150, success: true },
    { tool: "fetch_page", latency_ms: 80, success: false, error: "not found" },
  ],
  retries: 1,
  latency_ms: 12000,
  guardrail_flags: ["CITATION_FLAGGED"],
  verification_state: "VERIFIED_WITH_WARNINGS",
  prompt_hash: "abc123",
};

describe("Cost Ledger", () => {
  beforeEach(() => {
    _resetCostLedger();
  });

  describe("recordTurn", () => {
    it("creates a receipt with all fields populated", () => {
      const receipt = recordTurn(BASE_OPTS);
      expect(receipt.receipt_id).toBeDefined();
      expect(receipt.turn_id).toBeDefined();
      expect(receipt.workflow).toBe("think");
      expect(receipt.pass_type).toBe("first_pass");
      expect(receipt.model_id).toBe("anthropic:claude-opus-4-8");
      expect(receipt.provider).toBe("anthropic");
      expect(receipt.tokens.input).toBe(5000);
      expect(receipt.tokens.output).toBe(2000);
      expect(receipt.tokens.cache_read).toBe(3000);
      expect(receipt.tokens.cache_creation).toBe(1000);
      expect(receipt.tool_calls).toHaveLength(2);
      expect(receipt.tool_calls[0].tool).toBe("search");
      expect(receipt.tool_calls[1].success).toBe(false);
      expect(receipt.retries).toBe(1);
      expect(receipt.latency_ms).toBe(12000);
      expect(receipt.cost_usd).toBeGreaterThan(0);
      expect(receipt.guardrail_flags).toContain("CITATION_FLAGGED");
      expect(receipt.verification_state).toBe("VERIFIED_WITH_WARNINGS");
      expect(receipt.prompt_hash).toBe("abc123");
      expect(receipt.created_at).toBeDefined();
    });

    it("defaults optional fields to empty/zero", () => {
      const receipt = recordTurn({
        workflow: "generic",
        workflow_id: "wf-002",
        brain_id: "brain-001",
        pass_type: "final_pass",
        model_id: "anthropic:claude-haiku-4-5",
        tokens: { input: 1000, output: 500 },
        latency_ms: 5000,
      });
      expect(receipt.tool_calls).toEqual([]);
      expect(receipt.retries).toBe(0);
      expect(receipt.guardrail_flags).toEqual([]);
      expect(receipt.tokens.cache_read).toBe(0);
      expect(receipt.tokens.cache_creation).toBe(0);
    });

    it("captures provider errors", () => {
      const receipt = recordTurn({
        ...BASE_OPTS,
        provider_error: "rate_limit_exceeded",
      });
      expect(receipt.provider_error).toBe("rate_limit_exceeded");
    });
  });

  describe("computeTurnCost", () => {
    it("computes cost for known model", () => {
      const cost = computeTurnCost("anthropic:claude-opus-4-8", {
        input: 1_000_000,
        output: 1_000_000,
      });
      // Opus 4.8: $5/M input + $25/M output = $30
      expect(cost).toBe(30);
    });

    it("includes cache read cost (10% of input)", () => {
      const cost = computeTurnCost("anthropic:claude-opus-4-8", {
        input: 0,
        output: 0,
        cache_read: 1_000_000,
      });
      // Cache read: $5 * 0.1 = $0.50
      expect(cost).toBe(0.5);
    });

    it("includes cache creation cost (125% of input)", () => {
      const cost = computeTurnCost("anthropic:claude-opus-4-8", {
        input: 0,
        output: 0,
        cache_creation: 1_000_000,
      });
      // Cache creation: $5 * 1.25 = $6.25
      expect(cost).toBe(6.25);
    });

    it("returns 0 for unknown model", () => {
      const cost = computeTurnCost("unknown:model", {
        input: 1_000_000,
        output: 1_000_000,
      });
      expect(cost).toBe(0);
    });

    it("computes lower cost for cheaper model", () => {
      const opusCost = computeTurnCost("anthropic:claude-opus-4-8", {
        input: 100_000,
        output: 50_000,
      });
      const haikuCost = computeTurnCost("anthropic:claude-haiku-4-5", {
        input: 100_000,
        output: 50_000,
      });
      expect(haikuCost).toBeLessThan(opusCost);
    });
  });

  describe("getTurnReceipts", () => {
    it("returns all receipts for a workflow id", () => {
      recordTurn({ ...BASE_OPTS, pass_type: "first_pass" });
      recordTurn({ ...BASE_OPTS, pass_type: "regeneration" });
      recordTurn({ ...BASE_OPTS, pass_type: "final_pass" });
      const receipts = getTurnReceipts("wf-001");
      expect(receipts).toHaveLength(3);
    });

    it("returns empty for unknown workflow id", () => {
      expect(getTurnReceipts("unknown")).toEqual([]);
    });
  });

  describe("getLedgerStats", () => {
    it("aggregates stats across turns", () => {
      recordTurn({ ...BASE_OPTS, pass_type: "first_pass" });
      recordTurn({ ...BASE_OPTS, pass_type: "regeneration" });
      recordTurn({ ...BASE_OPTS, pass_type: "final_pass" });

      const stats = getLedgerStats("think");
      expect(stats.total_turns).toBe(3);
      expect(stats.total_cost_usd).toBeGreaterThan(0);
      expect(stats.total_tokens_input).toBe(15000);
      expect(stats.total_tokens_output).toBe(6000);
      expect(stats.total_tool_calls).toBe(6);
      expect(stats.total_tool_errors).toBe(3);
      expect(stats.total_retries).toBe(3);
      expect(stats.avg_latency_ms).toBe(12000);
    });

    it("separates stats by pass type", () => {
      recordTurn({ ...BASE_OPTS, pass_type: "first_pass" });
      recordTurn({ ...BASE_OPTS, pass_type: "first_pass" });
      recordTurn({ ...BASE_OPTS, pass_type: "final_pass" });

      const stats = getLedgerStats("think");
      expect(stats.by_pass_type.first_pass.turns).toBe(2);
      expect(stats.by_pass_type.final_pass.turns).toBe(1);
      expect(stats.by_pass_type.regeneration.turns).toBe(0);
    });

    it("separates stats by model", () => {
      recordTurn({ ...BASE_OPTS, model_id: "anthropic:claude-opus-4-8" });
      recordTurn({ ...BASE_OPTS, model_id: "anthropic:claude-haiku-4-5" });
      recordTurn({ ...BASE_OPTS, model_id: "anthropic:claude-opus-4-8" });

      const stats = getLedgerStats("think");
      expect(stats.by_model["anthropic:claude-opus-4-8"].turns).toBe(2);
      expect(stats.by_model["anthropic:claude-haiku-4-5"].turns).toBe(1);
    });

    it("counts provider errors", () => {
      recordTurn({ ...BASE_OPTS, provider_error: "rate_limit" });
      recordTurn({ ...BASE_OPTS });
      recordTurn({ ...BASE_OPTS, provider_error: "timeout" });

      const stats = getLedgerStats("think");
      expect(stats.provider_error_count).toBe(2);
    });

    it("computes cache hit rate", () => {
      recordTurn({
        ...BASE_OPTS,
        tokens: { input: 5000, output: 1000, cache_read: 5000, cache_creation: 0 },
      });
      const stats = getLedgerStats("think");
      expect(stats.total_cache_hit_rate).toBeGreaterThan(0);
    });

    it("filters by brain_id", () => {
      recordTurn({ ...BASE_OPTS, brain_id: "brain-a" });
      recordTurn({ ...BASE_OPTS, brain_id: "brain-b" });
      const stats = getLedgerStats("think", { brainId: "brain-a" });
      expect(stats.total_turns).toBe(1);
    });
  });

  describe("getTotalCost", () => {
    it("returns total cost across all workflows for a brain", () => {
      recordTurn({ ...BASE_OPTS, workflow: "think", brain_id: "brain-a" });
      recordTurn({ ...BASE_OPTS, workflow: "cross_verify", brain_id: "brain-a" });
      recordTurn({ ...BASE_OPTS, workflow: "think", brain_id: "brain-b" });

      const result = getTotalCost("brain-a");
      expect(result.total_turns).toBe(2);
      expect(result.total_cost_usd).toBeGreaterThan(0);
      expect(Object.keys(result.by_workflow)).toContain("think");
      expect(Object.keys(result.by_workflow)).toContain("cross_verify");
      expect(result.by_workflow.think.turns).toBe(1);
    });
  });

  describe("first-pass vs final-pass tracking", () => {
    it("tracks first-pass and final-pass separately", () => {
      recordTurn({
        ...BASE_OPTS,
        pass_type: "first_pass",
        tokens: { input: 10000, output: 3000 },
        latency_ms: 8000,
      });
      recordTurn({
        ...BASE_OPTS,
        pass_type: "final_pass",
        tokens: { input: 5000, output: 2000 },
        latency_ms: 5000,
      });

      const stats = getLedgerStats("think");
      expect(stats.by_pass_type.first_pass.turns).toBe(1);
      expect(stats.by_pass_type.first_pass.tokens_input).toBe(10000);
      expect(stats.by_pass_type.first_pass.avg_latency_ms).toBe(8000);
      expect(stats.by_pass_type.final_pass.turns).toBe(1);
      expect(stats.by_pass_type.final_pass.tokens_input).toBe(5000);
      expect(stats.by_pass_type.final_pass.avg_latency_ms).toBe(5000);
    });

    it("tracks regeneration passes", () => {
      recordTurn({ ...BASE_OPTS, pass_type: "first_pass" });
      recordTurn({ ...BASE_OPTS, pass_type: "regeneration" });
      recordTurn({ ...BASE_OPTS, pass_type: "regeneration" });
      recordTurn({ ...BASE_OPTS, pass_type: "final_pass" });

      const stats = getLedgerStats("think");
      expect(stats.by_pass_type.first_pass.turns).toBe(1);
      expect(stats.by_pass_type.regeneration.turns).toBe(2);
      expect(stats.by_pass_type.final_pass.turns).toBe(1);
    });
  });

  describe("ledger size and export", () => {
    it("getLedgerSize returns count", () => {
      expect(getLedgerSize()).toBe(0);
      recordTurn(BASE_OPTS);
      expect(getLedgerSize()).toBe(1);
    });

    it("getAllReceipts returns copy of ledger", () => {
      recordTurn(BASE_OPTS);
      const all = getAllReceipts();
      expect(all).toHaveLength(1);
      expect(all[0].workflow_id).toBe("wf-001");
    });
  });
});
