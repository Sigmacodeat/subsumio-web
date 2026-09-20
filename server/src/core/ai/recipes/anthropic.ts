import type { Recipe } from "../types.ts";
import { canonicalLookup } from "../../model-pricing.ts";

// Prices come from the canonical table (src/core/model-pricing.ts) — never
// hand-copy numbers here. Expansion runs on Haiku; the chat baseline is the
// Sonnet-class default reasoning model.
const EXPANSION_PRICE = canonicalLookup("anthropic:claude-haiku-4-5");
const CHAT_BASELINE_PRICE = canonicalLookup("anthropic:claude-sonnet-5");

/**
 * Anthropic provides language models (expansion + chat) only.
 * Claude has no first-party embedding model as of v0.27 ship date. Users who
 * want a fully Anthropic stack would still use OpenAI or Google for embedding.
 */
export const anthropic: Recipe = {
  id: "anthropic",
  name: "Anthropic",
  tier: "native",
  implementation: "native-anthropic",
  auth_env: {
    required: ["ANTHROPIC_API_KEY"],
    setup_url: "https://console.anthropic.com/settings/keys",
  },
  touchpoints: {
    // No embedding model available.
    expansion: {
      models: ["claude-haiku-4-5-20251001", "claude-sonnet-5", "claude-sonnet-4-6"],
      cost_per_1m_tokens_usd: EXPANSION_PRICE?.input,
      price_last_verified: "2026-09-18",
    },
    chat: {
      // Claude 5 family first: the model-config tiers (reasoning = Sonnet 5,
      // deep = Opus 5, opt-in Fable 5.1) and the web model picker resolve to
      // these ids. Missing here, native deployments threw
      // `Model "..." is not listed for Anthropic chat` on every deep-tier
      // call. The previous generation stays for stale configs;
      // claude-haiku-4-5 reaches this list through the alias below.
      models: [
        "claude-fable-5-1",
        "claude-opus-5",
        "claude-sonnet-5",
        "claude-haiku-4-5-20251001",
        "claude-opus-4-7",
        "claude-sonnet-4-6",
      ],
      supports_tools: true,
      supports_subagent_loop: true,
      supports_prompt_cache: true,
      max_context_tokens: 200000,
      cost_per_1m_input_usd: CHAT_BASELINE_PRICE?.input, // sonnet-class baseline
      cost_per_1m_output_usd: CHAT_BASELINE_PRICE?.output,
      price_last_verified: "2026-09-18",
    },
  },
  // Friendly aliases. Starting with Claude 4.6, Anthropic API IDs are dateless
  // and pinned (no alias needed). Only pre-4.6 models need date-suffixed aliases.
  // The reverse entry rewrites the v0.31.6-shipped broken ID back to canonical
  // so users with stale `models.dream.synthesize` etc. configs keep working.
  aliases: {
    "claude-haiku-4-5": "claude-haiku-4-5-20251001",
    "claude-sonnet-4-6-20250929": "claude-sonnet-4-6",
  },
  setup_hint:
    "Get an API key at https://console.anthropic.com/settings/keys, then `export ANTHROPIC_API_KEY=...`",
};
