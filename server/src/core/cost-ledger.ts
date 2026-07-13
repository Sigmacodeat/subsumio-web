/**
 * EPIC 8 — T8.3 Workflow Receipts and Cost Ledger
 *
 * Tracks tokens per turn, cache hits, tool calls, retries, latency, cost,
 * and provider errors for every LLM interaction. First-pass and final-pass
 * are tracked separately to enable per-pass cost analysis.
 *
 * KEY INVARIANTS:
 *   - Every LLM turn produces a TurnReceipt persisted to the cost ledger.
 *   - First-pass, final-pass, and regeneration passes are tracked separately.
 *   - Cost is computed from the model's pricing at the time of the call.
 *   - Provider errors are captured with enough context for debugging.
 *   - The ledger is append-only — receipts are never mutated.
 */

import { randomUUID } from "node:crypto";
import { getModelEntry } from "./model-registry.ts";

// ── Types ──────────────────────────────────────────────────────────────

export type PassType = "first_pass" | "final_pass" | "regeneration";

export type WorkflowName =
  | "think"
  | "subsumption"
  | "legal_pipeline"
  | "eval_contradictions"
  | "cross_verify"
  | "subagent"
  | "draft"
  | "memo"
  | "generic";

export interface TurnReceipt {
  receipt_id: string;
  workflow_id: string;
  turn_id: string;
  brain_id: string;
  user_id?: string;
  jurisdiction?: string;

  workflow: WorkflowName;
  pass_type: PassType;

  model_id: string;
  provider: string;

  tokens: {
    input: number;
    output: number;
    cache_read: number;
    cache_creation: number;
  };

  tool_calls: Array<{
    tool: string;
    latency_ms: number;
    success: boolean;
    error?: string;
  }>;

  retries: number;
  latency_ms: number;
  cost_usd: number;

  provider_error?: string;
  guardrail_flags: string[];
  verification_state?: string;

  prompt_hash?: string;
  source_snapshot_hashes?: string[];

  created_at: string;
}

export interface RecordTurnOpts {
  workflow: WorkflowName;
  workflow_id: string;
  brain_id: string;
  user_id?: string;
  jurisdiction?: string;
  pass_type: PassType;
  model_id: string;
  tokens: {
    input: number;
    output: number;
    cache_read?: number;
    cache_creation?: number;
  };
  tool_calls?: TurnReceipt["tool_calls"];
  retries?: number;
  latency_ms: number;
  provider_error?: string;
  guardrail_flags?: string[];
  verification_state?: string;
  prompt_hash?: string;
  source_snapshot_hashes?: string[];
}

export interface LedgerStats {
  workflow: WorkflowName;
  total_turns: number;
  total_cost_usd: number;
  total_tokens_input: number;
  total_tokens_output: number;
  total_tokens_cache_read: number;
  total_cache_hit_rate: number;
  total_tool_calls: number;
  total_tool_errors: number;
  total_retries: number;
  avg_latency_ms: number;
  provider_error_count: number;
  by_pass_type: Record<
    PassType,
    {
      turns: number;
      cost_usd: number;
      tokens_input: number;
      tokens_output: number;
      avg_latency_ms: number;
    }
  >;
  by_model: Record<
    string,
    {
      turns: number;
      cost_usd: number;
      tokens_input: number;
      tokens_output: number;
    }
  >;
}

// ── Store ──────────────────────────────────────────────────────────────

/**
 * In-memory cost ledger. In production this would be backed by a
 * `subsumio_cost_ledger` table. The interface is designed so a
 * DB-backed implementation can drop in without changing callers.
 */
const ledger: TurnReceipt[] = [];

/**
 * Reset the ledger — for testing only.
 */
export function _resetCostLedger(): void {
  ledger.length = 0;
}

// ── Cost Computation ───────────────────────────────────────────────────

/**
 * Compute the cost of a turn based on token usage and model pricing.
 * Falls back to 0 if the model is not in the registry (but logs a warning).
 */
export function computeTurnCost(
  modelId: string,
  tokens: {
    input: number;
    output: number;
    cache_read?: number;
    cache_creation?: number;
  }
): number {
  const entry = getModelEntry(modelId);
  if (!entry) {
    return 0;
  }

  const inputCost = (tokens.input / 1_000_000) * entry.pricing.input;
  const outputCost = (tokens.output / 1_000_000) * entry.pricing.output;
  // Cache read is typically 10% of input cost (Anthropic pricing)
  const cacheReadCost = tokens.cache_read
    ? (tokens.cache_read / 1_000_000) * entry.pricing.input * 0.1
    : 0;
  // Cache creation is typically 125% of input cost (Anthropic pricing)
  const cacheCreationCost = tokens.cache_creation
    ? (tokens.cache_creation / 1_000_000) * entry.pricing.input * 1.25
    : 0;

  return (
    Math.round((inputCost + outputCost + cacheReadCost + cacheCreationCost) * 1_000_000) / 1_000_000
  );
}

// ── Public API ─────────────────────────────────────────────────────────

/**
 * Record a turn in the cost ledger. Returns the persisted TurnReceipt.
 */
export function recordTurn(opts: RecordTurnOpts): TurnReceipt {
  const cost = computeTurnCost(opts.model_id, opts.tokens);
  const entry = getModelEntry(opts.model_id);

  const receipt: TurnReceipt = {
    receipt_id: randomUUID(),
    workflow_id: opts.workflow_id,
    turn_id: randomUUID(),
    brain_id: opts.brain_id,
    user_id: opts.user_id,
    jurisdiction: opts.jurisdiction,
    workflow: opts.workflow,
    pass_type: opts.pass_type,
    model_id: opts.model_id,
    provider: entry?.provider ?? "unknown",
    tokens: {
      input: opts.tokens.input,
      output: opts.tokens.output,
      cache_read: opts.tokens.cache_read ?? 0,
      cache_creation: opts.tokens.cache_creation ?? 0,
    },
    tool_calls: opts.tool_calls ?? [],
    retries: opts.retries ?? 0,
    latency_ms: opts.latency_ms,
    cost_usd: cost,
    provider_error: opts.provider_error,
    guardrail_flags: opts.guardrail_flags ?? [],
    verification_state: opts.verification_state,
    prompt_hash: opts.prompt_hash,
    source_snapshot_hashes: opts.source_snapshot_hashes,
    created_at: new Date().toISOString(),
  };

  ledger.push(receipt);
  return receipt;
}

/**
 * Get all turn receipts for a specific workflow run.
 */
export function getTurnReceipts(workflowId: string): TurnReceipt[] {
  return ledger.filter((r) => r.workflow_id === workflowId);
}

/**
 * Get aggregated stats for a workflow type within a time range.
 */
export function getLedgerStats(
  workflow: WorkflowName,
  opts?: { since?: Date; brainId?: string }
): LedgerStats {
  const since = opts?.since ?? new Date(0);
  const filtered = ledger.filter(
    (r) =>
      r.workflow === workflow &&
      new Date(r.created_at) >= since &&
      (!opts?.brainId || r.brain_id === opts.brainId)
  );

  const totalTurns = filtered.length;
  const totalCost = filtered.reduce((s, r) => s + r.cost_usd, 0);
  const totalInput = filtered.reduce((s, r) => s + r.tokens.input, 0);
  const totalOutput = filtered.reduce((s, r) => s + r.tokens.output, 0);
  const totalCacheRead = filtered.reduce((s, r) => s + r.tokens.cache_read, 0);
  const totalCacheCreation = filtered.reduce((s, r) => s + r.tokens.cache_creation, 0);
  const totalToolCalls = filtered.reduce((s, r) => s + r.tool_calls.length, 0);
  const totalToolErrors = filtered.reduce(
    (s, r) => s + r.tool_calls.filter((tc) => !tc.success).length,
    0
  );
  const totalRetries = filtered.reduce((s, r) => s + r.retries, 0);
  const totalLatency = filtered.reduce((s, r) => s + r.latency_ms, 0);
  const providerErrors = filtered.filter((r) => r.provider_error).length;

  const passTypes: PassType[] = ["first_pass", "final_pass", "regeneration"];
  const byPassType = {} as LedgerStats["by_pass_type"];
  for (const pt of passTypes) {
    const ptReceipts = filtered.filter((r) => r.pass_type === pt);
    byPassType[pt] = {
      turns: ptReceipts.length,
      cost_usd: ptReceipts.reduce((s, r) => s + r.cost_usd, 0),
      tokens_input: ptReceipts.reduce((s, r) => s + r.tokens.input, 0),
      tokens_output: ptReceipts.reduce((s, r) => s + r.tokens.output, 0),
      avg_latency_ms:
        ptReceipts.length > 0
          ? Math.round(ptReceipts.reduce((s, r) => s + r.latency_ms, 0) / ptReceipts.length)
          : 0,
    };
  }

  const byModel: LedgerStats["by_model"] = {};
  for (const r of filtered) {
    if (!byModel[r.model_id]) {
      byModel[r.model_id] = {
        turns: 0,
        cost_usd: 0,
        tokens_input: 0,
        tokens_output: 0,
      };
    }
    byModel[r.model_id].turns++;
    byModel[r.model_id].cost_usd += r.cost_usd;
    byModel[r.model_id].tokens_input += r.tokens.input;
    byModel[r.model_id].tokens_output += r.tokens.output;
  }

  const totalInputWithCache = totalInput + totalCacheCreation;
  const cacheHitRate =
    totalInputWithCache > 0 ? totalCacheRead / (totalInputWithCache + totalCacheRead) : 0;

  return {
    workflow,
    total_turns: totalTurns,
    total_cost_usd: Math.round(totalCost * 1_000_000) / 1_000_000,
    total_tokens_input: totalInput,
    total_tokens_output: totalOutput,
    total_tokens_cache_read: totalCacheRead,
    total_cache_hit_rate: cacheHitRate,
    total_tool_calls: totalToolCalls,
    total_tool_errors: totalToolErrors,
    total_retries: totalRetries,
    avg_latency_ms: totalTurns > 0 ? Math.round(totalLatency / totalTurns) : 0,
    provider_error_count: providerErrors,
    by_pass_type: byPassType,
    by_model: byModel,
  };
}

/**
 * Get the total cost across all workflows for a brain.
 */
export function getTotalCost(
  brainId: string,
  opts?: { since?: Date }
): {
  total_cost_usd: number;
  total_turns: number;
  by_workflow: Record<string, { cost_usd: number; turns: number }>;
} {
  const since = opts?.since ?? new Date(0);
  const filtered = ledger.filter((r) => r.brain_id === brainId && new Date(r.created_at) >= since);

  const byWorkflow: Record<string, { cost_usd: number; turns: number }> = {};
  let totalCost = 0;
  for (const r of filtered) {
    const wf = r.workflow;
    if (!byWorkflow[wf]) {
      byWorkflow[wf] = { cost_usd: 0, turns: 0 };
    }
    byWorkflow[wf].cost_usd += r.cost_usd;
    byWorkflow[wf].turns++;
    totalCost += r.cost_usd;
  }

  return {
    total_cost_usd: Math.round(totalCost * 1_000_000) / 1_000_000,
    total_turns: filtered.length,
    by_workflow: byWorkflow,
  };
}

/**
 * Get all receipts from the ledger (for export or audit).
 */
export function getAllReceipts(): TurnReceipt[] {
  return [...ledger];
}

/**
 * Get the count of receipts in the ledger.
 */
export function getLedgerSize(): number {
  return ledger.length;
}
