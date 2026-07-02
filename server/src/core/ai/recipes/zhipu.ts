import type { Recipe } from "../types.ts";

/**
 * Zhipu AI (智谱AI) BigModel Open Platform. OpenAI-compatible endpoints
 * at open.bigmodel.cn.
 *
 * Chat: GLM-4.7 is the flagship model with strong reasoning, code
 * understanding, and multilingual support (Chinese + English).
 * Pricing: $1.40/$4.40 per 1M tokens (verified 2026-06-28).
 * Relevant for Chinese legal corpus and international expansion
 * (Phase 2: China-adjacent markets).
 *
 * Embeddings: embedding-2 (1024d) and embedding-3 (Matryoshka up to 2048d).
 * embedding-3 at 2048 dims exceeds pgvector's HNSW cap of 2000 — those
 * brains fall back to exact vector scans (see
 * src/core/ai/vector-index.ts:PGVECTOR_HNSW_VECTOR_MAX_DIMS). v0.32 ships
 * with `default_dims: 1024` (HNSW-compatible) and exposes 2048 via
 * dims_options for users who want the full embedding fidelity at the
 * cost of slower retrieval.
 *
 * Reference: https://open.bigmodel.cn/
 */
export const zhipu: Recipe = {
  id: "zhipu",
  name: "Zhipu AI (智谱AI BigModel)",
  tier: "openai-compat",
  implementation: "openai-compatible",
  base_url_default: "https://open.bigmodel.cn/api/paas/v4",
  auth_env: {
    required: ["ZHIPUAI_API_KEY"],
    setup_url: "https://open.bigmodel.cn/",
  },
  touchpoints: {
    chat: {
      models: ["glm-4.7", "glm-4.5", "glm-4-plus", "glm-4-flash"],
      supports_tools: true,
      supports_subagent_loop: true,
      supports_prompt_cache: false,
      max_context_tokens: 128_000,
      cost_per_1m_input_usd: 1.4,
      cost_per_1m_output_usd: 4.4,
      price_last_verified: "2026-06-28",
    },
    embedding: {
      models: ["embedding-3", "embedding-2"],
      default_dims: 1024,
      dims_options: [256, 512, 1024, 2048],
      max_batch_tokens: 8192,
      chars_per_token: 2,
    },
  },
  setup_hint: "Get an API key at https://open.bigmodel.cn/, then `export ZHIPUAI_API_KEY=...`",
};
