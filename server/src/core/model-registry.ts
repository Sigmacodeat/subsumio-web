/**
 * EPIC 8 — T8.1 Model Capability Registry
 *
 * Unified registry combining pricing, capabilities, compliance, and routing
 * metadata for every model the platform can route to. Replaces the scattered
 * model metadata across model-config.ts, model-pricing.ts, capabilities.ts,
 * and the frontend AI_MODELS array.
 *
 * KEY INVARIANTS:
 *   - No silent fallback to a model with lower compliance or capability.
 *   - deepseek-chat is explicitly mapped to V4-flash, not a generic alias.
 *   - Every model in TIER_DEFAULTS must exist in the registry.
 *   - Deprecated/retired models cannot be resolved for new sessions.
 */

import { createHash } from "node:crypto";
import { CANONICAL_PRICING, type ModelPricing } from "./model-pricing.ts";
import { splitProviderModelId } from "./model-id.ts";
import {
  BEDROCK_EU_MODELS,
  BEDROCK_EU_SOURCE_REGIONS,
  bedrockRoutingScope,
  resolveBedrockRegion,
} from "./ai/bedrock-config.ts";

// ── Types ──────────────────────────────────────────────────────────────

export type ModelTier = "utility" | "reasoning" | "deep" | "subagent";

export type ModelStatus = "active" | "deprecated" | "retired";

export type DataResidency = "eu" | "non_eu";

export interface ModelCapabilityEntry {
  /** Stable provider:model identifier. */
  id: string;
  /** Human-readable display name. */
  display_name: string;
  /** Provider prefix: anthropic, openai, openrouter, deepseek, etc. */
  provider: string;
  /** Model snapshot/version tag for audit trail. */
  snapshot: string;
  /** Max input + output tokens per turn. */
  context_window: number;
  /** Supports native tool/function calling. */
  supports_tools: boolean;
  /** Supports structured JSON output mode. */
  supports_json: boolean;
  /** Supports extended thinking / reasoning blocks. */
  supports_thinking: boolean;
  /** Supports vision/image input. */
  supports_vision: boolean;
  /** Supports Anthropic-style prompt caching. */
  supports_prompt_caching: boolean;
  /** Data residency: EU-hosted infrastructure or not. */
  data_residency: DataResidency;
  /** Zero Data Retention — provider does not persist request data. */
  zdr: boolean;
  /** USD per 1M input/output tokens. */
  pricing: ModelPricing;
  /** Default tier for routing. */
  tier: ModelTier;
  /** Lifecycle status. */
  status: ModelStatus;
  /** If deprecated/retired, the replacement model id. */
  deprecated_by?: string;
  /** When this entry was added to the registry. */
  registered_at: string;
}

export type FallbackReason =
  | "lower_capability"
  | "lower_compliance"
  | "lower_residency"
  | "no_zdr"
  | "retired"
  | "deprecated"
  | "unknown_model"
  | "no_pricing";

export interface FallbackAssessment {
  allowed: boolean;
  reason?: FallbackReason;
  detail: string;
}

export interface ResolveModelOpts {
  /** Requested model id (provider:model). */
  modelId: string;
  /** Fallback model id if the requested model is unavailable. */
  fallbackId?: string;
  /** Org model policy. */
  policy?: "any" | "eu_only";
  /** Require ZDR compliance. */
  requireZdr?: boolean;
  /** Require tool support. */
  requireTools?: boolean;
  /** Require JSON mode. */
  requireJson?: boolean;
  /** Require thinking/reasoning. */
  requireThinking?: boolean;
}

export interface ResolvedModel {
  modelId: string;
  entry: ModelCapabilityEntry;
  usedFallback: boolean;
  fallbackAssessment?: FallbackAssessment;
}

// ── Data residency (single source of truth) ────────────────────────────
//
// Where a provider processes a request. This table is the ONE place residency
// is decided: registry entries derive `data_residency` from it, and the
// gateway's EU-only switch (src/core/ai/eu-policy.ts) enforces it on every
// chat / completion / stream / expansion / embedding / rerank / transcription
// call. "eu" means EU/EEA processing that is documented for the configured
// route — not "EU company" and not "legal-domain focus".
//
//   fixed     — the provider's own API has one answer.
//   attested  — the provider CAN run in the EU (Azure EU region, OpenRouter
//               EU enterprise routing, a self-hosted server in Vienna), but the
//               code cannot see it. The operator attests with <envVar>=eu;
//               default non_eu.
//   bedrock   — derived from AWS_REGION and the model id (`eu.` inference
//               profile, or an in-region id called in an EU region).
//
// Unknown providers are non_eu (fail-closed). A new recipe without an entry
// here fails test/ai/eu-policy.test.ts.

export type ResidencyRule =
  | { kind: "fixed"; residency: DataResidency; basis: string }
  | { kind: "attested"; envVar: string; basis: string }
  | { kind: "bedrock"; basis: string };

export const PROVIDER_RESIDENCY: Readonly<Record<string, ResidencyRule>> = {
  bedrock: {
    kind: "bedrock",
    basis:
      "Amazon Bedrock: EU only for eu.* inference profiles or in-region ids in an EU member-state region",
  },
  mistral: {
    kind: "fixed",
    residency: "eu",
    basis: "Mistral La Plateforme (api.mistral.ai) is hosted in the EU",
  },
  "azure-openai": {
    kind: "attested",
    envVar: "SUBSUMIO_AZURE_OPENAI_RESIDENCY",
    basis: "Azure OpenAI: EU only when the resource/deployment is in an EU region (Data Zone EU)",
  },
  openrouter: {
    kind: "attested",
    envVar: "SUBSUMIO_OPENROUTER_RESIDENCY",
    basis: "OpenRouter: EU in-region routing exists only for enterprise accounts",
  },
  litellm: {
    kind: "attested",
    envVar: "SUBSUMIO_LITELLM_RESIDENCY",
    basis: "LiteLLM proxy: residency is whatever backend the proxy forwards to",
  },
  ollama: {
    kind: "attested",
    envVar: "SUBSUMIO_SELF_HOSTED_RESIDENCY",
    basis: "Self-hosted Ollama: EU only if the server runs in the EU",
  },
  "llama-server": {
    kind: "attested",
    envVar: "SUBSUMIO_SELF_HOSTED_RESIDENCY",
    basis: "Self-hosted llama.cpp server: EU only if the server runs in the EU",
  },
  "llama-server-reranker": {
    kind: "attested",
    envVar: "SUBSUMIO_SELF_HOSTED_RESIDENCY",
    basis: "Self-hosted llama.cpp reranker: EU only if the server runs in the EU",
  },
  anthropic: {
    kind: "fixed",
    residency: "non_eu",
    basis: "Anthropic API: inference_geo offers only us/global, no EU processing",
  },
  openai: { kind: "fixed", residency: "non_eu", basis: "OpenAI API (api.openai.com)" },
  google: { kind: "fixed", residency: "non_eu", basis: "Google Gemini API (global)" },
  deepseek: { kind: "fixed", residency: "non_eu", basis: "DeepSeek API (China)" },
  groq: { kind: "fixed", residency: "non_eu", basis: "Groq API (US)" },
  together: { kind: "fixed", residency: "non_eu", basis: "Together AI (US)" },
  voyage: { kind: "fixed", residency: "non_eu", basis: "Voyage AI (US)" },
  zeroentropyai: { kind: "fixed", residency: "non_eu", basis: "ZeroEntropy API (US)" },
  "zero-entropy": { kind: "fixed", residency: "non_eu", basis: "ZeroEntropy API (US)" },
  dashscope: { kind: "fixed", residency: "non_eu", basis: "Alibaba DashScope" },
  zhipu: { kind: "fixed", residency: "non_eu", basis: "Zhipu AI (China)" },
  minimax: { kind: "fixed", residency: "non_eu", basis: "MiniMax" },
  xai: { kind: "fixed", residency: "non_eu", basis: "xAI API (US)" },
  cohere: { kind: "fixed", residency: "non_eu", basis: "Cohere API" },
  moonshot: { kind: "fixed", residency: "non_eu", basis: "Moonshot AI (China)" },
  deepgram: { kind: "fixed", residency: "non_eu", basis: "Deepgram API (US)" },
};

export interface ResidencyVerdict {
  provider: string;
  residency: DataResidency;
  /** Human-readable reason, used verbatim in refusal messages. */
  basis: string;
}

/**
 * Classify one call target. `modelId` is the part after `provider:` (only
 * Bedrock looks at it). `env` is the gateway env snapshot.
 */
export function resolveProviderResidency(
  providerId: string,
  modelId: string,
  env: Record<string, string | undefined>
): ResidencyVerdict {
  const provider = providerId.trim().toLowerCase();
  const rule = PROVIDER_RESIDENCY[provider];
  if (!rule) {
    return {
      provider,
      residency: "non_eu",
      basis: `unknown provider "${provider}" — not classified, treated as non-EU`,
    };
  }
  if (rule.kind === "fixed") return { provider, residency: rule.residency, basis: rule.basis };
  if (rule.kind === "attested") {
    const attested = (env[rule.envVar] ?? "").trim().toLowerCase() === "eu";
    return {
      provider,
      residency: attested ? "eu" : "non_eu",
      basis: attested
        ? `${rule.basis} — attested via ${rule.envVar}=eu`
        : `${rule.basis} — not attested (${rule.envVar} is not "eu")`,
    };
  }
  // Bedrock
  const region = resolveBedrockRegion(env);
  const scope = bedrockRoutingScope(modelId);
  const regionIsEu = BEDROCK_EU_SOURCE_REGIONS.has(region);
  if (!regionIsEu) {
    return {
      provider,
      residency: "non_eu",
      basis: `Amazon Bedrock region ${region} is not an EU member-state region`,
    };
  }
  if (scope.kind === "in_region") {
    return { provider, residency: "eu", basis: `Amazon Bedrock in-region call in ${region}` };
  }
  if (scope.kind === "geo" && scope.geo === "eu") {
    return {
      provider,
      residency: "eu",
      basis: `Amazon Bedrock EU inference profile called from ${region}`,
    };
  }
  return {
    provider,
    residency: "non_eu",
    basis:
      scope.kind === "geo"
        ? `Amazon Bedrock "${scope.geo}." inference profile routes outside the EU`
        : `Amazon Bedrock model id "${modelId}" is not an eu.* inference profile`,
  };
}

// ── Registry ───────────────────────────────────────────────────────────

/**
 * The canonical model capability registry. Each entry merges:
 *   - Pricing from CANONICAL_PRICING
 *   - Capabilities from recipes (manually mapped here for the production set)
 *   - Compliance metadata (data_residency, zdr)
 *   - Lifecycle status
 *
 * When adding a new model:
 *   1. Add pricing to CANONICAL_PRICING in model-pricing.ts
 *   2. Add the entry here with all capability flags
 *   3. Add a test in model-registry.test.ts
 */
const REGISTRY: Map<string, ModelCapabilityEntry> = new Map();

/**
 * `data_residency` is never written per model: it is derived from the
 * provider classification below (PROVIDER_RESIDENCY) with an empty env, i.e.
 * the conservative default. Runtime enforcement (SUBSUMIO_EU_ONLY, see
 * src/core/ai/eu-policy.ts) re-evaluates the same rule against the live env,
 * so an operator attestation (Azure EU endpoint, OpenRouter EU enterprise) or a
 * non-EU AWS_REGION is honoured there.
 */
function register(entry: Omit<ModelCapabilityEntry, "registered_at" | "data_residency">): void {
  const { model } = splitProviderModelId(entry.id);
  const data_residency = resolveProviderResidency(entry.provider, model ?? entry.id, {}).residency;
  REGISTRY.set(entry.id, { ...entry, data_residency, registered_at: "2026-07-13T00:00:00Z" });
}

// ── Anthropic ──────────────────────────────────────────────────────────

register({
  id: "anthropic:claude-opus-4-8",
  display_name: "Claude Opus 4.8",
  provider: "anthropic",
  snapshot: "2026-05-28",
  context_window: 200_000,
  supports_tools: true,
  supports_json: true,
  supports_thinking: true,
  supports_vision: true,
  supports_prompt_caching: true,
  zdr: false,
  pricing: CANONICAL_PRICING["anthropic:claude-opus-4-8"] ?? { input: 5, output: 25 },
  tier: "deep",
  status: "active",
});

register({
  id: "anthropic:claude-opus-4-7",
  display_name: "Claude Opus 4.7",
  provider: "anthropic",
  snapshot: "2026-03-15",
  context_window: 200_000,
  supports_tools: true,
  supports_json: true,
  supports_thinking: true,
  supports_vision: true,
  supports_prompt_caching: true,
  zdr: false,
  pricing: CANONICAL_PRICING["anthropic:claude-opus-4-7"] ?? { input: 5, output: 25 },
  tier: "deep",
  status: "deprecated",
  deprecated_by: "anthropic:claude-opus-4-8",
});

register({
  id: "anthropic:claude-sonnet-4-6",
  display_name: "Claude Sonnet 4.6",
  provider: "anthropic",
  snapshot: "2026-02-20",
  context_window: 200_000,
  supports_tools: true,
  supports_json: true,
  supports_thinking: true,
  supports_vision: true,
  supports_prompt_caching: true,
  zdr: false,
  pricing: CANONICAL_PRICING["anthropic:claude-sonnet-4-6"] ?? { input: 3, output: 15 },
  tier: "reasoning",
  status: "active",
});

register({
  id: "anthropic:claude-sonnet-5",
  display_name: "Claude Sonnet 5",
  provider: "anthropic",
  snapshot: "2026-06-30",
  context_window: 200_000,
  supports_tools: true,
  supports_json: true,
  supports_thinking: true,
  supports_vision: true,
  supports_prompt_caching: true,
  zdr: false,
  pricing: CANONICAL_PRICING["anthropic:claude-sonnet-5"] ?? { input: 2, output: 10 },
  tier: "reasoning",
  status: "active",
});

register({
  id: "anthropic:claude-haiku-4-5",
  display_name: "Claude Haiku 4.5",
  provider: "anthropic",
  snapshot: "2025-10-01",
  context_window: 200_000,
  supports_tools: true,
  supports_json: true,
  supports_thinking: false,
  supports_vision: true,
  supports_prompt_caching: true,
  zdr: false,
  pricing: CANONICAL_PRICING["anthropic:claude-haiku-4-5"] ?? { input: 1, output: 5 },
  tier: "subagent",
  status: "active",
});

register({
  id: "anthropic:claude-haiku-4-5-20251001",
  display_name: "Claude Haiku 4.5 (dated snapshot)",
  provider: "anthropic",
  snapshot: "2025-10-01",
  context_window: 200_000,
  supports_tools: true,
  supports_json: true,
  supports_thinking: false,
  supports_vision: true,
  supports_prompt_caching: true,
  zdr: false,
  pricing: CANONICAL_PRICING["anthropic:claude-haiku-4-5-20251001"] ?? { input: 1, output: 5 },
  tier: "subagent",
  status: "active",
});

// ── Amazon Bedrock (Claude, EU inference profiles) ─────────────────────

register({
  id: `bedrock:${BEDROCK_EU_MODELS.haiku45}`,
  display_name: "Claude Haiku 4.5 (Bedrock EU)",
  provider: "bedrock",
  snapshot: "2025-10-01",
  context_window: 200_000,
  supports_tools: true,
  supports_json: true,
  supports_thinking: false,
  supports_vision: true,
  supports_prompt_caching: true,
  zdr: false,
  pricing: CANONICAL_PRICING[`bedrock:${BEDROCK_EU_MODELS.haiku45}`] ?? { input: 1.1, output: 5.5 },
  tier: "utility",
  status: "active",
});

register({
  id: `bedrock:${BEDROCK_EU_MODELS.sonnet5}`,
  display_name: "Claude Sonnet 5 (Bedrock EU)",
  provider: "bedrock",
  snapshot: "2026-06-30",
  context_window: 1_000_000,
  supports_tools: true,
  supports_json: true,
  supports_thinking: true,
  supports_vision: true,
  supports_prompt_caching: true,
  zdr: false,
  pricing: CANONICAL_PRICING[`bedrock:${BEDROCK_EU_MODELS.sonnet5}`] ?? { input: 2.2, output: 11 },
  tier: "reasoning",
  status: "active",
});

register({
  id: `bedrock:${BEDROCK_EU_MODELS.opus5}`,
  display_name: "Claude Opus 5 (Bedrock EU)",
  provider: "bedrock",
  snapshot: "2026-07-24",
  context_window: 1_000_000,
  supports_tools: true,
  supports_json: true,
  supports_thinking: true,
  supports_vision: true,
  supports_prompt_caching: true,
  zdr: false,
  pricing: CANONICAL_PRICING[`bedrock:${BEDROCK_EU_MODELS.opus5}`] ?? { input: 5.5, output: 27.5 },
  tier: "deep",
  status: "active",
});

// ── OpenAI ─────────────────────────────────────────────────────────────

register({
  id: "openai:gpt-5",
  display_name: "GPT-5",
  provider: "openai",
  snapshot: "2026-03-01",
  context_window: 200_000,
  supports_tools: true,
  supports_json: true,
  supports_thinking: false,
  supports_vision: true,
  supports_prompt_caching: false,
  zdr: false,
  pricing: CANONICAL_PRICING["openai:gpt-5"] ?? { input: 5, output: 15 },
  tier: "reasoning",
  status: "active",
});

register({
  id: "openai:gpt-5.5",
  display_name: "GPT-5.5",
  provider: "openai",
  snapshot: "2026-06-15",
  context_window: 200_000,
  supports_tools: true,
  supports_json: true,
  supports_thinking: false,
  supports_vision: true,
  supports_prompt_caching: false,
  zdr: false,
  pricing: CANONICAL_PRICING["openai:gpt-5.5"] ?? { input: 4, output: 16 },
  tier: "reasoning",
  status: "active",
});

register({
  id: "openai:gpt-4o",
  display_name: "GPT-4o",
  provider: "openai",
  snapshot: "2024-08-01",
  context_window: 128_000,
  supports_tools: true,
  supports_json: true,
  supports_thinking: false,
  supports_vision: true,
  supports_prompt_caching: false,
  zdr: false,
  pricing: CANONICAL_PRICING["openai:gpt-4o"] ?? { input: 2.5, output: 10 },
  tier: "reasoning",
  status: "active",
});

register({
  id: "openai:gpt-4o-mini",
  display_name: "GPT-4o mini",
  provider: "openai",
  snapshot: "2024-07-18",
  context_window: 128_000,
  supports_tools: true,
  supports_json: true,
  supports_thinking: false,
  supports_vision: true,
  supports_prompt_caching: false,
  zdr: false,
  pricing: CANONICAL_PRICING["openai:gpt-4o-mini"] ?? { input: 0.15, output: 0.6 },
  tier: "utility",
  status: "active",
});

// ── Google ─────────────────────────────────────────────────────────────

register({
  id: "google:gemini-3-pro",
  display_name: "Gemini 3 Pro",
  provider: "google",
  snapshot: "2026-04-01",
  context_window: 1_000_000,
  supports_tools: true,
  supports_json: true,
  supports_thinking: false,
  supports_vision: true,
  supports_prompt_caching: false,
  zdr: false,
  pricing: CANONICAL_PRICING["google:gemini-3-pro"] ?? { input: 2, output: 12 },
  tier: "reasoning",
  status: "active",
});

register({
  id: "google:gemini-2.0-flash",
  display_name: "Gemini 2.0 Flash",
  provider: "google",
  snapshot: "2025-08-01",
  context_window: 1_000_000,
  supports_tools: true,
  supports_json: true,
  supports_thinking: false,
  supports_vision: true,
  supports_prompt_caching: false,
  zdr: false,
  pricing: CANONICAL_PRICING["google:gemini-2.0-flash"] ?? { input: 0.1, output: 0.4 },
  tier: "utility",
  status: "active",
});

// ── DeepSeek (via OpenRouter) ──────────────────────────────────────────
// T8.1 requirement: deepseek-chat is explicitly mapped to V4-flash.
// The alias "deepseek:deepseek-chat" resolves to the V4-flash snapshot
// — no silent fallback to an older or lower-capability model.

register({
  id: "openrouter:deepseek/deepseek-chat",
  display_name: "DeepSeek V4 Flash",
  provider: "openrouter",
  snapshot: "v4-flash-2026-07",
  context_window: 128_000,
  supports_tools: true,
  supports_json: true,
  supports_thinking: false,
  supports_vision: false,
  supports_prompt_caching: false,
  zdr: false,
  pricing: CANONICAL_PRICING["openrouter:deepseek/deepseek-chat"] ?? { input: 0.14, output: 0.28 },
  tier: "utility",
  status: "active",
});

register({
  id: "deepseek:deepseek-chat",
  display_name: "DeepSeek V4 Flash (direct)",
  provider: "deepseek",
  snapshot: "v4-flash-2026-07",
  context_window: 128_000,
  supports_tools: true,
  supports_json: true,
  supports_thinking: false,
  supports_vision: false,
  supports_prompt_caching: false,
  zdr: false,
  pricing: CANONICAL_PRICING["deepseek:deepseek-chat"] ?? { input: 0.14, output: 0.28 },
  tier: "utility",
  status: "active",
});

register({
  id: "openrouter:deepseek/deepseek-reasoner",
  display_name: "DeepSeek V4 Flash Reasoner",
  provider: "openrouter",
  snapshot: "v4-flash-reasoner-2026-07",
  context_window: 128_000,
  supports_tools: true,
  supports_json: true,
  supports_thinking: true,
  supports_vision: false,
  supports_prompt_caching: false,
  zdr: false,
  pricing: CANONICAL_PRICING["openrouter:deepseek/deepseek-reasoner"] ?? {
    input: 0.14,
    output: 0.28,
  },
  tier: "reasoning",
  status: "active",
});

// ── xAI (Grok) ─────────────────────────────────────────────────────────

register({
  id: "openrouter:xai/grok-4.3",
  display_name: "Grok 4.3",
  provider: "openrouter",
  snapshot: "2026-06-01",
  context_window: 256_000,
  supports_tools: true,
  supports_json: true,
  supports_thinking: false,
  supports_vision: false,
  supports_prompt_caching: false,
  zdr: false,
  pricing: CANONICAL_PRICING["openrouter:xai/grok-4.3"] ?? { input: 1.25, output: 2.5 },
  tier: "deep",
  status: "active",
});

register({
  id: "xai:grok-4.3",
  display_name: "Grok 4.3 (direct)",
  provider: "xai",
  snapshot: "2026-06-01",
  context_window: 256_000,
  supports_tools: true,
  supports_json: true,
  supports_thinking: false,
  supports_vision: false,
  supports_prompt_caching: false,
  zdr: false,
  pricing: CANONICAL_PRICING["xai:grok-4.3"] ?? { input: 1.25, output: 2.5 },
  tier: "deep",
  status: "active",
});

// ── Mistral (EU-hosted) ────────────────────────────────────────────────

register({
  id: "mistral:mistral-large-3",
  display_name: "Mistral Large 3",
  provider: "mistral",
  snapshot: "2026-05-01",
  context_window: 256_000,
  supports_tools: true,
  supports_json: true,
  supports_thinking: false,
  supports_vision: true,
  supports_prompt_caching: false,
  zdr: false,
  pricing: CANONICAL_PRICING["mistral:mistral-large-3"] ?? { input: 0.5, output: 1.5 },
  tier: "reasoning",
  status: "active",
});

register({
  id: "mistral:mistral-small-3.2",
  display_name: "Mistral Small 3.2",
  provider: "mistral",
  snapshot: "2026-04-01",
  context_window: 128_000,
  supports_tools: true,
  supports_json: true,
  supports_thinking: false,
  supports_vision: false,
  supports_prompt_caching: false,
  zdr: false,
  pricing: CANONICAL_PRICING["mistral:mistral-small-3.2"] ?? { input: 0.1, output: 0.3 },
  tier: "utility",
  status: "active",
});

// ── Cohere ─────────────────────────────────────────────────────────────

register({
  id: "cohere:command-r-plus-08-2024",
  display_name: "Cohere Command R+",
  provider: "cohere",
  snapshot: "2024-08-01",
  context_window: 128_000,
  supports_tools: true,
  supports_json: true,
  supports_thinking: false,
  supports_vision: false,
  supports_prompt_caching: false,
  zdr: false,
  pricing: CANONICAL_PRICING["cohere:command-r-plus-08-2024"] ?? { input: 2.5, output: 10 },
  tier: "reasoning",
  status: "active",
});

// ── Moonshot (Kimi) ────────────────────────────────────────────────────

register({
  id: "moonshot:kimi-k2.6",
  display_name: "Kimi K2.6",
  provider: "moonshot",
  snapshot: "2026-05-01",
  context_window: 256_000,
  supports_tools: true,
  supports_json: true,
  supports_thinking: false,
  supports_vision: false,
  supports_prompt_caching: false,
  zdr: false,
  pricing: CANONICAL_PRICING["moonshot:kimi-k2.6"] ?? { input: 0.6, output: 2.5 },
  tier: "reasoning",
  status: "active",
});

// ── Groq ───────────────────────────────────────────────────────────────

register({
  id: "groq:llama-4-scout-17b-16e",
  display_name: "Llama 4 Scout (Groq)",
  provider: "groq",
  snapshot: "2026-04-01",
  context_window: 128_000,
  supports_tools: true,
  supports_json: true,
  supports_thinking: false,
  supports_vision: false,
  supports_prompt_caching: false,
  zdr: false,
  pricing: CANONICAL_PRICING["groq:llama-4-scout-17b-16e"] ?? { input: 0.11, output: 0.34 },
  tier: "utility",
  status: "active",
});

register({
  id: "groq:qwen3-32b",
  display_name: "Qwen3 32B (Groq)",
  provider: "groq",
  snapshot: "2026-05-01",
  context_window: 128_000,
  supports_tools: true,
  supports_json: true,
  supports_thinking: false,
  supports_vision: false,
  supports_prompt_caching: false,
  zdr: false,
  pricing: CANONICAL_PRICING["groq:qwen3-32b"] ?? { input: 0.11, output: 0.34 },
  tier: "utility",
  status: "active",
});

// ── Zhipu ──────────────────────────────────────────────────────────────

register({
  id: "zhipu:glm-4.7",
  display_name: "GLM-4.7",
  provider: "zhipu",
  snapshot: "2026-06-01",
  context_window: 128_000,
  supports_tools: true,
  supports_json: true,
  supports_thinking: false,
  supports_vision: false,
  supports_prompt_caching: false,
  zdr: false,
  pricing: CANONICAL_PRICING["zhipu:glm-4.7"] ?? { input: 0.5, output: 1.5 },
  tier: "reasoning",
  status: "active",
});

// ── ZeroEntropy ────────────────────────────────────────────────────────

register({
  id: "zero-entropy:legal-v1",
  display_name: "ZeroEntropy Legal v1",
  provider: "zero-entropy",
  snapshot: "2026-03-01",
  context_window: 64_000,
  supports_tools: false,
  supports_json: false,
  supports_thinking: false,
  supports_vision: false,
  supports_prompt_caching: false,
  zdr: false,
  pricing: CANONICAL_PRICING["zero-entropy:legal-v1"] ?? { input: 0.5, output: 1.5 },
  tier: "utility",
  status: "active",
});

// ── Alias Resolution ───────────────────────────────────────────────────

/**
 * Alias map for short model names. Resolves to the canonical registry id.
 * T8.1: deepseek-chat explicitly maps to the V4-flash route.
 */
const ALIASES: Record<string, string> = {
  opus: "anthropic:claude-opus-4-8",
  sonnet: "anthropic:claude-sonnet-4-6",
  haiku: "anthropic:claude-haiku-4-5-20251001",
  gemini: "google:gemini-3-pro",
  gpt: "openai:gpt-5",
  "gpt-5": "openai:gpt-5",
  "gpt-5.5": "openai:gpt-5.5",
  "gpt-4o": "openai:gpt-4o",
  "gpt-4o-mini": "openai:gpt-4o-mini",
  // T8.1: explicit V4 route — no silent fallback to older models
  "deepseek-chat": "openrouter:deepseek/deepseek-chat",
  deepseek: "openrouter:deepseek/deepseek-chat",
  "deepseek-reasoner": "openrouter:deepseek/deepseek-reasoner",
  "deepseek:deepseek-chat": "deepseek:deepseek-chat",
  mistral: "mistral:mistral-large-3",
  "mistral-small": "mistral:mistral-small-3.2",
  grok: "xai:grok-4.3",
  "grok-4.3": "xai:grok-4.3",
  "grok-fast": "xai:grok-4.1-fast",
  cohere: "cohere:command-r-plus-08-2024",
  kimi: "moonshot:kimi-k2.6",
  llama4: "groq:llama-4-scout-17b-16e",
  qwen3: "groq:qwen3-32b",
  glm: "zhipu:glm-4.7",
};

/**
 * Resolve a model id or alias to the canonical registry id.
 * Tries: exact registry lookup → alias map → provider:model split.
 */
export function resolveModelId(input: string): string {
  // Direct registry hit
  if (REGISTRY.has(input)) return input;

  // Alias lookup
  const aliased = ALIASES[input];
  if (aliased) return aliased;

  // Try provider:model → openrouter:deepseek/deepseek-chat
  const { provider, model } = splitProviderModelId(input);
  if (provider && model) {
    // Check if the full string is in the registry via alias
    const aliasKey = `${provider}:${model}`;
    if (REGISTRY.has(aliasKey)) return aliasKey;

    // Try the alias map with the full string
    const fullAlias = ALIASES[aliasKey];
    if (fullAlias) return fullAlias;
  }

  // Unknown — return as-is so caller can decide
  return input;
}

// ── Public API ─────────────────────────────────────────────────────────

/**
 * Get a model entry from the registry. Returns undefined if not found.
 */
export function getModelEntry(modelId: string): ModelCapabilityEntry | undefined {
  const resolved = resolveModelId(modelId);
  return REGISTRY.get(resolved);
}

/**
 * Check if a model exists in the registry.
 */
export function isRegisteredModel(modelId: string): boolean {
  return getModelEntry(modelId) !== undefined;
}

/**
 * List all registered models, optionally filtered by tier or status.
 */
export function listModels(opts?: {
  tier?: ModelTier;
  status?: ModelStatus;
  provider?: string;
}): ModelCapabilityEntry[] {
  let entries = [...REGISTRY.values()];
  if (opts?.tier) entries = entries.filter((e) => e.tier === opts.tier);
  if (opts?.status) entries = entries.filter((e) => e.status === opts.status);
  if (opts?.provider) entries = entries.filter((e) => e.provider === opts.provider);
  return entries.sort((a, b) => a.display_name.localeCompare(b.display_name));
}

/**
 * List all models for a given policy (eu_only or any).
 */
export function modelsForPolicy(policy: "any" | "eu_only"): ModelCapabilityEntry[] {
  return listModels({ status: "active" }).filter(
    (m) => policy !== "eu_only" || m.data_residency === "eu"
  );
}

/**
 * Assess whether a fallback from `primaryId` to `fallbackId` is allowed.
 *
 * T8.1 KEY INVARIANT: No silent fallback to a model with lower compliance
 * or capability. This function returns a FallbackAssessment that the caller
 * MUST check before switching models.
 */
export function assessFallback(
  primaryId: string,
  fallbackId: string,
  opts?: { requireZdr?: boolean; requireTools?: boolean }
): FallbackAssessment {
  const primary = getModelEntry(primaryId);
  const fallback = getModelEntry(fallbackId);

  if (!fallback) {
    return {
      allowed: false,
      reason: "unknown_model",
      detail: `Fallback model "${fallbackId}" is not in the registry. Cannot fallback to an unknown model.`,
    };
  }

  if (fallback.status === "retired") {
    return {
      allowed: false,
      reason: "retired",
      detail: `Fallback model "${fallbackId}" is retired. Use "${fallback.deprecated_by ?? "a different model"}" instead.`,
    };
  }

  if (fallback.status === "deprecated") {
    return {
      allowed: false,
      reason: "deprecated",
      detail: `Fallback model "${fallbackId}" is deprecated. Use "${fallback.deprecated_by ?? "a different model"}" instead.`,
    };
  }

  // Compliance: data residency must not degrade
  if (primary && primary.data_residency === "eu" && fallback.data_residency !== "eu") {
    return {
      allowed: false,
      reason: "lower_residency",
      detail: `Fallback from "${primaryId}" (EU) to "${fallbackId}" (non-EU) violates data residency policy. EU-only orgs require EU-hosted models.`,
    };
  }

  // Compliance: ZDR must not degrade
  if (opts?.requireZdr && !fallback.zdr) {
    return {
      allowed: false,
      reason: "no_zdr",
      detail: `Fallback model "${fallbackId}" does not support Zero Data Retention, which is required.`,
    };
  }

  // Capability: tools must not degrade
  if (opts?.requireTools && !fallback.supports_tools) {
    return {
      allowed: false,
      reason: "lower_capability",
      detail: `Fallback model "${fallbackId}" lacks tool calling support, which is required for this operation.`,
    };
  }

  // Capability: if primary has tools and fallback doesn't, that's a downgrade
  if (primary && primary.supports_tools && !fallback.supports_tools) {
    return {
      allowed: false,
      reason: "lower_capability",
      detail: `Fallback from "${primaryId}" (tools=yes) to "${fallbackId}" (tools=no) is a capability downgrade. Tool-dependent operations will fail.`,
    };
  }

  // Capability: if primary has JSON mode and fallback doesn't
  if (primary && primary.supports_json && !fallback.supports_json) {
    return {
      allowed: false,
      reason: "lower_capability",
      detail: `Fallback from "${primaryId}" (json=yes) to "${fallbackId}" (json=no) is a capability downgrade. Structured output operations will fail.`,
    };
  }

  // Capability: if primary has thinking and fallback doesn't
  if (primary && primary.supports_thinking && !fallback.supports_thinking) {
    return {
      allowed: false,
      reason: "lower_capability",
      detail: `Fallback from "${primaryId}" (thinking=yes) to "${fallbackId}" (thinking=no) is a capability downgrade. Extended reasoning operations will produce lower quality output.`,
    };
  }

  return {
    allowed: true,
    detail: `Fallback from "${primaryId}" to "${fallbackId}" is allowed (no compliance or capability downgrade).`,
  };
}

/**
 * Resolve a model request with optional fallback.
 *
 * T8.1: If the primary model is unavailable and a fallback is provided,
 * the fallback is assessed for compliance and capability. If the fallback
 * would be a downgrade, the function THROWS instead of silently switching.
 *
 * @throws Error if the model cannot be resolved and no acceptable fallback exists
 */
export function resolveModelWithFallback(opts: ResolveModelOpts): ResolvedModel {
  const resolvedId = resolveModelId(opts.modelId);
  const entry = REGISTRY.get(resolvedId);

  if (entry && entry.status === "active") {
    // Policy check
    if (opts.policy === "eu_only" && entry.data_residency !== "eu") {
      throw new Error(
        `Model "${resolvedId}" is not EU-hosted (data_residency: ${entry.data_residency}). ` +
          `Policy "eu_only" requires EU-hosted models.`
      );
    }

    // Capability requirements
    if (opts.requireTools && !entry.supports_tools) {
      throw new Error(`Model "${resolvedId}" does not support tool calling, which is required.`);
    }
    if (opts.requireJson && !entry.supports_json) {
      throw new Error(`Model "${resolvedId}" does not support JSON mode, which is required.`);
    }
    if (opts.requireThinking && !entry.supports_thinking) {
      throw new Error(
        `Model "${resolvedId}" does not support extended thinking, which is required.`
      );
    }
    if (opts.requireZdr && !entry.zdr) {
      throw new Error(
        `Model "${resolvedId}" does not support Zero Data Retention, which is required.`
      );
    }

    return { modelId: resolvedId, entry, usedFallback: false };
  }

  // Primary not available — try fallback
  if (entry && entry.status === "deprecated") {
    // Auto-upgrade to deprecation replacement if no explicit fallback
    const replacementId = opts.fallbackId ?? entry.deprecated_by;
    if (replacementId) {
      const assessment = assessFallback(resolvedId, replacementId, opts);
      if (!assessment.allowed) {
        throw new Error(
          `Model "${resolvedId}" is deprecated. Auto-upgrade to "${replacementId}" blocked: ${assessment.detail}`
        );
      }
      const replacement = REGISTRY.get(resolveModelId(replacementId));
      if (replacement) {
        return {
          modelId: resolveModelId(replacementId),
          entry: replacement,
          usedFallback: true,
          fallbackAssessment: assessment,
        };
      }
    }
    throw new Error(
      `Model "${resolvedId}" is deprecated and no acceptable replacement was found. ` +
        `Deprecated by: ${entry.deprecated_by ?? "none specified"}.`
    );
  }

  if (entry && entry.status === "retired") {
    const replacementId = opts.fallbackId ?? entry.deprecated_by;
    if (replacementId) {
      const assessment = assessFallback(resolvedId, replacementId, opts);
      if (!assessment.allowed) {
        throw new Error(
          `Model "${resolvedId}" is retired. Fallback to "${replacementId}" blocked: ${assessment.detail}`
        );
      }
      const replacement = REGISTRY.get(resolveModelId(replacementId));
      if (replacement) {
        return {
          modelId: resolveModelId(replacementId),
          entry: replacement,
          usedFallback: true,
          fallbackAssessment: assessment,
        };
      }
    }
    throw new Error(`Model "${resolvedId}" is retired and no acceptable replacement was found.`);
  }

  // Primary not in registry at all
  if (opts.fallbackId) {
    const assessment = assessFallback(resolvedId, opts.fallbackId, opts);
    if (!assessment.allowed) {
      throw new Error(
        `Model "${resolvedId}" not found in registry. Fallback to "${opts.fallbackId}" blocked: ${assessment.detail}`
      );
    }
    const fallback = REGISTRY.get(resolveModelId(opts.fallbackId));
    if (fallback) {
      return {
        modelId: resolveModelId(opts.fallbackId),
        entry: fallback,
        usedFallback: true,
        fallbackAssessment: assessment,
      };
    }
  }

  throw new Error(
    `Model "${resolvedId}" not found in registry and no fallback provided. ` +
      `Registered models: ${[...REGISTRY.keys()].slice(0, 10).join(", ")}...`
  );
}

/**
 * Compute a deterministic hash of a model entry for audit trail.
 */
export function hashModelEntry(entry: ModelCapabilityEntry): string {
  const payload = JSON.stringify({
    id: entry.id,
    snapshot: entry.snapshot,
    pricing: entry.pricing,
    capabilities: {
      tools: entry.supports_tools,
      json: entry.supports_json,
      thinking: entry.supports_thinking,
      vision: entry.supports_vision,
      caching: entry.supports_prompt_caching,
    },
    compliance: {
      residency: entry.data_residency,
      zdr: entry.zdr,
    },
  });
  return createHash("sha256").update(payload).digest("hex");
}

/**
 * Get the tier defaults (for model-config.ts integration).
 * T8.1: deepseek-chat explicitly mapped to V4-flash route.
 */
export function getTierDefaults(): Record<ModelTier, string> {
  return {
    utility: "openrouter:deepseek/deepseek-chat",
    reasoning: "openrouter:deepseek/deepseek-chat",
    deep: "openrouter:xai/grok-4.3",
    subagent: "anthropic:claude-haiku-4-5",
  };
}

/**
 * Verify that all TIER_DEFAULTS models exist in the registry.
 * Called at startup to catch configuration drift.
 */
export function verifyTierDefaults(): { valid: boolean; missing: string[] } {
  const defaults = getTierDefaults();
  const missing: string[] = [];
  for (const [tier, modelId] of Object.entries(defaults)) {
    if (!isRegisteredModel(modelId)) {
      missing.push(`${tier}: ${modelId}`);
    }
  }
  return { valid: missing.length === 0, missing };
}
