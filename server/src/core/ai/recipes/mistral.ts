import type { Recipe } from "../types.ts";

/**
 * Mistral AI — EU-hosted (Paris), GDPR-compliant by default.
 *
 * The only frontier provider with native EU data residency. La Plateforme
 * runs entirely in EU data centers, making Mistral the canonical choice for
 * GDPR-sensitive legal workloads where data must not leave the EU.
 *
 * Model lineup (verified 2026-06-20):
 *   - mistral-large-3: 128B dense, 256K context, $0.50/$1.50 — frontier-class
 *   - mistral-small-3.2: lightweight, 32K context, $0.10/$0.30 — budget tier
 *
 * Note: Mistral Large has a 64% hallucination rate on legal citations
 * (HAQQ benchmark June 2026) — use for extraction/structuring, NOT for
 * legal reasoning or citation generation. Pair with a Critic layer.
 */
export const mistral: Recipe = {
  id: "mistral",
  name: "Mistral AI",
  tier: "openai-compat",
  implementation: "openai-compatible",
  base_url_default: "https://api.mistral.ai/v1",
  auth_env: {
    required: ["MISTRAL_API_KEY"],
    setup_url: "https://console.mistral.ai/api-keys",
  },
  touchpoints: {
    chat: {
      models: [
        "mistral-large-3",
        "mistral-small-3.2",
        "mistral-medium-3.5",
        "open-mistral-7b",
        "open-mixtral-8x7b",
      ],
      supports_tools: true,
      supports_subagent_loop: true,
      supports_prompt_cache: false,
      max_context_tokens: 256_000,
      cost_per_1m_input_usd: 0.5,
      cost_per_1m_output_usd: 1.5,
      price_last_verified: "2026-06-20",
    },
  },
  setup_hint:
    "Get an API key at https://console.mistral.ai/api-keys, then `export MISTRAL_API_KEY=...`",
};
