import type { Recipe } from "../types.ts";

/**
 * Cohere — purpose-built for enterprise RAG with native citations.
 *
 * The Chat endpoint generates fine-grained citations for RAG responses,
 * making Cohere uniquely suited for legal document retrieval where every
 * claim must trace to a source. Command R+ 08-2024 is the flagship chat
 * model with 128K context.
 *
 * Pricing (verified 2026-06-10):
 *   - Command R+ 08-2024: $2.50/$10.00 per 1M tokens, 128K context
 *   - Command R: $0.15/$0.60 per 1M tokens (budget tier)
 *   - Command R7B: $0.037/$0.144 per 1M tokens (ultra-budget)
 *
 * Use case in Subsumio: RAG-based legal research where native citations
 * are more valuable than raw reasoning quality. Pairs well with the
 * Law Matcher layer for §-retrieval with built-in source attribution.
 */
export const cohere: Recipe = {
  id: "cohere",
  name: "Cohere",
  tier: "openai-compat",
  implementation: "openai-compatible",
  base_url_default: "https://api.cohere.com/v2",
  auth_env: {
    required: ["COHERE_API_KEY"],
    setup_url: "https://dashboard.cohere.com/api-keys",
  },
  touchpoints: {
    chat: {
      models: ["command-r-plus-08-2024", "command-r-08-2024", "command-r7b-12-2024"],
      supports_tools: true,
      supports_subagent_loop: true,
      supports_prompt_cache: false,
      max_context_tokens: 128_000,
      cost_per_1m_input_usd: 2.5,
      cost_per_1m_output_usd: 10.0,
      price_last_verified: "2026-06-10",
    },
    embedding: {
      models: ["embed-v4", "embed-v3.0", "embed-english-v3.0", "embed-multilingual-v3.0"],
      default_dims: 1024,
      dims_options: [256, 512, 1024, 1536],
      max_batch_tokens: 8192,
      chars_per_token: 3.5,
    },
  },
  setup_hint:
    "Get an API key at https://dashboard.cohere.com/api-keys, then `export COHERE_API_KEY=...`",
};
