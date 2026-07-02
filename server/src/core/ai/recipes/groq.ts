import type { Recipe } from "../types.ts";

/**
 * Groq runs Llama, Qwen, GPT-OSS, and Whisper on custom LPU inference
 * hardware (~500 tok/s, 10x faster than GPU). The speed tier and
 * last-resort refusal fallback. Also serves Whisper for transcription.
 *
 * Groq's LPU delivers 5-10x faster token generation than GPU setups,
 * with <100ms time-to-first-token. Ideal for latency-sensitive legal
 * tasks like real-time chat and agentic tool loops.
 *
 * Pricing (verified 2026-06-28):
 *   - Llama 4 Scout (17Bx16E): $0.11/$0.34, 128K context, ~600 TPS
 *   - Llama 3.3 70B Versatile: $0.59/$0.79, 128K context
 *   - GPT-OSS-120B: $0.15/$0.60, 128K context
 *   - Qwen3 32B: $0.29/$0.59, 128K context
 *   - Kimi K2: $1.00/$3.00, 128K context
 *
 * Batch API (50% discount) + prompt caching (50% discount) can stack
 * to ~25% of on-demand pricing for batch workloads.
 */
export const groq: Recipe = {
  id: "groq",
  name: "Groq",
  tier: "openai-compat",
  implementation: "openai-compatible",
  base_url_default: "https://api.groq.com/openai/v1",
  auth_env: {
    required: ["GROQ_API_KEY"],
    setup_url: "https://console.groq.com/keys",
  },
  touchpoints: {
    chat: {
      models: [
        "llama-3.3-70b-versatile",
        "llama-3.1-8b-instant",
        "llama-4-scout-17b-16e",
        "llama-4-maverick-17b-128e",
        "gpt-oss-20b",
        "gpt-oss-120b",
        "qwen3-32b",
        "kimi-k2",
      ],
      supports_tools: true,
      supports_subagent_loop: true,
      supports_prompt_cache: false,
      max_context_tokens: 131_072,
      cost_per_1m_input_usd: 0.11,
      cost_per_1m_output_usd: 0.34,
      price_last_verified: "2026-06-28",
    },
  },
  setup_hint: "Get an API key at https://console.groq.com/keys, then `export GROQ_API_KEY=...`",
};
