/**
 * Specialist Model-Tier Routing Tests (Phase 6a)
 *
 * Verifies that every embedded specialist has a modelTier assigned and that
 * the tier resolves to the expected TIER_DEFAULTS model. This guards against
 * silent routing changes when TIER_DEFAULTS or specialist-defs are modified.
 */

import { describe, it, expect } from "bun:test";
import {
  EMBEDDED_SPECIALISTS,
  resolveSpecialist,
} from "../src/core/minions/specialist-defs.ts";
import {
  TIER_DEFAULTS,
  isAnthropicProvider,
} from "../src/core/model-config.ts";

// ── Expected tier assignments (source of truth for routing) ──────────────
// These are the specialists that MUST be on "deep" tier — the ones that
// do critical juristic reasoning and need the strongest model.
const DEEP_SPECIALISTS = new Set([
  "legal-critic",
  "opponent-simulator",
  "subsumption-checker",
]);

// Specialists on "utility" tier — lightweight extraction/structuring/retrieval.
const UTILITY_SPECIALISTS = new Set([
  "legal-deadline-extractor",
  "on-scanner",
  "entity-extractor",
  "law-matcher",
]);

// All other specialists should be on "reasoning" tier.
// (No specialist should be on "subagent" tier — that's for the subagent
// loop itself, not for specialist routing.)

describe("Specialist model-tier routing", () => {
  it("every embedded specialist has a modelTier", () => {
    for (const s of EMBEDDED_SPECIALISTS) {
      expect(s.modelTier, `specialist "${s.name}" must have modelTier`).toBeDefined();
    }
  });

  it("deep-tier specialists are exactly the expected set", () => {
    const actual = new Set(
      EMBEDDED_SPECIALISTS.filter((s) => s.modelTier === "deep").map((s) => s.name)
    );
    expect(actual).toEqual(DEEP_SPECIALISTS);
  });

  it("utility-tier specialists are exactly the expected set", () => {
    const actual = new Set(
      EMBEDDED_SPECIALISTS.filter((s) => s.modelTier === "utility").map((s) => s.name)
    );
    expect(actual).toEqual(UTILITY_SPECIALISTS);
  });

  it("no specialist is on subagent tier", () => {
    for (const s of EMBEDDED_SPECIALISTS) {
      expect(s.modelTier).not.toBe("subagent");
    }
  });

  it("all remaining specialists are on reasoning tier", () => {
    for (const s of EMBEDDED_SPECIALISTS) {
      if (DEEP_SPECIALISTS.has(s.name) || UTILITY_SPECIALISTS.has(s.name)) continue;
      expect(s.modelTier, `specialist "${s.name}" should be reasoning`).toBe("reasoning");
    }
  });
});

describe("TIER_DEFAULTS routing correctness", () => {
  it("deep tier resolves to Grok 4.3", () => {
    expect(TIER_DEFAULTS.deep).toBe("openrouter:xai/grok-4.3");
  });

  it("reasoning tier resolves to DeepSeek V4 Flash", () => {
    expect(TIER_DEFAULTS.reasoning).toBe("openrouter:deepseek/deepseek-chat");
  });

  it("utility tier resolves to DeepSeek V4 Flash", () => {
    expect(TIER_DEFAULTS.utility).toBe("openrouter:deepseek/deepseek-chat");
  });

  it("subagent tier resolves to Claude Haiku 4.5 (Anthropic-required)", () => {
    expect(TIER_DEFAULTS.subagent).toBe("anthropic:claude-haiku-4-5");
    // The subagent loop uses Anthropic Messages API — non-Anthropic models
    // throw at runtime unless agent.use_gateway_loop=true.
    expect(isAnthropicProvider(TIER_DEFAULTS.subagent)).toBe(true);
  });
});

describe("Specialist resolution + tier chain", () => {
  it("resolveSpecialist returns the correct tier for each deep specialist", () => {
    for (const name of DEEP_SPECIALISTS) {
      const def = resolveSpecialist(name);
      expect(def).not.toBeNull();
      expect(def!.modelTier).toBe("deep");
    }
  });

  it("resolveSpecialist returns the correct tier for each utility specialist", () => {
    for (const name of UTILITY_SPECIALISTS) {
      const def = resolveSpecialist(name);
      expect(def).not.toBeNull();
      expect(def!.modelTier).toBe("utility");
    }
  });

  it("subsumption-checker routes to deep tier (Grok 4.3)", () => {
    const def = resolveSpecialist("subsumption-checker");
    expect(def).not.toBeNull();
    expect(def!.modelTier).toBe("deep");
    // The model that this tier resolves to
    expect(TIER_DEFAULTS[def!.modelTier!]).toBe("openrouter:xai/grok-4.3");
  });

  it("opponent-simulator routes to deep tier (Grok 4.3)", () => {
    const def = resolveSpecialist("opponent-simulator");
    expect(def).not.toBeNull();
    expect(def!.modelTier).toBe("deep");
    expect(TIER_DEFAULTS[def!.modelTier!]).toBe("openrouter:xai/grok-4.3");
  });

  it("legal-critic routes to deep tier (Grok 4.3)", () => {
    const def = resolveSpecialist("legal-critic");
    expect(def).not.toBeNull();
    expect(def!.modelTier).toBe("deep");
    expect(TIER_DEFAULTS[def!.modelTier!]).toBe("openrouter:xai/grok-4.3");
  });

  it("legal-researcher routes to reasoning tier (DeepSeek V4 Flash)", () => {
    const def = resolveSpecialist("legal-researcher");
    expect(def).not.toBeNull();
    expect(def!.modelTier).toBe("reasoning");
    expect(TIER_DEFAULTS[def!.modelTier!]).toBe("openrouter:deepseek/deepseek-chat");
  });

  it("on-scanner routes to utility tier (DeepSeek V4 Flash)", () => {
    const def = resolveSpecialist("on-scanner");
    expect(def).not.toBeNull();
    expect(def!.modelTier).toBe("utility");
    expect(TIER_DEFAULTS[def!.modelTier!]).toBe("openrouter:deepseek/deepseek-chat");
  });
});

describe("Specialist count integrity", () => {
  it("has at least 30 embedded specialists", () => {
    expect(EMBEDDED_SPECIALISTS.length).toBeGreaterThanOrEqual(30);
  });

  it("deep + utility + reasoning covers all specialists", () => {
    const all = new Set(EMBEDDED_SPECIALISTS.map((s) => s.name));
    const classified = new Set([...DEEP_SPECIALISTS, ...UTILITY_SPECIALISTS]);
    for (const s of EMBEDDED_SPECIALISTS) {
      if (!classified.has(s.name)) {
        expect(s.modelTier).toBe("reasoning");
      }
    }
    // Ensure no overlap between deep and utility sets
    for (const name of DEEP_SPECIALISTS) {
      expect(UTILITY_SPECIALISTS.has(name)).toBe(false);
    }
  });
});
