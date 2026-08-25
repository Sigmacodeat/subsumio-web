/**
 * Embedding Service — v0.14+ thin delegation to src/core/ai/gateway.ts.
 *
 * The gateway handles provider resolution, retry, error normalization, and
 * dimension-parameter passthrough (preserving existing 1536-dim brains).
 */

import {
  embed as gatewayEmbed,
  embedOne as gatewayEmbedOne,
  embedQuery as gatewayEmbedQuery,
  getEmbeddingModel as gatewayGetModel,
  getEmbeddingDimensions as gatewayGetDims,
} from "./ai/gateway.ts";
import { lookupEmbeddingPrice } from "./embedding-pricing.ts";
import { DEFAULT_EMBEDDING_MODEL, DEFAULT_EMBEDDING_DIMENSIONS } from "./ai/defaults.ts";
import { readFileSync, existsSync, appendFileSync } from "fs";
import { createHash } from "crypto";

// v0.27.1: re-export multimodal embedding so callers can pull both text and
// image embedding APIs from `src/core/embedding`. import-image-file consumes
// embedMultimodal directly.
//
// v0.36 cross-modal wave: query-side multimodal embedding (text and image
// variants) for hybridSearch routing image-intent queries to the multimodal
// column. embedMultimodalSafe is the partial-failure variant Phase 3 reindex
// uses to make forward progress on transient batch failures.
export {
  embedMultimodal,
  embedMultimodalSafe,
  embedQueryMultimodal,
  embedQueryMultimodalImage,
} from "./ai/gateway.ts";
export type { MultimodalInput, EmbedMultimodalOpts, MultimodalBatchResult } from "./ai/types.ts";

/** Embed one text (document-side for asymmetric providers). */
export async function embed(text: string): Promise<Float32Array> {
  return gatewayEmbedOne(text);
}

/**
 * v0.35.0.0+: embed a single text on the QUERY side. For asymmetric providers
 * (ZE zembed-1, Voyage v3+) this routes `input_type: 'query'` through the
 * embed seam so the provider returns query-side vectors. For symmetric
 * providers (OpenAI text-3, DashScope, Zhipu) the field is dropped — no
 * behavior change. Used by hybrid.ts on the search hot path.
 *
 * v0.36 (D10): optional `embeddingModel` + `dimensions` overrides so the
 * dynamic-embedding-column path can embed via the column's provider rather
 * than the globally-configured default. Bare `embedQuery(text)` preserves
 * pre-v0.36 behavior.
 *
 * v0.49 (eval-determinism): persistent query-embedding cache. When enabled
 * with a file path, the same (model|dimensions|text) always returns the same
 * vector — across processes. This is critical for eval harnesses where
 * text-embedding-3-small via OpenRouter returns slightly different vectors
 * (~1e-5 diff) on ~20% of calls, causing non-deterministic IVFFlat candidate
 * sets. The cache is a JSONL file: one {key, vector} per line.
 */
const _queryEmbedCache = new Map<string, Float32Array>();
let _queryEmbedCacheEnabled = false;
let _queryEmbedCacheFile: string | null = null;

export function enableQueryEmbedCache(cacheFile?: string): void {
  _queryEmbedCacheEnabled = true;
  _queryEmbedCache.clear();
  _queryEmbedCacheFile = cacheFile ?? null;
  if (_queryEmbedCacheFile && existsSync(_queryEmbedCacheFile)) {
    const raw = readFileSync(_queryEmbedCacheFile, "utf-8");
    for (const line of raw.split("\n")) {
      if (!line.trim()) continue;
      try {
        const entry = JSON.parse(line) as { key: string; vector: number[] };
        _queryEmbedCache.set(entry.key, new Float32Array(entry.vector));
      } catch {}
    }
  }
}

export function disableQueryEmbedCache(): void {
  _queryEmbedCacheEnabled = false;
  _queryEmbedCache.clear();
  _queryEmbedCacheFile = null;
}

export function getQueryEmbedCacheStats(): { size: number; enabled: boolean } {
  return { size: _queryEmbedCache.size, enabled: _queryEmbedCacheEnabled };
}

export async function embedQuery(
  text: string,
  opts?: { embeddingModel?: string; dimensions?: number; abortSignal?: AbortSignal }
): Promise<Float32Array> {
  if (_queryEmbedCacheEnabled) {
    const key = `${opts?.embeddingModel ?? "default"}|${opts?.dimensions ?? 0}|${text}`;
    const cached = _queryEmbedCache.get(key);
    if (cached) return cached;
    const vec = await gatewayEmbedQuery(text, opts);
    _queryEmbedCache.set(key, vec);
    if (_queryEmbedCacheFile) {
      appendFileSync(_queryEmbedCacheFile, JSON.stringify({ key, vector: Array.from(vec) }) + "\n");
    }
    return vec;
  }
  return gatewayEmbedQuery(text, opts);
}

export interface EmbedBatchOptions {
  /**
   * Optional callback fired after each sub-batch completes. CLI wrappers
   * tick a reporter; Minion handlers can call job.updateProgress here.
   */
  onBatchComplete?: (done: number, total: number) => void;
  /**
   * v0.33.4 (D8): propagate the caller's `AbortSignal` into Vercel AI SDK's
   * `embedMany({abortSignal})` so a wall-clock budget can cancel mid-fetch.
   * Without this, a worker stuck mid-HTTP on a ~30s OpenAI timeout ignores
   * the budget until the fetch resolves.
   */
  abortSignal?: AbortSignal;
  /**
   * v0.33.4 (D4a): cap on AI SDK's per-call retries. Default in `embedMany`
   * is 2 (so up to 3 attempts). Pass `0` from higher-level wrappers that
   * own their own retry policy, otherwise wrapper × SDK retries stack
   * (e.g. 3 SDK attempts × 5 wrapper attempts = 15 cycles per embedBatch)
   * and amplify rate-limit pressure.
   */
  maxRetries?: number;
}

/**
 * Embed a batch of texts via the gateway. Sub-batches of 100 so upstream
 * progress callbacks fire incrementally on large imports. The gateway owns
 * adaptive batch splitting and per-recipe token-budget logic; this paginator
 * is purely about progress-callback granularity.
 */
const BATCH_SIZE = 100;
export async function embedBatch(
  texts: string[],
  options: EmbedBatchOptions = {}
): Promise<Float32Array[]> {
  if (!texts || texts.length === 0) return [];
  // Build the gateway-call passthrough once; undefined fields stay undefined
  // so non-opt-in callers see unchanged pre-v0.33.4 behavior.
  const gwOpts = {
    ...(options.abortSignal !== undefined && { abortSignal: options.abortSignal }),
    ...(options.maxRetries !== undefined && { maxRetries: options.maxRetries }),
  };
  // Fast path: small batch, no progress callback — single gateway call.
  if (texts.length <= BATCH_SIZE && !options.onBatchComplete) {
    return gatewayEmbed(texts, gwOpts);
  }
  const results: Float32Array[] = [];
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const slice = texts.slice(i, i + BATCH_SIZE);
    const out = await gatewayEmbed(slice, gwOpts);
    results.push(...out);
    options.onBatchComplete?.(results.length, texts.length);
  }
  return results;
}

/** Currently-configured embedding model (short form without provider prefix). */
export function getEmbeddingModelName(): string {
  return (
    gatewayGetModel().split(":").slice(1).join(":") ||
    DEFAULT_EMBEDDING_MODEL.split(":").slice(1).join(":")
  );
}

/** Currently-configured embedding dimensions. */
export function getEmbeddingDimensions(): number {
  return gatewayGetDims();
}

// Back-compat exports for tests that imported these from v0.13.
// v0.43: aligned with actual defaults from ai/defaults.ts instead of
// hardcoding the stale 'text-embedding-3-large' / 1536 values that
// no longer match the real gateway default (zeroentropyai:zembed-1 / 1280).
export { DEFAULT_EMBEDDING_MODEL as EMBEDDING_MODEL } from "./ai/defaults.ts";
export { DEFAULT_EMBEDDING_DIMENSIONS as EMBEDDING_DIMENSIONS } from "./ai/defaults.ts";

/**
 * USD cost per 1k tokens for text-embedding-3-large. Retained for back-compat
 * with callers/tests that import it directly; new cost math resolves the
 * ACTUAL configured model's rate via embedding-pricing.ts instead of assuming
 * OpenAI. (Hardcoding this rate produced cost previews that named the wrong
 * provider and over-stated spend ~2.6x when the brain ran on a cheaper model.)
 */
export const EMBEDDING_COST_PER_1K_TOKENS = 0.00013;

/**
 * Resolve the price-per-1M-tokens for the currently-configured embedding
 * model. Falls back to the OpenAI text-embedding-3-large rate only when the
 * model is unknown to the pricing table.
 */
export function currentEmbeddingPricePerMTok(): number {
  let modelString: string;
  try {
    modelString = gatewayGetModel(); // e.g. 'zeroentropyai:zembed-1'
  } catch {
    // Gateway not configured (e.g. unit tests, cost preview before connect).
    // Fall back to the OpenAI text-embedding-3-large default rate.
    return 0.13;
  }
  const hit = lookupEmbeddingPrice(modelString);
  return hit.kind === "known" ? hit.pricePerMTok : 0.13;
}

/**
 * Compute USD cost estimate for embedding `tokens` at the CURRENT configured
 * model's rate (not a hardcoded OpenAI rate).
 */
export function estimateEmbeddingCostUsd(tokens: number): number {
  return (tokens / 1_000_000) * currentEmbeddingPricePerMTok();
}

/**
 * Embedding provenance signature for the currently-configured model:
 * `<provider:model>:<dims>` (e.g. `openai:text-embedding-3-large:1536`).
 * Stamped onto `pages.embedding_signature` when a page's chunks are
 * embedded so a later model/dimension swap can be detected as stale.
 *
 * Deliberately does NOT include the chunker version — chunker drift is
 * already tracked per-page via `pages.chunker_version` (used by sync +
 * doctor). This signature is strictly about the EMBEDDING space.
 *
 * Falls back to the OpenAI default signature when the gateway is
 * unconfigured (unit-test context), matching the other estimator fallbacks.
 */
export function currentEmbeddingSignature(): string {
  try {
    return `${gatewayGetModel()}:${gatewayGetDims()}`;
  } catch {
    return `${DEFAULT_EMBEDDING_MODEL}:${DEFAULT_EMBEDDING_DIMENSIONS}`;
  }
}

/**
 * Whether a `gbrain sync --all` invocation will embed at sync time
 * ('inline') or defer embedding to per-source `embed-backfill` minion jobs
 * ('deferred'). Under federated_v2 the default path defers; the backfill
 * jobs carry their own 10-min cooldown + $25/source/24h spend cap, so the
 * sync-time cost gate only BLOCKS on the inline path. See sync.ts:2346
 * (`effectiveNoEmbed`) — this mirrors that resolution exactly.
 */
export type SyncEmbedMode = "deferred" | "inline";

/**
 * Resolve the embed mode from the same three signals sync.ts uses to
 * compute `effectiveNoEmbed`. Single source of truth so the cost gate and
 * the actual embed decision can never drift.
 *
 *   effectiveNoEmbed = v2Enabled && !serialFlag && !noEmbed ? true : noEmbed
 *
 * Embed runs INLINE iff that resolves to false:
 *   - v2 off                          → inline (legacy synchronous embed)
 *   - v2 on + --serial + !--no-embed  → inline
 *   - v2 on (parallel)                → deferred (backfill jobs)
 *   - --no-embed (any path)           → the caller skips the gate entirely;
 *                                       we report 'deferred' for completeness.
 */
export function willEmbedSynchronously(opts: {
  v2Enabled: boolean;
  serialFlag: boolean;
  noEmbed: boolean;
}): SyncEmbedMode {
  const effectiveNoEmbed =
    opts.v2Enabled && !opts.serialFlag && !opts.noEmbed ? true : opts.noEmbed;
  return effectiveNoEmbed ? "deferred" : "inline";
}

/**
 * Pure cost-gate decision. The gate BLOCKS (prompt in TTY, exit 2 envelope
 * in non-TTY) only when embed runs inline AND the estimated spend exceeds
 * the floor. Deferred mode NEVER blocks — the backfill cap is the real
 * money gate, and blocking the cheap markdown import for cost the import
 * doesn't synchronously incur is the bug this fix removes.
 */
export function shouldBlockSync(costUsd: number, floorUsd: number, mode: SyncEmbedMode): boolean {
  return mode === "inline" && costUsd > floorUsd;
}
