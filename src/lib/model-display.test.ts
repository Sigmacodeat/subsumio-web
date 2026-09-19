import { describe, expect, it } from "vitest";
import { modelDisplayName } from "./model-display";

describe("modelDisplayName", () => {
  it.each([
    ["anthropic:claude-sonnet-5", "Claude Sonnet 5"],
    ["anthropic:claude-opus-5", "Claude Opus 5"],
    ["anthropic:claude-haiku-4-5", "Claude Haiku 4.5"],
    ["anthropic:claude-haiku-4-5-20251001", "Claude Haiku 4.5"],
    ["openrouter:anthropic/claude-haiku-4.5", "Claude Haiku 4.5"],
    ["openrouter:anthropic/claude-opus-5", "Claude Opus 5"],
    ["claude-fable-5-1", "Claude Fable 5.1"],
  ])("%s → %s", (id, name) => {
    expect(modelDisplayName(id)).toBe(name);
  });

  it("falls back to the bare model id for unknown models", () => {
    expect(modelDisplayName("mistral:mistral-large-3")).toBe("mistral-large-3");
  });
});
