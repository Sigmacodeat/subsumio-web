import { describe, test, expect } from "vitest";
import { parseRoutingResult } from "./pipeline";

describe("parseRoutingResult", () => {
  test("parses valid JSON routing result", () => {
    const text =
      '{"intent": "case_search", "legal_concepts": ["BGB § 280", "Schadensersatz"], "jurisdiction": "de", "suggested_filters": {"court": "BGH", "courtLevel": "supreme"}, "search_strategy": "hybrid", "expanded_query": "Schadensersatz BGB 280 BGH"}';
    const result = parseRoutingResult(text, "Schadensersatz");
    expect(result.intent).toBe("case_search");
    expect(result.legal_concepts).toEqual(["BGB § 280", "Schadensersatz"]);
    expect(result.jurisdiction).toBe("de");
    expect(result.suggested_filters.court).toBe("BGH");
    expect(result.search_strategy).toBe("hybrid");
    expect(result.expanded_query).toBe("Schadensersatz BGB 280 BGH");
  });

  test("falls back to defaults for invalid JSON", () => {
    const text = "No JSON here";
    const result = parseRoutingResult(text, "original query");
    expect(result.intent).toBe("general");
    expect(result.expanded_query).toBe("original query");
    expect(result.search_strategy).toBe("hybrid");
  });

  test("handles partial JSON with missing fields", () => {
    const text = '{"intent": "statute_lookup"}';
    const result = parseRoutingResult(text, "test");
    expect(result.intent).toBe("statute_lookup");
    expect(result.legal_concepts).toEqual([]);
    expect(result.jurisdiction).toBe("de");
    expect(result.suggested_filters).toEqual({});
  });

  test("uses original query as expanded_query when not provided", () => {
    const text = '{"intent": "general"}';
    const result = parseRoutingResult(text, "my query");
    expect(result.expanded_query).toBe("my query");
  });

  test("extracts JSON from surrounding text", () => {
    const text =
      'Here is the result: {"intent": "treatment_check", "legal_concepts": ["BGH"]}\n\nDone.';
    const result = parseRoutingResult(text, "test");
    expect(result.intent).toBe("treatment_check");
    expect(result.legal_concepts).toEqual(["BGH"]);
  });
});
