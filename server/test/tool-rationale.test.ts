import { describe, it, expect } from "bun:test";
import {
  extractRationalesFromText,
  assignRationalesToToolCalls,
  RATIONALE_SYSTEM_PROMPT_APPENDIX,
} from "../src/core/minions/tool-rationale.ts";

describe("EBTE Tool-Rationale Extraction", () => {
  it("extracts single rationale from text", () => {
    const text = `<rationale tool="search">
Brauche §-Grundlage für Schadensersatz im AT-Zivilrecht.
</rationale>`;
    const rationales = extractRationalesFromText(text);
    expect(rationales).toHaveLength(1);
    expect(rationales[0]!.tool).toBe("search");
    expect(rationales[0]!.rationale).toContain("Schadensersatz");
  });

  it("extracts multiple rationales from text", () => {
    const text = `<rationale tool="search">Erste Suche nach §§</rationale>
Some text between
<rationale tool="get_page">Lade Detailseite</rationale>`;
    const rationales = extractRationalesFromText(text);
    expect(rationales).toHaveLength(2);
    expect(rationales[0]!.tool).toBe("search");
    expect(rationales[1]!.tool).toBe("get_page");
  });

  it("returns empty array when no rationale blocks present", () => {
    const text = "Just regular text without any rationale blocks.";
    const rationales = extractRationalesFromText(text);
    expect(rationales).toHaveLength(0);
  });

  it("handles empty rationale content", () => {
    const text = `<rationale tool="search"></rationale>`;
    const rationales = extractRationalesFromText(text);
    expect(rationales).toHaveLength(1);
    expect(rationales[0]!.rationale).toBe("");
  });

  it("handles multiline rationale content", () => {
    const text = `<rationale tool="search">
  Line 1: Why this tool.
  Line 2: What gap it fills.
  Line 3: Alternatives rejected.
</rationale>`;
    const rationales = extractRationalesFromText(text);
    expect(rationales).toHaveLength(1);
    expect(rationales[0]!.rationale).toContain("Line 1");
    expect(rationales[0]!.rationale).toContain("Line 3");
  });
});

describe("assignRationalesToToolCalls", () => {
  it("assigns rationale to matching tool call", () => {
    const toolCalls = [
      { tool: "search", input_summary: "§ 1311 ABGB", timestamp: "2026-01-01T00:00:00Z" },
    ];
    const rationales = [{ tool: "search", rationale: "Brauche Gesetz" }];
    const result = assignRationalesToToolCalls(toolCalls, rationales);
    expect(result[0]!.rationale).toBe("Brauche Gesetz");
  });

  it("assigns rationales to multiple calls of same tool (no cross-contamination)", () => {
    const toolCalls = [
      { tool: "search", input_summary: "query1", timestamp: "t1" },
      { tool: "search", input_summary: "query2", timestamp: "t2" },
    ];
    const rationales = [
      { tool: "search", rationale: "First rationale" },
      { tool: "search", rationale: "Second rationale" },
    ];
    const result = assignRationalesToToolCalls(toolCalls, rationales);
    expect(result[0]!.rationale).toBe("First rationale");
    expect(result[1]!.rationale).toBe("Second rationale");
  });

  it("leaves rationale undefined when no match found", () => {
    const toolCalls = [{ tool: "search", input_summary: "query", timestamp: "t" }];
    const rationales = [{ tool: "get_page", rationale: "Wrong tool" }];
    const result = assignRationalesToToolCalls(toolCalls, rationales);
    expect(result[0]!.rationale).toBeUndefined();
  });

  it("handles empty rationales array", () => {
    const toolCalls = [{ tool: "search", input_summary: "query", timestamp: "t" }];
    const result = assignRationalesToToolCalls(toolCalls, []);
    expect(result[0]!.rationale).toBeUndefined();
  });
});

describe("RATIONALE_SYSTEM_PROMPT_APPENDIX", () => {
  it("contains EBTE schema instructions", () => {
    expect(RATIONALE_SYSTEM_PROMPT_APPENDIX).toContain("rationale");
    expect(RATIONALE_SYSTEM_PROMPT_APPENDIX).toContain("tool");
  });

  it("mentions TRACE audit trail", () => {
    expect(RATIONALE_SYSTEM_PROMPT_APPENDIX).toContain("TRACE");
    expect(RATIONALE_SYSTEM_PROMPT_APPENDIX).toContain("audit");
  });

  it("instructs agent to output rationale before tool call", () => {
    expect(RATIONALE_SYSTEM_PROMPT_APPENDIX.toLowerCase()).toContain("before");
    expect(RATIONALE_SYSTEM_PROMPT_APPENDIX).toContain("tool_use");
  });
});
