/**
 * SUBSUMIO_AI_PROVIDER modes: tier defaults and user model choices per mode.
 */

import { describe, expect, test } from "bun:test";
import { withEnv } from "../helpers/with-env.ts";
import {
  aiProviderMode,
  resolveUserModelChoice,
  tierDefaultsFor,
} from "../../src/core/model-config.ts";
import { isAllowedUnderEuPolicy } from "../../src/core/ai/eu-policy.ts";
import { canonicalLookup } from "../../src/core/model-pricing.ts";
import { getModelEntry } from "../../src/core/model-registry.ts";

describe("aiProviderMode", () => {
  test("parses the three modes; anything else is native", () => {
    expect(aiProviderMode({})).toBe("native");
    expect(aiProviderMode({ SUBSUMIO_AI_PROVIDER: "openrouter" })).toBe("openrouter");
    expect(aiProviderMode({ SUBSUMIO_AI_PROVIDER: " Bedrock-EU " })).toBe("bedrock-eu");
    expect(aiProviderMode({ SUBSUMIO_AI_PROVIDER: "bedrock" })).toBe("native");
  });
});

describe("tier defaults per mode", () => {
  test("native: Haiku 4.5 / Sonnet 5 / Opus 5 on the Anthropic API", () => {
    expect(tierDefaultsFor("native")).toEqual({
      utility: "anthropic:claude-haiku-4-5",
      reasoning: "anthropic:claude-sonnet-5",
      deep: "anthropic:claude-opus-5",
      subagent: "anthropic:claude-haiku-4-5",
    });
  });

  test("openrouter: same tiers through OpenRouter", () => {
    const t = tierDefaultsFor("openrouter");
    for (const m of Object.values(t)) expect(m.startsWith("openrouter:")).toBe(true);
  });

  test("bedrock-eu: same tiers as EU inference profiles", () => {
    expect(tierDefaultsFor("bedrock-eu")).toEqual({
      utility: "bedrock:eu.anthropic.claude-haiku-4-5-20251001-v1:0",
      reasoning: "bedrock:eu.anthropic.claude-sonnet-5",
      deep: "bedrock:eu.anthropic.claude-opus-5",
      subagent: "bedrock:eu.anthropic.claude-haiku-4-5-20251001-v1:0",
    });
  });

  test("bedrock-eu defaults pass the EU-only policy, are registered and priced", () => {
    const env = { SUBSUMIO_EU_ONLY: "1" };
    for (const m of Object.values(tierDefaultsFor("bedrock-eu"))) {
      expect(isAllowedUnderEuPolicy(m, env), m).toBe(true);
      expect(getModelEntry(m), m).toBeDefined();
      expect(canonicalLookup(m), m).toBeDefined();
    }
  });

  test("native and openrouter defaults fail the EU-only policy", () => {
    const env = { SUBSUMIO_EU_ONLY: "1" };
    for (const m of [
      ...Object.values(tierDefaultsFor("native")),
      ...Object.values(tierDefaultsFor("openrouter")),
    ]) {
      expect(isAllowedUnderEuPolicy(m, env), m).toBe(false);
    }
  });
});

describe("user model choices per mode", () => {
  test("bedrock-eu maps Claude picks to EU profiles; Fable 5.1 falls back to auto", async () => {
    await withEnv({ SUBSUMIO_AI_PROVIDER: "bedrock-eu" }, () => {
      expect(resolveUserModelChoice("claude-sonnet-5")).toBe(
        "bedrock:eu.anthropic.claude-sonnet-5"
      );
      expect(resolveUserModelChoice("claude-opus-5")).toBe("bedrock:eu.anthropic.claude-opus-5");
      expect(resolveUserModelChoice("claude-haiku-4-5")).toBe(
        "bedrock:eu.anthropic.claude-haiku-4-5-20251001-v1:0"
      );
      expect(resolveUserModelChoice("claude-fable-5-1")).toBeUndefined();
      expect(resolveUserModelChoice("mistral-large-3")).toBe("mistral:mistral-large-3");
    });
  });

  test("native and openrouter unchanged", async () => {
    await withEnv({ SUBSUMIO_AI_PROVIDER: undefined }, () => {
      expect(resolveUserModelChoice("claude-sonnet-5")).toBe("anthropic:claude-sonnet-5");
    });
    await withEnv({ SUBSUMIO_AI_PROVIDER: "openrouter" }, () => {
      expect(resolveUserModelChoice("claude-sonnet-5")).toBe(
        "openrouter:anthropic/claude-sonnet-5"
      );
    });
  });
});
