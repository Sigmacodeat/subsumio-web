import { describe, test, expect } from "vitest";
import {
  parsePrincipleOutput,
  extractPrinciples,
  type ExtractedPrinciple,
} from "./principle-extraction";

describe("parsePrincipleOutput", () => {
  test("parses raw JSON array", () => {
    const raw = JSON.stringify([
      {
        title: "Schadensminderungspflicht",
        statement: "Der Geschädigte ist verpflichtet, den Schaden so gering wie möglich zu halten.",
        legal_area: "civil",
        citations: ["§ 254 BGB"],
        confidence: 0.9,
      },
    ]);
    const result = parsePrincipleOutput(raw, "judgement-001");
    expect(result.length).toBe(1);
    expect(result[0].title).toBe("Schadensminderungspflicht");
    expect(result[0].confidence).toBe(0.9);
    expect(result[0].source_judgement_id).toBe("judgement-001");
    expect(result[0].hierarchy_level).toBe("principle");
  });

  test("parses JSON from code block", () => {
    const raw = `Here are the principles:\n\`\`\`json\n[{"title":"Test","statement":"Test principle","legal_area":"civil","citations":[],"confidence":0.5}]\n\`\`\``;
    const result = parsePrincipleOutput(raw, "j-002");
    expect(result.length).toBe(1);
    expect(result[0].title).toBe("Test");
  });

  test("parses JSON with preamble text", () => {
    const raw = `I found these principles:\n[{"title":"A","statement":"B","legal_area":"criminal","citations":["§ 1 StGB"],"confidence":0.8}]\nDone.`;
    const result = parsePrincipleOutput(raw, "j-003");
    expect(result.length).toBe(1);
    expect(result[0].legal_area).toBe("criminal");
  });

  test("returns empty array for empty output", () => {
    const result = parsePrincipleOutput("", "j-004");
    expect(result).toEqual([]);
  });

  test("returns empty array for invalid JSON", () => {
    const result = parsePrincipleOutput("not json at all", "j-005");
    expect(result).toEqual([]);
  });

  test("filters out items without title or statement", () => {
    const raw = JSON.stringify([
      {
        title: "Valid",
        statement: "Valid principle",
        legal_area: "civil",
        citations: [],
        confidence: 0.7,
      },
      { title: "", statement: "No title" },
      { title: "No statement", statement: "" },
      { legal_area: "civil" },
    ]);
    const result = parsePrincipleOutput(raw, "j-006");
    expect(result.length).toBe(1);
    expect(result[0].title).toBe("Valid");
  });

  test("defaults legal_area to civil for invalid values", () => {
    const raw = JSON.stringify([
      { title: "Test", statement: "Test", legal_area: "invalid", citations: [], confidence: 0.5 },
    ]);
    const result = parsePrincipleOutput(raw, "j-007");
    expect(result[0].legal_area).toBe("civil");
  });

  test("clamps confidence to 0-1 range", () => {
    const raw = JSON.stringify([
      { title: "A", statement: "B", legal_area: "civil", citations: [], confidence: 1.5 },
      { title: "C", statement: "D", legal_area: "civil", citations: [], confidence: -0.5 },
    ]);
    const result = parsePrincipleOutput(raw, "j-008");
    expect(result[0].confidence).toBe(1);
    expect(result[1].confidence).toBe(0);
  });

  test("defaults confidence to 0.5 when missing", () => {
    const raw = JSON.stringify([
      { title: "A", statement: "B", legal_area: "civil", citations: [] },
    ]);
    const result = parsePrincipleOutput(raw, "j-009");
    expect(result[0].confidence).toBe(0.5);
  });
});

describe("extractPrinciples", () => {
  test("extracts principles using injected generate function", async () => {
    const mockGenerate = async (): Promise<string> => {
      return JSON.stringify([
        {
          title: "Verhältnismäßigkeit",
          statement: "Staliche Eingriffe müssen verhältnismäßig sein.",
          legal_area: "public",
          citations: ["Art. 20 GG"],
          confidence: 0.85,
        },
      ]);
    };

    const result = await extractPrinciples({
      judgementId: "j-100",
      judgementText: "Some court decision text about proportionality...",
      jurisdiction: "de",
      generate: mockGenerate,
    });

    expect(result.principles.length).toBe(1);
    expect(result.principles[0].title).toBe("Verhältnismäßigkeit");
    expect(result.error).toBeUndefined();
    expect(result.latency_ms).toBeGreaterThanOrEqual(0);
  });

  test("returns empty array when LLM returns empty", async () => {
    const mockGenerate = async (): Promise<string> => "[]";
    const result = await extractPrinciples({
      judgementId: "j-101",
      judgementText: "No clear principles here.",
      jurisdiction: "de",
      generate: mockGenerate,
    });
    expect(result.principles).toEqual([]);
  });

  test("returns error when generate throws", async () => {
    const mockGenerate = async (): Promise<string> => {
      throw new Error("LLM unavailable");
    };
    const result = await extractPrinciples({
      judgementId: "j-102",
      judgementText: "Some text",
      jurisdiction: "de",
      generate: mockGenerate,
    });
    expect(result.principles).toEqual([]);
    expect(result.error).toContain("LLM unavailable");
  });
});
