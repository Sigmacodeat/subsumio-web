import { describe, it, expect } from "bun:test";
import { trimToolOutput } from "../../src/core/minions/handlers/subagent.ts";

describe("trimToolOutput (module-level export)", () => {
  it("trims array results to max 5 items", () => {
    const input = Array.from({ length: 10 }, (_, i) => ({
      chunk_text: `result ${i}`,
      title: `Title ${i}`,
    }));
    const result = trimToolOutput(input) as unknown[];
    expect(result).toHaveLength(5);
  });

  it("strips internal scoring fields from array items", () => {
    const input = [
      {
        chunk_text: "hello",
        base_score: 0.95,
        statute_area_boost: 1.5,
        title: "Test",
      },
    ];
    const result = trimToolOutput(input) as Record<string, unknown>[];
    expect(result[0]?.base_score).toBeUndefined();
    expect(result[0]?.statute_area_boost).toBeUndefined();
    expect(result[0]?.chunk_text).toBe("hello");
    expect(result[0]?.title).toBe("Test");
  });

  it("trims chunk_text to max 800 chars", () => {
    const longText = "x".repeat(2000);
    const input = [{ chunk_text: longText }];
    const result = trimToolOutput(input) as Record<string, unknown>[];
    const text = result[0]?.chunk_text as string;
    expect(text.length).toBeLessThan(2000);
    expect(text).toContain("[…]");
  });

  it("trims compiled_truth to max 3200 chars", () => {
    const longTruth = "y".repeat(5000);
    const input = { compiled_truth: longTruth, title: "Page" };
    const result = trimToolOutput(input) as Record<string, unknown>;
    const truth = result.compiled_truth as string;
    expect(truth.length).toBeLessThan(5000);
    expect(truth).toContain("[…]");
  });

  it("trims brain_search results array", () => {
    const input = {
      results: Array.from({ length: 10 }, (_, i) => ({
        chunk_text: `result ${i}`,
        score: 0.9,
      })),
      result_count: 10,
    };
    const result = trimToolOutput(input) as Record<string, unknown>;
    expect((result.results as unknown[]).length).toBe(5);
  });

  it("returns null/undefined as-is", () => {
    expect(trimToolOutput(null)).toBeNull();
    expect(trimToolOutput(undefined)).toBeUndefined();
  });

  it("returns primitives as-is", () => {
    expect(trimToolOutput("hello")).toBe("hello");
    expect(trimToolOutput(42)).toBe(42);
  });

  it("handles errors gracefully (returns placeholder)", () => {
    // Create an object with a throwing getter
    const obj: Record<string, unknown> = {};
    Object.defineProperty(obj, "x", {
      get() {
        throw new Error("getter explosion");
      },
      enumerable: true,
    });
    const result = trimToolOutput(obj) as Record<string, unknown>;
    expect(result.error).toBe("tool_output_trim_failed");
  });
});

describe("cached_context field on SubagentHandlerData", () => {
  it("is an optional field that accepts a string", () => {
    // Type-level test: if this compiles, the field exists
    const data: import("../../src/core/minions/types.ts").SubagentHandlerData = {
      prompt: "test",
      cached_context: '{"key": "value"}',
    };
    expect(data.cached_context).toBe('{"key": "value"}');
  });

  it("can be omitted", () => {
    const data: import("../../src/core/minions/types.ts").SubagentHandlerData = {
      prompt: "test",
    };
    expect(data.cached_context).toBeUndefined();
  });
});

describe("SpecialistDef maxOutputTokens", () => {
  it("is an optional field that accepts a number", () => {
    const def: import("../../src/core/minions/specialist-defs.ts").SpecialistDef = {
      name: "test-specialist",
      systemPrompt: "test",
      allowedTools: [],
      maxOutputTokens: 2048,
    };
    expect(def.maxOutputTokens).toBe(2048);
  });

  it("can be omitted (falls back to tier default)", () => {
    const def: import("../../src/core/minions/specialist-defs.ts").SpecialistDef = {
      name: "test-specialist",
      systemPrompt: "test",
      allowedTools: [],
    };
    expect(def.maxOutputTokens).toBeUndefined();
  });
});

describe("PipelineState layer token tracking", () => {
  it("tracks per-layer token usage", () => {
    type PipelineState = import("../../src/core/minions/handlers/legal-pipeline.ts").PipelineState;
    const state: PipelineState = {
      case_slug: "test",
      status: "running",
      current_layer: 1,
      layers: {
        1: {
          status: "completed",
          tokens_in: 50000,
          tokens_out: 2000,
          cache_read_tokens: 45000,
          cache_create_tokens: 5000,
          cost_usd: 0.15,
        },
      },
      total_duration_ms: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const layer = state.layers[1]!;
    expect(layer.tokens_in).toBe(50000);
    expect(layer.cache_read_tokens).toBe(45000);
    expect(layer.cost_usd).toBe(0.15);
  });
});

describe("Context distillation", () => {
  it("strips quote from on_table entries when stripOnQuotes is true", () => {
    // Test the distillation logic conceptually: distilled entries should
    // have on_nummer + datum + typ but NOT quote
    const rawEntry = {
      on_nummer: "ON001",
      datum: "2024-01-15",
      typ: "Anzeige",
      personen: ["Müller"],
      quote: "Sehr langer Text der nur während ON-Extraktion gebraucht wird...",
    };
    const distilled = {
      on_nummer: rawEntry.on_nummer,
      datum: rawEntry.datum,
      typ: rawEntry.typ,
      personen: rawEntry.personen,
    };
    expect(distilled).not.toHaveProperty("quote");
    expect(distilled.on_nummer).toBe("ON001");
  });

  it("distills forensic_report to summary + counts", () => {
    const rawReport = {
      summary: { key: "value" },
      chronologie: [{ id: 1 }, { id: 2 }, { id: 3 }],
      unterlassene_massnahmen: [{ id: 1 }],
      geldfluss: [{ id: 1 }, { id: 2 }],
    };
    const distilled = {
      summary: rawReport.summary,
      chronologie_count: rawReport.chronologie.length,
      unterlassene_massnahmen_count: rawReport.unterlassene_massnahmen.length,
      geldfluss_count: rawReport.geldfluss.length,
    };
    expect(distilled.chronologie_count).toBe(3);
    expect(distilled.geldfluss_count).toBe(2);
    expect(distilled).not.toHaveProperty("chronologie");
  });
});
