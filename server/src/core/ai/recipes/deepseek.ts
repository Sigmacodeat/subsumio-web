import type { Recipe } from "../types.ts";

/**
 * DeepSeek exposes an OpenAI-compatible /v1/chat/completions endpoint.
 * Useful as the second hop in a refusal-fallback chain and for cheap-
 * research delegation: 25-40x cheaper than Anthropic on equivalent
 * reasoning workloads.
 *
 * V3.2 deprecated July 2026 — replaced by V4 Flash/Pro at same pricing.
 * V4 Flash: BenGER 71.3, best budget open-weight legal model.
 * V4 Pro: BenGER 76.1, best open-weight legal model overall.
 * Both at $0.14/$0.28 per 1M tokens.
 */
export const deepseek: Recipe = {
  id: "deepseek",
  name: "DeepSeek",
  tier: "openai-compat",
  implementation: "openai-compatible",
  base_url_default: "https://api.deepseek.com/v1",
  auth_env: {
    required: ["DEEPSEEK_API_KEY"],
    setup_url: "https://platform.deepseek.com/api_keys",
  },
  touchpoints: {
    chat: {
      models: ["deepseek-chat", "deepseek-reasoner", "deepseek-v3.2", "deepseek-v3.2-exp", "deepseek-v4-flash", "deepseek-v4-pro"],
      supports_tools: true,
      supports_subagent_loop: true,
      supports_prompt_cache: false,
      max_context_tokens: 128000,
      cost_per_1m_input_usd: 0.14,
      cost_per_1m_output_usd: 0.28,
      price_last_verified: "2026-07-11",
    },
  },
  setup_hint:
    "Get an API key at https://platform.deepseek.com/api_keys, then `export DEEPSEEK_API_KEY=...`",
};
