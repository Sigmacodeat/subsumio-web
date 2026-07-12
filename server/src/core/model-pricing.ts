/**
 * model-pricing.ts — single source of truth for paid cloud CHAT/completion
 * model pricing (USD per 1M tokens, input | output).
 *
 * Every chat-pricing site in the codebase derives its numbers from this table:
 *   - anthropic-pricing.ts          (bare-keyed Anthropic view + estimateMaxCostUsd)
 *   - takes-quality-eval/pricing.ts (curated fail-closed allowlist)
 *   - eval-contradictions/cost-tracker.ts (silent-Haiku-fallback view)
 *   - cross-modal-eval/runner.ts    (multi-provider eval panel)
 *   - skillopt/preflight.ts         (Sonnet-fallback warn-only estimate)
 * The bare-keyed `ANTHROPIC_PRICING` view is itself consumed by budget/budget-tracker.ts,
 * minions/batch-projection.ts, and cycle/budget-meter.ts — so those inherit canonical too.
 *
 * The dollar amounts live HERE ONCE — update prices in this file only. Each
 * consumer keeps its own key allowlist and miss-handling policy (fail-closed
 * vs warn-only vs null); this module owns the values, not the policy. Because
 * every other table is DERIVED from this one (not a hand-copied duplicate),
 * cross-table price drift — the kind that left Opus 4.7 at $15/$75 in one table
 * for months — is structurally impossible. test/model-pricing.test.ts pins that:
 * its "drift guard" asserts each derived view still equals canonical (a
 * regression trip-wire if anyone later re-hardcodes a view back into a duplicate)
 * and that the cross-modal panel models are all present in canonical.
 *
 * Prices verified 2026-07-11 against published provider pricing:
 *   - Anthropic: https://platform.claude.com/docs/en/about-claude/models/overview
 *   - OpenAI:    https://openai.com/api/pricing
 *   - Google:    https://ai.google.dev/gemini-api/docs/pricing
 *   - xAI:       https://x.ai/api
 *   - DeepSeek:  https://platform.deepseek.com/api_docs
 *   - Moonshot:  https://platform.moonshot.cn/docs
 * The dream-budget audit JSONL snapshots the rate per call, so historical
 * estimates stay reproducible even after this table changes.
 *
 * Scope: PAID CLOUD chat models only. Free/local providers (llama-server,
 * zero-cost rerankers) are intentionally absent — callers treat those as
 * zero-cost elsewhere. Embeddings live in embedding-pricing.ts (different unit:
 * per-MTok, char-based).
 */

import { splitProviderModelId } from "./model-id.ts";

export interface ModelPricing {
  /** USD per 1M input tokens. */
  input: number;
  /** USD per 1M output tokens. */
  output: number;
}

/**
 * Canonical price table. Keys are provider-prefixed (`provider:model`),
 * matching the exact id strings consumers pass. One physical model may carry
 * more than one key when a provider ships multiple id spellings (e.g.
 * `google:gemini-2.0-flash` plus the legacy `google:gemini-2-flash` alias) —
 * keep aliases in lockstep; the drift guard asserts they agree.
 */
export const CANONICAL_PRICING: Record<string, ModelPricing> = {
  // ── Anthropic ──────────────────────────────────────────────────────────
  // Opus 4.x: $5 in / $25 out. 4.8 (released 2026-05-28) shares 4.7's
  // per-token rate — closes gbrain#1819.
  "anthropic:claude-opus-4-8": { input: 5.0, output: 25.0 },
  "anthropic:claude-opus-4-7": { input: 5.0, output: 25.0 },
  "anthropic:claude-opus-4-6": { input: 5.0, output: 25.0 },
  "anthropic:claude-sonnet-4-6": { input: 3.0, output: 15.0 },
  // Sonnet 5 (released 2026-06-30): promo pricing $2 in / $10 out.
  "anthropic:claude-sonnet-5": { input: 2.0, output: 10.0 },
  // Fable 5: top-tier model with adaptive reasoning + Opus 4.8 fallback.
  // $10 in / $50 out — premium above Opus. Harvey LAB #1 at 16.91% all-pass.
  "anthropic:claude-fable-5": { input: 10.0, output: 50.0 },
  // Haiku 4.5 — both the dateless canonical id and the dated snapshot.
  "anthropic:claude-haiku-4-5": { input: 1.0, output: 5.0 },
  "anthropic:claude-haiku-4-5-20251001": { input: 1.0, output: 5.0 },
  "anthropic:claude-3-5-sonnet-20241022": { input: 3.0, output: 15.0 },
  "anthropic:claude-3-5-haiku-20241022": { input: 0.8, output: 4.0 },

  // ── OpenAI ─────────────────────────────────────────────────────────────
  // GPT-5: $5 in / $15 out (verified LEXam July 2026, was stale $5/$20).
  "openai:gpt-4o": { input: 2.5, output: 10.0 },
  "openai:gpt-4o-mini": { input: 0.15, output: 0.6 },
  "openai:gpt-5": { input: 5.0, output: 15.0 },
  // GPT-5.4 family (released 2026-06): BenGER 83.5, best general legal reasoning.
  // GPT-5.4: $5/$15, mini: $0.50/$2, nano: $0.25/$1.
  "openai:gpt-5.4": { input: 5.0, output: 15.0 },
  "openai:gpt-5.4-mini": { input: 0.5, output: 2.0 },
  "openai:gpt-5.4-nano": { input: 0.25, output: 1.0 },
  // GPT-5.5: $5 in / $30 out (verified July 2026, was stale $4/$16).
  // Lowest hallucination rate (3% on HAQQ). Harvey LAB 2.1% all-pass.
  "openai:gpt-5.5": { input: 5.0, output: 30.0 },

  // ── Google ─────────────────────────────────────────────────────────────
  "google:gemini-1.5-pro": { input: 1.25, output: 5.0 },
  // Gemini 3 Pro: $2.00 in / $12.00 out (verified 2026-06-20 via eesel.ai +
  // pricepertoken.com). 1M context, advanced reasoning.
  "google:gemini-3-pro": { input: 2.0, output: 12.0 },
  // Gemini 2.0 Flash: $0.10 in / $0.40 out (verified 2026-06-03). Reconciled
  // from a stale $0.30/$1.20 entry that had drifted in takes-quality-eval.
  // `gemini-2-flash` kept as an alias for the legacy id spelling.
  "google:gemini-2.0-flash": { input: 0.1, output: 0.4 },
  "google:gemini-2-flash": { input: 0.1, output: 0.4 },

  // ── Together / DeepSeek ───────────────────────────────────────────────
  // DeepSeek V3.2: $0.14/$0.28, LEXam 57.42 (best open-weight legal model).
  // V3.2 deprecated July 2026 — replaced by V4 Flash/Pro at same pricing.
  "together:meta-llama/Llama-3.3-70B-Instruct-Turbo": { input: 0.88, output: 0.88 },
  "deepseek:deepseek-chat": { input: 0.14, output: 0.28 },
  "deepseek:deepseek-v3.2": { input: 0.14, output: 0.28 },
  "deepseek:deepseek-v3.2-exp": { input: 0.14, output: 0.28 },
  "deepseek:deepseek-reasoner": { input: 0.14, output: 0.28 },
  // DeepSeek V4 family (released July 2026): same $0.14/$0.28 pricing.
  // V4 Pro: BenGER 76.1, V4 Flash: BenGER 71.3 — best open-weight legal scores.
  "deepseek:deepseek-v4-flash": { input: 0.14, output: 0.28 },
  "deepseek:deepseek-v4-pro": { input: 0.14, output: 0.28 },

  // ── Mistral (EU-hosted, GDPR-compliant) ────────────────────────────────
  // Verified 2026-06-20 via docsbot.ai + llmcosthub.com + tickerr.ai.
  // Large 3: 128B dense, 256K context, EU data residency.
  // Small 3.2: budget tier, 32K context, cheapest EU-compliant model.
  "mistral:mistral-large-3": { input: 0.5, output: 1.5 },
  "mistral:mistral-small-3.2": { input: 0.1, output: 0.3 },
  "mistral:mistral-medium-3.5": { input: 0.4, output: 1.2 },

  // ── xAI (Grok) — fast reasoning, 2M context ────────────────────────────
  // Grok 4.3: $1.25 in / $2.50 out (verified 2026-07-11 via x.ai/api).
  // HAQQ 29.0 (98% of Opus 4.8), $0.003/task, 8.8s — best speed-to-quality.
  // Was stale $0.20/$0.50 — corrected after audit found 6.25x/5x underpricing.
  "xai:grok-4.3": { input: 1.25, output: 2.5 },
  // Grok 4.1: same tier as 4.3, earlier version.
  "xai:grok-4.1": { input: 1.25, output: 2.5 },
  // Grok 4.1 Fast: budget variant, kept at $0.20/$0.50 (fast-tier pricing).
  "xai:grok-4.1-fast": { input: 0.2, output: 0.5 },
  // Grok 4: $3 in / $15 out (verified 2026-07-11). Was stale $0.20/$0.50.
  "xai:grok-4": { input: 3.0, output: 15.0 },
  // Grok 4.5: $2 in / $6 out (verified 2026-07-11). Harvey LAB-AA 13.3%.
  "xai:grok-4.5": { input: 2.0, output: 6.0 },

  // ── Cohere — RAG with native citations ──────────────────────────────────
  // Verified 2026-06-10 via aipricing.guru + costbench.com.
  // Command R+ 08-2024: flagship chat with built-in citation generation.
  "cohere:command-r-plus-08-2024": { input: 2.5, output: 10.0 },
  "cohere:command-r-08-2024": { input: 0.15, output: 0.6 },
  "cohere:command-r7b-12-2024": { input: 0.037, output: 0.144 },

  // ── Moonshot AI (Kimi) — 1T MoE, long context ──────────────────────────
  // K2.6: $0.95 in / $4 out (verified 2026-07-11). Was stale $0.60/$2.50.
  "moonshot:kimi-k2.6": { input: 0.95, output: 4.0 },
  "moonshot:kimi-k2.7-code": { input: 0.95, output: 4.0 },
  "moonshot:moonshot-v1-128k": { input: 0.8, output: 3.2 },
  "moonshot:moonshot-v1-32k": { input: 0.4, output: 1.6 },

  // ── Groq — LPU inference, ultra-fast ───────────────────────────────────
  // Verified 2026-06-28 via groq.com/pricing + klymentiev.com.
  "groq:llama-4-scout-17b-16e": { input: 0.11, output: 0.34 },
  "groq:llama-4-maverick-17b-128e": { input: 0.5, output: 0.77 },
  "groq:llama-3.3-70b-versatile": { input: 0.59, output: 0.79 },
  "groq:llama-3.1-8b-instant": { input: 0.05, output: 0.08 },
  "groq:gpt-oss-120b": { input: 0.15, output: 0.6 },
  "groq:gpt-oss-20b": { input: 0.075, output: 0.3 },
  "groq:qwen3-32b": { input: 0.29, output: 0.59 },
  "groq:kimi-k2": { input: 1.0, output: 3.0 },

  // ── Zhipu AI (GLM) — Chinese+English multilingual ──────────────────────
  // Verified 2026-06-28 via morphllm.com.
  "zhipu:glm-4.7": { input: 1.4, output: 4.4 },
  "zhipu:glm-4.5": { input: 1.0, output: 3.0 },
  "zhipu:glm-4-plus": { input: 1.0, output: 3.0 },
  "zhipu:glm-4-flash": { input: 0.1, output: 0.3 },
};

/**
 * Resolve a model id to its canonical pricing, or `undefined` on miss.
 *
 * Accepts bare (`claude-opus-4-8`), colon (`anthropic:claude-opus-4-8`), and
 * slash (`anthropic/claude-opus-4-8`) forms. Bare ids default to the
 * `anthropic:` provider (matching the historical bare-key Anthropic tables);
 * non-Anthropic bare ids therefore miss, preserving the prior null-return
 * contract for ids like `gpt-5`.
 *
 * Nested OpenRouter ids (`openrouter:anthropic/claude-...`) intentionally MISS:
 * splitProviderModelId yields provider `openrouter`, model
 * `anthropic/claude-...`, and `openrouter:anthropic/claude-...` is not a
 * canonical key. OpenRouter markup ≠ native pricing, so we never reprice it as
 * the inner vendor.
 */
export function canonicalLookup(modelId: string | null | undefined): ModelPricing | undefined {
  if (!modelId) return undefined;
  // 1. Exact key — colon form, already-canonical ids, and slash-bearing model
  //    tails carried verbatim as keys (e.g. together:.../Llama-3.3-70B-...).
  const direct = CANONICAL_PRICING[modelId];
  if (direct) return direct;
  // 2. Normalize bare/slash via the shared splitter (colon-first precedence).
  const { provider, model } = splitProviderModelId(modelId);
  if (!model) return undefined;
  const key = provider ? `${provider}:${model}` : `anthropic:${model}`;
  return CANONICAL_PRICING[key];
}
