import { describe, test, expect } from "vitest";
import {
  AI_MODELS,
  getModelById,
  isValidModelId,
  DEFAULT_MODEL_ID,
  getProviderLabel,
  formatCost,
  formatContextWindow,
  getSpeedLabel,
  isModelAllowedForPolicy,
  modelsForPolicy,
  type ModelProvider,
} from "./model-config";

describe("AI_MODELS", () => {
  test("is a non-empty array", () => {
    expect(AI_MODELS.length).toBeGreaterThan(0);
  });

  test("every model has required fields", () => {
    for (const m of AI_MODELS) {
      expect(m.id).toBeTruthy();
      expect(m.name).toBeTruthy();
      expect(m.provider).toBeTruthy();
      expect(m.contextWindow).toBeGreaterThan(0);
      expect(m.costPer1MInput).toBeGreaterThanOrEqual(0);
      expect(m.costPer1MOutput).toBeGreaterThanOrEqual(0);
      expect(m.speedRating).toBeGreaterThanOrEqual(1);
      expect(m.speedRating).toBeLessThanOrEqual(5);
      expect(m.description).toBeTruthy();
      expect(Array.isArray(m.capabilities)).toBe(true);
      expect(typeof m.brainScoped).toBe("boolean");
      expect(["eu", "non_eu"]).toContain(m.dataResidency);
    }
  });

  test("Mistral is the only EU-hosted entry (documented EU infra)", () => {
    const euModels = AI_MODELS.filter((m) => m.dataResidency === "eu");
    expect(euModels.map((m) => m.provider)).toEqual(["mistral"]);
  });

  test("has unique model IDs", () => {
    const ids = AI_MODELS.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("includes Claude Sonnet 4", () => {
    const sonnet = AI_MODELS.find((m) => m.id === "claude-sonnet-4-20250514");
    expect(sonnet).toBeDefined();
    expect(sonnet!.provider).toBe("anthropic");
  });

  test("includes GPT-4o", () => {
    const gpt4o = AI_MODELS.find((m) => m.id === "gpt-4o-2024-11-20");
    expect(gpt4o).toBeDefined();
    expect(gpt4o!.provider).toBe("openai");
  });

  test("includes Gemini 2.0 Flash with 1M context", () => {
    const gemini = AI_MODELS.find((m) => m.id === "gemini-2-0-flash-001");
    expect(gemini).toBeDefined();
    expect(gemini!.contextWindow).toBe(1_000_000);
  });
});

describe("getModelById", () => {
  test("returns model for valid ID", () => {
    const model = getModelById("claude-sonnet-4-20250514");
    expect(model).toBeDefined();
    expect(model!.name).toBe("Claude Sonnet 4");
  });

  test("returns undefined for unknown ID", () => {
    expect(getModelById("nonexistent-model")).toBeUndefined();
  });

  test("returns undefined for empty string", () => {
    expect(getModelById("")).toBeUndefined();
  });
});

describe("isValidModelId", () => {
  test("returns true for valid model ID", () => {
    expect(isValidModelId("claude-sonnet-4-20250514")).toBe(true);
  });

  test("returns false for unknown model ID", () => {
    expect(isValidModelId("fake-model")).toBe(false);
  });

  test("returns false for empty string", () => {
    expect(isValidModelId("")).toBe(false);
  });
});

describe("DEFAULT_MODEL_ID", () => {
  test("is the first model in AI_MODELS", () => {
    expect(DEFAULT_MODEL_ID).toBe(AI_MODELS[0].id);
  });

  test("is a valid model ID", () => {
    expect(isValidModelId(DEFAULT_MODEL_ID)).toBe(true);
  });
});

describe("getProviderLabel", () => {
  test("returns 'Anthropic' for anthropic", () => {
    expect(getProviderLabel("anthropic")).toBe("Anthropic");
  });

  test("returns 'OpenAI' for openai", () => {
    expect(getProviderLabel("openai")).toBe("OpenAI");
  });

  test("returns 'Google' for google", () => {
    expect(getProviderLabel("google")).toBe("Google");
  });

  test("returns 'Mistral AI' for mistral", () => {
    expect(getProviderLabel("mistral")).toBe("Mistral AI");
  });

  test("returns 'Meta' for meta", () => {
    expect(getProviderLabel("meta")).toBe("Meta");
  });

  test("returns 'ZeroEntropy' for zero-entropy", () => {
    expect(getProviderLabel("zero-entropy")).toBe("ZeroEntropy");
  });
});

describe("formatCost", () => {
  test("formats costs < 0.01 with 3 decimals", () => {
    expect(formatCost(0.001)).toBe("$0.001");
  });

  test("formats costs < 1 with 2 decimals", () => {
    expect(formatCost(0.15)).toBe("$0.15");
    expect(formatCost(0.5)).toBe("$0.50");
  });

  test("formats costs >= 1 with 1 decimal", () => {
    expect(formatCost(3.0)).toBe("$3.0");
    expect(formatCost(15.0)).toBe("$15.0");
    expect(formatCost(75.0)).toBe("$75.0");
  });

  test("formats zero cost", () => {
    expect(formatCost(0)).toBe("$0.000");
  });
});

describe("formatContextWindow", () => {
  test("formats 1M tokens as '1M'", () => {
    expect(formatContextWindow(1_000_000)).toBe("1M");
  });

  test("formats 200K tokens", () => {
    expect(formatContextWindow(200_000)).toBe("200K");
  });

  test("formats 128K tokens", () => {
    expect(formatContextWindow(128_000)).toBe("128K");
  });

  test("formats 64K tokens", () => {
    expect(formatContextWindow(64_000)).toBe("64K");
  });

  test("formats small token counts without suffix", () => {
    expect(formatContextWindow(500)).toBe("500");
  });

  test("formats 2M tokens", () => {
    expect(formatContextWindow(2_000_000)).toBe("2M");
  });
});

describe("getSpeedLabel", () => {
  test("returns 'Very Slow' for rating 1", () => {
    expect(getSpeedLabel(1)).toBe("Very Slow");
  });

  test("returns 'Slow' for rating 2", () => {
    expect(getSpeedLabel(2)).toBe("Slow");
  });

  test("returns 'Medium' for rating 3", () => {
    expect(getSpeedLabel(3)).toBe("Medium");
  });

  test("returns 'Fast' for rating 4", () => {
    expect(getSpeedLabel(4)).toBe("Fast");
  });

  test("returns 'Very Fast' for rating 5", () => {
    expect(getSpeedLabel(5)).toBe("Very Fast");
  });
});

describe("isModelAllowedForPolicy", () => {
  const euModel = AI_MODELS.find((m) => m.dataResidency === "eu")!;
  const nonEuModel = AI_MODELS.find((m) => m.dataResidency === "non_eu")!;

  test("policy 'any' allows every model", () => {
    expect(isModelAllowedForPolicy(euModel, "any")).toBe(true);
    expect(isModelAllowedForPolicy(nonEuModel, "any")).toBe(true);
  });

  test("policy undefined behaves like 'any' (back-compat for existing orgs)", () => {
    expect(isModelAllowedForPolicy(nonEuModel, undefined)).toBe(true);
  });

  test("policy 'eu_only' allows EU-hosted models", () => {
    expect(isModelAllowedForPolicy(euModel, "eu_only")).toBe(true);
  });

  test("policy 'eu_only' rejects non-EU models", () => {
    expect(isModelAllowedForPolicy(nonEuModel, "eu_only")).toBe(false);
  });
});

describe("modelsForPolicy", () => {
  test("'any' returns the full catalog", () => {
    expect(modelsForPolicy("any")).toHaveLength(AI_MODELS.length);
  });

  test("undefined returns the full catalog (back-compat)", () => {
    expect(modelsForPolicy(undefined)).toHaveLength(AI_MODELS.length);
  });

  test("'eu_only' returns only EU-hosted models, and none are non_eu", () => {
    const filtered = modelsForPolicy("eu_only");
    expect(filtered.length).toBeGreaterThan(0);
    expect(filtered.every((m) => m.dataResidency === "eu")).toBe(true);
  });
});
