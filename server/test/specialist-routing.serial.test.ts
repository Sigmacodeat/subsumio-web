/**
 * Specialist Model-Tier Routing Tests (Phase 6a)
 *
 * Verifies that every embedded specialist has a modelTier assigned and that
 * the tier resolves to the expected TIER_DEFAULTS model. This guards against
 * silent routing changes when TIER_DEFAULTS or specialist-defs are modified.
 */

import { describe, it, expect } from "bun:test";
import { EMBEDDED_SPECIALISTS, resolveSpecialist } from "../src/core/minions/specialist-defs.ts";
import { TIER_DEFAULTS, isAnthropicProvider } from "../src/core/model-config.ts";

// ── Expected tier assignments (source of truth for routing) ──────────────
// These are the specialists that MUST be on "deep" tier — the ones that
// do critical juristic reasoning and need the strongest model.
const DEEP_SPECIALISTS = new Set(["legal-critic", "opponent-simulator", "subsumption-checker"]);

// Specialists on "utility" tier — lightweight extraction/structuring/retrieval.
const UTILITY_SPECIALISTS = new Set([
  "legal-deadline-extractor",
  "on-scanner",
  "entity-extractor",
  "law-matcher",
  // These are deterministic extraction/validation tasks. Keeping them on the
  // utility tier prevents Sonnet/Grok spend without weakening legal analysis.
  "damage-extractor",
  "deadline-validator",
  "precedent-matcher",
  "admissibility-checker",
  "limitation-scanner",
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
  it("deep tier resolves to Claude Opus 5", () => {
    expect(TIER_DEFAULTS.deep).toBe("anthropic:claude-opus-5");
  });

  it("reasoning tier resolves to Claude Sonnet 5", () => {
    expect(TIER_DEFAULTS.reasoning).toBe("anthropic:claude-sonnet-5");
  });

  it("utility tier resolves to Claude Haiku 4.5", () => {
    expect(TIER_DEFAULTS.utility).toBe("anthropic:claude-haiku-4-5");
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

  it("subsumption-checker routes to deep tier (Claude Opus 5)", () => {
    const def = resolveSpecialist("subsumption-checker");
    expect(def).not.toBeNull();
    expect(def!.modelTier).toBe("deep");
    // The model that this tier resolves to
    expect(TIER_DEFAULTS[def!.modelTier!]).toBe("anthropic:claude-opus-5");
  });

  it("opponent-simulator routes to deep tier (Claude Opus 5)", () => {
    const def = resolveSpecialist("opponent-simulator");
    expect(def).not.toBeNull();
    expect(def!.modelTier).toBe("deep");
    expect(TIER_DEFAULTS[def!.modelTier!]).toBe("anthropic:claude-opus-5");
  });

  it("legal-critic routes to deep tier (Claude Opus 5)", () => {
    const def = resolveSpecialist("legal-critic");
    expect(def).not.toBeNull();
    expect(def!.modelTier).toBe("deep");
    expect(TIER_DEFAULTS[def!.modelTier!]).toBe("anthropic:claude-opus-5");
  });

  it("legal-researcher routes to reasoning tier (Claude Sonnet 5)", () => {
    const def = resolveSpecialist("legal-researcher");
    expect(def).not.toBeNull();
    expect(def!.modelTier).toBe("reasoning");
    expect(TIER_DEFAULTS[def!.modelTier!]).toBe("anthropic:claude-sonnet-5");
  });

  it("on-scanner routes to utility tier (Claude Haiku 4.5)", () => {
    const def = resolveSpecialist("on-scanner");
    expect(def).not.toBeNull();
    expect(def!.modelTier).toBe("utility");
    expect(TIER_DEFAULTS[def!.modelTier!]).toBe("anthropic:claude-haiku-4-5");
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

describe("thinking-model output floor", () => {
  it("raises small caps for models that think by default", async () => {
    const { effectiveMaxOutputTokens, THINKING_MODEL_OUTPUT_FLOOR } =
      await import("../src/core/ai/gateway.ts");
    expect(effectiveMaxOutputTokens("openrouter:anthropic/claude-fable-5.1", 1500)).toBe(
      THINKING_MODEL_OUTPUT_FLOOR
    );
    expect(effectiveMaxOutputTokens("anthropic:claude-sonnet-5", 400)).toBe(
      THINKING_MODEL_OUTPUT_FLOOR
    );
    expect(effectiveMaxOutputTokens("openrouter:anthropic/claude-sonnet-5", undefined)).toBe(
      THINKING_MODEL_OUTPUT_FLOOR
    );
    expect(effectiveMaxOutputTokens("anthropic:claude-sonnet-5", 64_000)).toBe(64_000);
  });

  it("leaves other models untouched", async () => {
    const { effectiveMaxOutputTokens } = await import("../src/core/ai/gateway.ts");
    expect(effectiveMaxOutputTokens("anthropic:claude-haiku-4-5", 200)).toBe(200);
    expect(effectiveMaxOutputTokens("anthropic:claude-sonnet-4-6", undefined)).toBe(4096);
  });
});

describe("user model choice from the web app", () => {
  it("maps every offered catalogue id and nothing else", async () => {
    const { resolveUserModelChoice } = await import("../src/core/model-config.ts");
    for (const id of [
      "claude-haiku-4-5",
      "claude-sonnet-5",
      "claude-opus-5",
      "claude-fable-5-1",
      "mistral-large-3",
    ]) {
      expect(resolveUserModelChoice(id), id).toBeTruthy();
    }
    expect(resolveUserModelChoice("auto")).toBeUndefined();
    expect(resolveUserModelChoice("claude-sonnet-4-6")).toBeUndefined();
    expect(resolveUserModelChoice("openrouter:x-ai/grok-4.3")).toBeUndefined();
    expect(resolveUserModelChoice(undefined)).toBeUndefined();
    expect(resolveUserModelChoice(42)).toBeUndefined();
  });

  it("every choice has a price, so budgets never fail closed on it", async () => {
    const { resolveUserModelChoice } = await import("../src/core/model-config.ts");
    const { canonicalLookup } = await import("../src/core/model-pricing.ts");
    for (const id of ["claude-haiku-4-5", "claude-sonnet-5", "claude-opus-5", "claude-fable-5-1"]) {
      expect(canonicalLookup(resolveUserModelChoice(id)), id).toBeDefined();
    }
  });
});

describe("OpenRouter reasoning effort cap", () => {
  it("is off unless configured, and only touches Claude 5-class models", async () => {
    const { applyReasoningEffort } = await import("../src/core/ai/gateway.ts");
    const prev = process.env.SUBSUMIO_OPENROUTER_REASONING_EFFORT;
    try {
      delete process.env.SUBSUMIO_OPENROUTER_REASONING_EFFORT;
      const off: Record<string, unknown> = { model: "anthropic/claude-sonnet-5" };
      expect(applyReasoningEffort(off)).toBe(false);
      expect(off.reasoning).toBeUndefined();

      process.env.SUBSUMIO_OPENROUTER_REASONING_EFFORT = "medium";
      const sonnet: Record<string, unknown> = { model: "anthropic/claude-sonnet-5" };
      expect(applyReasoningEffort(sonnet)).toBe(true);
      expect(sonnet.reasoning).toEqual({ effort: "medium" });

      const haiku: Record<string, unknown> = { model: "anthropic/claude-haiku-4.5" };
      expect(applyReasoningEffort(haiku)).toBe(false);

      const explicit: Record<string, unknown> = {
        model: "anthropic/claude-opus-5",
        reasoning: { effort: "high" },
      };
      expect(applyReasoningEffort(explicit)).toBe(false);
      expect(explicit.reasoning).toEqual({ effort: "high" });
    } finally {
      if (prev === undefined) delete process.env.SUBSUMIO_OPENROUTER_REASONING_EFFORT;
      else process.env.SUBSUMIO_OPENROUTER_REASONING_EFFORT = prev;
    }
  });
});
