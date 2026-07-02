import type { Recipe } from "../types.ts";

/**
 * Moonshot AI (Kimi) — long-context agentic model.
 *
 * Kimi K2.6 is a 1T-parameter MoE open-weight model (released April 2026).
 * Ties GPT-5.5 on SWE-Bench Pro (58.6%), leads on Humanity's Last Exam
 * with tools (54.0%). Strong for long-horizon agentic tasks and
 * multi-agent workflows.
 *
 * Pricing (verified 2026-06-20):
 *   - Kimi K2.6: $0.60/$2.50 per 1M tokens, 256K context
 *   - Kimi K2.7-Code: coding-optimized variant
 *
 * Use case in Subsumio: Long-document analysis where 256K+ context
 * matters (full case files, multi-document cross-referencing).
 * Available via Groq ($1.00/$3.00) or direct API.
 */
export const moonshot: Recipe = {
  id: "moonshot",
  name: "Moonshot AI (Kimi)",
  tier: "openai-compat",
  implementation: "openai-compatible",
  base_url_default: "https://api.moonshot.cn/v1",
  auth_env: {
    required: ["MOONSHOT_API_KEY"],
    setup_url: "https://platform.moonshot.cn/console/api-keys",
  },
  touchpoints: {
    chat: {
      models: ["kimi-k2.6", "kimi-k2.7-code", "moonshot-v1-128k", "moonshot-v1-32k"],
      supports_tools: true,
      supports_subagent_loop: true,
      supports_prompt_cache: false,
      max_context_tokens: 256_000,
      cost_per_1m_input_usd: 0.6,
      cost_per_1m_output_usd: 2.5,
      price_last_verified: "2026-06-20",
    },
  },
  setup_hint: "Get an API key at https://platform.moonshot.cn, then `export MOONSHOT_API_KEY=...`",
};
