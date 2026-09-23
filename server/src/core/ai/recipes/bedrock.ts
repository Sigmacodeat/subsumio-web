import type { Recipe } from "../types.ts";
import { BEDROCK_EU_MODELS, hasBedrockCredentials } from "../bedrock-config.ts";

/**
 * Amazon Bedrock — Claude through AWS, processed in the EU.
 *
 * The gateway builds this with `createBedrockAnthropic` from
 * `@ai-sdk/amazon-bedrock/anthropic`: the Anthropic Messages API on the
 * `bedrock-runtime` InvokeModel endpoint. Same request shape as the direct
 * Anthropic provider, so tool use, streaming, adaptive thinking and
 * `providerOptions.anthropic.cacheControl` (prompt caching) behave the same.
 *
 * Model ids are EU geo inference profiles (`eu.anthropic.…`, see
 * bedrock-config.ts). Friendly aliases let config say `bedrock:claude-sonnet-5`.
 * Other Bedrock ids (a newer `eu.` profile, an application-inference-profile
 * ARN) can be set via `models.tier.*` — the gateway accepts config-supplied ids
 * — but the EU-only switch classifies anything that is not an `eu.` profile or
 * an in-region id in an EU region as non-EU.
 *
 * Auth (read from the gateway env snapshot):
 *   - AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY (+ optional AWS_SESSION_TOKEN) → SigV4
 *   - or AWS_BEARER_TOKEN_BEDROCK (Bedrock API key) → Bearer
 * Region: AWS_REGION, default eu-central-1.
 *
 * No embedding touchpoint here: Bedrock embeddings (Cohere Embed multilingual,
 * Titan v2) would need a different vector space and a full re-embed — see
 * docs/architecture/LLM_GATEWAY.md.
 */
export const bedrock: Recipe = {
  id: "bedrock",
  name: "Amazon Bedrock",
  tier: "native",
  implementation: "native-bedrock",
  auth_env: {
    // SigV4 pair listed as "required" for tooling that reads auth_env
    // (providers/doctor); `hasCredentials` is the real gate and also accepts
    // AWS_BEARER_TOKEN_BEDROCK alone.
    required: ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY"],
    optional: ["AWS_SESSION_TOKEN", "AWS_BEARER_TOKEN_BEDROCK", "AWS_REGION"],
    setup_url: "https://docs.aws.amazon.com/bedrock/latest/userguide/getting-started.html",
  },
  hasCredentials: hasBedrockCredentials,
  touchpoints: {
    expansion: {
      models: [BEDROCK_EU_MODELS.haiku45, BEDROCK_EU_MODELS.sonnet5],
      price_last_verified: "2026-09-23",
    },
    chat: {
      models: [BEDROCK_EU_MODELS.haiku45, BEDROCK_EU_MODELS.sonnet5, BEDROCK_EU_MODELS.opus5],
      supports_tools: true,
      supports_subagent_loop: true,
      supports_prompt_cache: true,
      max_context_tokens: 200_000,
      price_last_verified: "2026-09-23",
    },
  },
  aliases: {
    "claude-haiku-4-5": BEDROCK_EU_MODELS.haiku45,
    "claude-haiku-4-5-20251001": BEDROCK_EU_MODELS.haiku45,
    "claude-sonnet-5": BEDROCK_EU_MODELS.sonnet5,
    "claude-opus-5": BEDROCK_EU_MODELS.opus5,
  },
  setup_hint:
    "AWS account with Bedrock access to the Anthropic models (use-case form done), IAM user/role allowed to call " +
    "bedrock:InvokeModel + bedrock:InvokeModelWithResponseStream on the eu.anthropic.* inference profiles. Set " +
    "AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY (or AWS_BEARER_TOKEN_BEDROCK) and AWS_REGION=eu-central-1.",
};
