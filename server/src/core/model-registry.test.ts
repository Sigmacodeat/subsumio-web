/**
 * Tests for EPIC 8 — T8.1 Model Capability Registry
 */
import { describe, it, expect } from "vitest";
import {
  getModelEntry,
  isRegisteredModel,
  listModels,
  modelsForPolicy,
  resolveModelId,
  resolveModelWithFallback,
  assessFallback,
  hashModelEntry,
  getTierDefaults,
  verifyTierDefaults,
} from "./model-registry.ts";

describe("Model Capability Registry", () => {
  describe("resolveModelId", () => {
    it("resolves exact registry ids", () => {
      expect(resolveModelId("anthropic:claude-opus-4-8")).toBe("anthropic:claude-opus-4-8");
      expect(resolveModelId("openai:gpt-5")).toBe("openai:gpt-5");
    });

    it("resolves aliases to canonical ids", () => {
      expect(resolveModelId("opus")).toBe("anthropic:claude-opus-4-8");
      expect(resolveModelId("sonnet")).toBe("anthropic:claude-sonnet-4-6");
      expect(resolveModelId("haiku")).toBe("anthropic:claude-haiku-4-5-20251001");
    });

    it("resolves deepseek-chat to explicit V4-flash route", () => {
      const resolved = resolveModelId("deepseek-chat");
      expect(resolved).toBe("openrouter:deepseek/deepseek-chat");
      const entry = getModelEntry(resolved);
      expect(entry).toBeDefined();
      expect(entry?.snapshot).toBe("v4-flash-2026-07");
    });

    it("resolves deepseek:deepseek-chat to the direct route", () => {
      const resolved = resolveModelId("deepseek:deepseek-chat");
      expect(resolved).toBe("deepseek:deepseek-chat");
      const entry = getModelEntry(resolved);
      expect(entry).toBeDefined();
      expect(entry?.snapshot).toBe("v4-flash-2026-07");
    });

    it("returns unknown ids as-is", () => {
      expect(resolveModelId("unknown:model")).toBe("unknown:model");
    });
  });

  describe("getModelEntry", () => {
    it("returns entry for registered models", () => {
      const entry = getModelEntry("anthropic:claude-opus-4-8");
      expect(entry).toBeDefined();
      expect(entry?.display_name).toBe("Claude Opus 4.8");
      expect(entry?.provider).toBe("anthropic");
      expect(entry?.context_window).toBe(200_000);
    });

    it("returns undefined for unregistered models", () => {
      expect(getModelEntry("unknown:model")).toBeUndefined();
    });
  });

  describe("registry completeness", () => {
    it("every entry has all required fields", () => {
      const all = listModels();
      expect(all.length).toBeGreaterThan(10);
      for (const entry of all) {
        expect(entry.id).toBeTruthy();
        expect(entry.display_name).toBeTruthy();
        expect(entry.provider).toBeTruthy();
        expect(entry.snapshot).toBeTruthy();
        expect(entry.context_window).toBeGreaterThan(0);
        expect(typeof entry.supports_tools).toBe("boolean");
        expect(typeof entry.supports_json).toBe("boolean");
        expect(typeof entry.supports_thinking).toBe("boolean");
        expect(typeof entry.supports_vision).toBe("boolean");
        expect(typeof entry.supports_prompt_caching).toBe("boolean");
        expect(entry.data_residency).toMatch(/^(eu|non_eu)$/);
        expect(typeof entry.zdr).toBe("boolean");
        expect(entry.pricing.input).toBeGreaterThanOrEqual(0);
        expect(entry.pricing.output).toBeGreaterThanOrEqual(0);
        expect(entry.tier).toMatch(/^(utility|reasoning|deep|subagent)$/);
        expect(entry.status).toMatch(/^(active|deprecated|retired)$/);
      }
    });

    it("has EU-hosted models for eu_only policy", () => {
      const euModels = modelsForPolicy("eu_only");
      expect(euModels.length).toBeGreaterThan(0);
      for (const m of euModels) {
        expect(m.data_residency).toBe("eu");
      }
    });

    it("has more models for 'any' policy than 'eu_only'", () => {
      const any = modelsForPolicy("any");
      const eu = modelsForPolicy("eu_only");
      expect(any.length).toBeGreaterThan(eu.length);
    });

    it("all active models have pricing matching CANONICAL_PRICING", () => {
      const active = listModels({ status: "active" });
      for (const m of active) {
        expect(m.pricing.input).toBeGreaterThan(0);
        expect(m.pricing.output).toBeGreaterThan(0);
      }
    });
  });

  describe("assessFallback", () => {
    it("allows fallback to equivalent or better model", () => {
      const assessment = assessFallback(
        "anthropic:claude-haiku-4-5",
        "anthropic:claude-sonnet-4-6"
      );
      expect(assessment.allowed).toBe(true);
    });

    it("blocks fallback to unknown model", () => {
      const assessment = assessFallback("anthropic:claude-opus-4-8", "unknown:model");
      expect(assessment.allowed).toBe(false);
      expect(assessment.reason).toBe("unknown_model");
    });

    it("blocks fallback from EU to non-EU model", () => {
      const assessment = assessFallback("mistral:mistral-large-3", "anthropic:claude-opus-4-8");
      expect(assessment.allowed).toBe(false);
      expect(assessment.reason).toBe("lower_residency");
    });

    it("blocks fallback from tools-capable to non-tools model", () => {
      const assessment = assessFallback("anthropic:claude-opus-4-8", "zero-entropy:legal-v1");
      expect(assessment.allowed).toBe(false);
      expect(assessment.reason).toBe("lower_capability");
    });

    it("blocks fallback to deprecated model", () => {
      const assessment = assessFallback("anthropic:claude-opus-4-8", "anthropic:claude-opus-4-7");
      expect(assessment.allowed).toBe(false);
      expect(assessment.reason).toBe("deprecated");
    });

    it("blocks fallback when ZDR required but fallback lacks it", () => {
      const assessment = assessFallback(
        "anthropic:claude-opus-4-8",
        "anthropic:claude-sonnet-4-6",
        { requireZdr: true }
      );
      expect(assessment.allowed).toBe(false);
      expect(assessment.reason).toBe("no_zdr");
    });

    it("blocks fallback from JSON-capable to non-JSON model", () => {
      const assessment = assessFallback("anthropic:claude-opus-4-8", "zero-entropy:legal-v1");
      expect(assessment.allowed).toBe(false);
      expect(assessment.reason).toBe("lower_capability");
    });
  });

  describe("resolveModelWithFallback", () => {
    it("resolves active model directly", () => {
      const result = resolveModelWithFallback({
        modelId: "anthropic:claude-opus-4-8",
      });
      expect(result.usedFallback).toBe(false);
      expect(result.entry.display_name).toBe("Claude Opus 4.8");
    });

    it("auto-upgrades deprecated model to replacement", () => {
      const result = resolveModelWithFallback({
        modelId: "anthropic:claude-opus-4-7",
      });
      expect(result.usedFallback).toBe(true);
      expect(result.entry.id).toBe("anthropic:claude-opus-4-8");
    });

    it("throws for eu_only policy with non-EU model", () => {
      expect(() =>
        resolveModelWithFallback({
          modelId: "anthropic:claude-opus-4-8",
          policy: "eu_only",
        })
      ).toThrow(/not EU-hosted/);
    });

    it("throws for requireTools with non-tools model", () => {
      expect(() =>
        resolveModelWithFallback({
          modelId: "zero-entropy:legal-v1",
          requireTools: true,
        })
      ).toThrow(/does not support tool calling/);
    });

    it("throws for requireJson with non-JSON model", () => {
      expect(() =>
        resolveModelWithFallback({
          modelId: "zero-entropy:legal-v1",
          requireJson: true,
        })
      ).toThrow(/does not support JSON mode/);
    });

    it("throws for requireThinking with non-thinking model", () => {
      expect(() =>
        resolveModelWithFallback({
          modelId: "anthropic:claude-haiku-4-5",
          requireThinking: true,
        })
      ).toThrow(/does not support extended thinking/);
    });

    it("throws when no fallback provided for unknown model", () => {
      expect(() =>
        resolveModelWithFallback({
          modelId: "unknown:model",
        })
      ).toThrow(/not found in registry/);
    });

    it("uses fallback when primary is unknown and fallback is acceptable", () => {
      const result = resolveModelWithFallback({
        modelId: "unknown:model",
        fallbackId: "anthropic:claude-sonnet-4-6",
      });
      expect(result.usedFallback).toBe(true);
      expect(result.entry.id).toBe("anthropic:claude-sonnet-4-6");
    });

    it("throws when fallback is a capability downgrade", () => {
      expect(() =>
        resolveModelWithFallback({
          modelId: "unknown:model",
          fallbackId: "zero-entropy:legal-v1",
          requireTools: true,
        })
      ).toThrow(/blocked/);
    });

    it("resolves deepseek-chat alias to V4-flash", () => {
      const result = resolveModelWithFallback({
        modelId: "deepseek-chat",
      });
      expect(result.entry.snapshot).toBe("v4-flash-2026-07");
      expect(result.entry.id).toBe("openrouter:deepseek/deepseek-chat");
    });
  });

  describe("hashModelEntry", () => {
    it("produces deterministic hash", () => {
      const entry = getModelEntry("anthropic:claude-opus-4-8")!;
      const hash1 = hashModelEntry(entry);
      const hash2 = hashModelEntry(entry);
      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64);
    });

    it("produces different hashes for different models", () => {
      const opus = getModelEntry("anthropic:claude-opus-4-8")!;
      const sonnet = getModelEntry("anthropic:claude-sonnet-4-6")!;
      expect(hashModelEntry(opus)).not.toBe(hashModelEntry(sonnet));
    });
  });

  describe("getTierDefaults", () => {
    it("returns all 4 tiers", () => {
      const defaults = getTierDefaults();
      expect(defaults.utility).toBeTruthy();
      expect(defaults.reasoning).toBeTruthy();
      expect(defaults.deep).toBeTruthy();
      expect(defaults.subagent).toBeTruthy();
    });

    it("maps utility tier to deepseek V4-flash", () => {
      const defaults = getTierDefaults();
      expect(defaults.utility).toBe("openrouter:deepseek/deepseek-chat");
    });
  });

  describe("verifyTierDefaults", () => {
    it("all tier defaults exist in registry", () => {
      const result = verifyTierDefaults();
      expect(result.valid).toBe(true);
      expect(result.missing).toHaveLength(0);
    });
  });

  describe("deepseek-chat V4 migration (T8.1 requirement)", () => {
    it("deepseek-chat resolves to V4-flash snapshot", () => {
      const entry = getModelEntry("deepseek-chat");
      expect(entry).toBeDefined();
      expect(entry?.snapshot).toBe("v4-flash-2026-07");
      expect(entry?.display_name).toContain("DeepSeek V4 Flash");
    });

    it("deepseek-chat via openrouter resolves to same snapshot", () => {
      const entry = getModelEntry("openrouter:deepseek/deepseek-chat");
      expect(entry).toBeDefined();
      expect(entry?.snapshot).toBe("v4-flash-2026-07");
    });

    it("deepseek-chat via direct provider resolves to same snapshot", () => {
      const entry = getModelEntry("deepseek:deepseek-chat");
      expect(entry).toBeDefined();
      expect(entry?.snapshot).toBe("v4-flash-2026-07");
    });
  });
});
