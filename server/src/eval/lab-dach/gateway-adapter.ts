/**
 * LAB-DACH v3 — Gateway Adapter
 *
 * Bridges the production AI gateway (server/src/core/ai/gateway.ts) to the
 * LAB-DACH harness's ChatOpts/ChatResult types (from rubric-judge.ts).
 *
 * In live mode, this adapter:
 *   - Maps harness ChatOpts → gateway chat() opts
 *   - Calls gateway.chat() with real provider routing
 *   - Maps gateway ChatResult → harness ChatResult (with usage + model)
 *   - Tracks per-call latency, tokens, and cost (via computeTurnCost from CANONICAL_PRICING)
 *   - Enforces budget guard (aborts if cumulative cost exceeds maxCostUsd)
 *
 * In mock mode, the harness uses its own mockChatFn directly — this adapter
 * is not involved.
 */

import { chat as gatewayChat, type ChatOpts as GatewayChatOpts, type ChatResult as GatewayChatResult } from "../../core/ai/gateway.ts";
import { computeTurnCost } from "../../core/cost-ledger.ts";
import type { ChatOpts, ChatResult } from "./rubric-judge.ts";

export interface GatewayAdapterStats {
  totalCalls: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostUsd: number;
  latenciesMs: number[];
  errors: string[];
  modelUsed: string | null;
}

export interface GatewayAdapterOpts {
  /** Model id in "provider:model" or bare form — passed to gateway.chat() */
  modelId: string;
  /** Max cumulative cost in USD — throws BudgetExceededError if exceeded */
  maxCostUsd?: number;
  /** Max tokens per call (default: 4096) */
  defaultMaxTokens?: number;
}

export class BudgetExceededError extends Error {
  constructor(
    public cumulativeCost: number,
    public limit: number
  ) {
    super(
      `Budget guard: cumulative cost $${cumulativeCost.toFixed(6)} exceeded limit $${limit.toFixed(6)}`
    );
    this.name = "BudgetExceededError";
  }
}

/**
 * Create a harness-compatible chatFn that routes through the production gateway.
 *
 * Usage:
 *   const { chatFn, stats } = createGatewayChatFn({ modelId: "openrouter:deepseek/deepseek-chat" });
 *   const result = await runE2E({ mockMode: false, chatFn, ... });
 *   console.log(stats.totalCostUsd);
 */
export function createGatewayChatFn(opts: GatewayAdapterOpts): {
  chatFn: (opts: ChatOpts) => Promise<ChatResult>;
  stats: GatewayAdapterStats;
} {
  const stats: GatewayAdapterStats = {
    totalCalls: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalCostUsd: 0,
    latenciesMs: [],
    errors: [],
    modelUsed: null,
  };

  const chatFn = async (harnessOpts: ChatOpts): Promise<ChatResult> => {
    const callStartedAt = Date.now();

    // Map harness ChatOpts → gateway ChatOpts
    const gatewayOpts: GatewayChatOpts = {
      model: opts.modelId,
      system: harnessOpts.system,
      messages: harnessOpts.messages.map((m) => ({
        role: m.role,
        content: [{ type: "text", text: m.content }],
      })),
      maxTokens: harnessOpts.maxTokens ?? opts.defaultMaxTokens ?? 4096,
    };

    let gwResult: GatewayChatResult;
    try {
      gwResult = await gatewayChat(gatewayOpts);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      stats.errors.push(errMsg);
      throw err;
    }

    const latencyMs = Date.now() - callStartedAt;
    stats.totalCalls++;
    stats.latenciesMs.push(latencyMs);
    stats.modelUsed = gwResult.model;

    const inputTokens = gwResult.usage.input_tokens;
    const outputTokens = gwResult.usage.output_tokens;
    stats.totalInputTokens += inputTokens;
    stats.totalOutputTokens += outputTokens;

    const callCost = computeTurnCost(gwResult.model, {
      input: inputTokens,
      output: outputTokens,
      cache_read: gwResult.usage.cache_read_tokens,
      cache_creation: gwResult.usage.cache_creation_tokens,
    });
    stats.totalCostUsd += callCost;

    // Budget guard
    if (opts.maxCostUsd !== undefined && stats.totalCostUsd > opts.maxCostUsd) {
      throw new BudgetExceededError(stats.totalCostUsd, opts.maxCostUsd);
    }

    // Map gateway ChatResult → harness ChatResult
    return {
      text: gwResult.text,
      usage: {
        input_tokens: inputTokens,
        output_tokens: outputTokens,
      },
      model: gwResult.model,
    };
  };

  return { chatFn, stats };
}

/**
 * Compute p50 and p95 from an array of latencies.
 */
export function computeLatencyPercentiles(latencies: number[]): {
  p50: number;
  p95: number;
} {
  if (latencies.length === 0) return { p50: 0, p95: 0 };
  const sorted = [...latencies].sort((a, b) => a - b);
  const p50Idx = Math.floor(sorted.length * 0.5);
  const p95Idx = Math.floor(sorted.length * 0.95);
  return {
    p50: sorted[p50Idx],
    p95: sorted[Math.min(p95Idx, sorted.length - 1)],
  };
}
