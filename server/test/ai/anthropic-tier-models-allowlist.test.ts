/**
 * Every Anthropic model the code routes to on native (non-OpenRouter) routing
 * must pass the gateway's chat allowlist. Regression for the 2026-09-19 prod
 * failure: think's deep tier resolved `anthropic:claude-opus-5`, which was in
 * NATIVE_TIER_DEFAULTS but not in the Anthropic recipe, so gateway.chat threw
 * `Model "claude-opus-5" is not listed for Anthropic chat`.
 *
 * The recipe check runs WITHOUT an extended-models set on purpose: hardcoded
 * defaults must be listed in the recipe, not rescued by config registration.
 */

import { describe, test, expect, afterEach } from "bun:test";
import { resolveRecipe, assertTouchpoint } from "../../src/core/ai/model-resolver.ts";
import { anthropic } from "../../src/core/ai/recipes/anthropic.ts";
import { canonicalLookup } from "../../src/core/model-pricing.ts";
import { NATIVE_TIER_DEFAULTS, USER_MODEL_CHOICES } from "../../src/core/model-config.ts";
import {
  configureGateway,
  reconfigureGatewayWithEngine,
  resetGateway,
  validateModelId,
} from "../../src/core/ai/gateway.ts";
import type { BrainEngine } from "../../src/core/engine.ts";

function assertChatAllowed(model: string): void {
  const { parsed, recipe } = resolveRecipe(model);
  assertTouchpoint(recipe, "chat", parsed.modelId);
}

describe("native Anthropic tier models pass assertTouchpoint", () => {
  for (const [tier, model] of Object.entries(NATIVE_TIER_DEFAULTS)) {
    test(`tier ${tier} → ${model}`, () => {
      expect(() => assertChatAllowed(model)).not.toThrow();
    });
  }

  for (const [choice, route] of Object.entries(USER_MODEL_CHOICES)) {
    if (!route.native.startsWith("anthropic:")) continue;
    test(`web model choice ${choice} → ${route.native}`, () => {
      expect(() => assertChatAllowed(route.native)).not.toThrow();
    });
  }

  test("an unknown Anthropic id still fails fast", () => {
    expect(() => assertChatAllowed("anthropic:claude-bogus-9")).toThrow(/not listed/);
  });
});

describe("Anthropic recipe pricing is derived from the canonical table", () => {
  test("chat baseline equals canonical Sonnet 5", () => {
    const sonnet = canonicalLookup("anthropic:claude-sonnet-5")!;
    expect(anthropic.touchpoints.chat?.cost_per_1m_input_usd).toBe(sonnet.input);
    expect(anthropic.touchpoints.chat?.cost_per_1m_output_usd).toBe(sonnet.output);
  });

  test("expansion price equals canonical Haiku 4.5 input", () => {
    const haiku = canonicalLookup("anthropic:claude-haiku-4-5")!;
    expect(anthropic.touchpoints.expansion?.cost_per_1m_tokens_usd).toBe(haiku.input);
  });

  test("every listed chat model has a canonical price", () => {
    for (const m of anthropic.touchpoints.chat?.models ?? []) {
      expect(canonicalLookup(`anthropic:${m}`)).toBeDefined();
    }
  });
});

describe("reconfigureGatewayWithEngine registers per-tier config overrides", () => {
  afterEach(() => resetGateway());

  function fakeEngine(config: Record<string, string>): BrainEngine {
    return { getConfig: async (key: string) => config[key] ?? null } as unknown as BrainEngine;
  }

  test("models.tier.deep override is accepted by the chat allowlist", async () => {
    const custom = "anthropic:claude-custom-deep-test";
    configureGateway({
      embedding_model: "openai:text-embedding-3-large",
      chat_model: "anthropic:claude-sonnet-5",
      expansion_model: "anthropic:claude-haiku-4-5",
      env: {},
    });
    expect(validateModelId(custom).ok).toBe(false);

    await reconfigureGatewayWithEngine(
      fakeEngine({
        embedding_model: "openai:text-embedding-3-large",
        "models.tier.deep": custom,
      })
    );
    expect(validateModelId(custom).ok).toBe(true);
  });
});
