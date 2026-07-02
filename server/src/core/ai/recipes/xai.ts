import type { Recipe } from "../types.ts";

/**
 * xAI (Grok) — fast reasoning with 2M token context.
 *
 * Grok 4.3 scored 29.0 on the HAQQ legal benchmark (June 2026) — 98% of
 * Claude Opus 4.8's quality at 1/20th the cost ($0.003/task vs $0.069)
 * and 1/7th the latency (8.8s vs 60.8s). Best speed-to-quality ratio
 * for legal tasks. Also won 13 of 51 legal practice areas outright.
 *
 * Pricing (verified 2026-06-29):
 *   - Grok 4.3: $0.20/$0.50 per 1M tokens, 2M context
 *   - Grok 4.1 Fast: $0.20/$0.50 (budget variant)
 *
 * Note: 12% hallucination rate on legal citations — higher than
 * Claude (8%) and GPT-5.5 (3%). Use for speed-sensitive tasks where
 * a downstream Critic layer verifies citations.
 */
export const xai: Recipe = {
  id: "xai",
  name: "xAI (Grok)",
  tier: "openai-compat",
  implementation: "openai-compatible",
  base_url_default: "https://api.x.ai/v1",
  auth_env: {
    required: ["XAI_API_KEY"],
    setup_url: "https://console.x.ai",
  },
  touchpoints: {
    chat: {
      models: ["grok-4.3", "grok-4.1-fast", "grok-4.1", "grok-4"],
      supports_tools: true,
      supports_subagent_loop: true,
      supports_prompt_cache: false,
      max_context_tokens: 2_000_000,
      cost_per_1m_input_usd: 0.2,
      cost_per_1m_output_usd: 0.5,
      price_last_verified: "2026-06-29",
    },
  },
  setup_hint: "Get an API key at https://console.x.ai, then `export XAI_API_KEY=...`",
};
