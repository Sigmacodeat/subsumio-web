// @vitest-environment node

import { describe, test, expect } from "vitest";
import {
  extractStatuteCitations,
  extractTextFromJsonResponse,
  emptyGroundingMetadata,
} from "@/lib/citation-gate-client";

describe("extractStatuteCitations", () => {
  test("extracts simple § X BGB references", () => {
    const text = "Nach § 433 BGB hat der Verkäufer die Pflicht zur Übereignung.";
    const result = extractStatuteCitations(text);
    expect(result).toHaveLength(1);
    expect(result[0].code).toBe("BGB");
    expect(result[0].paragraph).toBe("§ 433");
  });

  test("extracts § X Abs. Y ZPO references", () => {
    const text = "Gemäß § 12 Abs. 3 ZPO ist die Klage zulässig.";
    const result = extractStatuteCitations(text);
    expect(result).toHaveLength(1);
    expect(result[0].code).toBe("ZPO");
    expect(result[0].paragraph).toBe("§ 12 Abs. 3");
  });

  test("extracts §§ (multiple paragraphs)", () => {
    const text = "Die §§ 433 BGB und § 434 BGB regeln die Sachmängelhaftung.";
    const result = extractStatuteCitations(text);
    expect(result).toHaveLength(2);
    expect(result[0].code).toBe("BGB");
    expect(result[1].code).toBe("BGB");
  });

  test("deduplicates identical citations", () => {
    const text = "§ 433 BGB ist zentral. § 433 BGB wird hier erneut erwähnt.";
    const result = extractStatuteCitations(text);
    expect(result).toHaveLength(1);
  });

  test("extracts StGB references", () => {
    const text = "§ 1 StGB regelt das Rückwirkungsverbot.";
    const result = extractStatuteCitations(text);
    expect(result).toHaveLength(1);
    expect(result[0].code).toBe("StGB");
  });

  test("extracts ABGB references", () => {
    const text = "§ 922 ABGB definiert den Eigentumserwerb.";
    const result = extractStatuteCitations(text);
    expect(result).toHaveLength(1);
    expect(result[0].code).toBe("ABGB");
  });

  test("returns empty array for text without citations", () => {
    const text = "Dies ist ein allgemeiner Text ohne Gesetzesverweise.";
    const result = extractStatuteCitations(text);
    expect(result).toHaveLength(0);
  });

  test("returns empty array for empty string", () => {
    expect(extractStatuteCitations("")).toHaveLength(0);
  });

  test("includes context around citation", () => {
    const text =
      "Lorem ipsum dolor sit amet. § 433 BGB regelt den Kaufvertrag. Consectetur adipiscing elit.";
    const result = extractStatuteCitations(text);
    expect(result).toHaveLength(1);
    expect(result[0].context).toContain("§ 433 BGB");
    expect(result[0].context.length).toBeGreaterThan(0);
  });

  test("handles paragraph numbers with letters (e.g. § 1a)", () => {
    const text = "§ 1a GewO regelt die Gewerbeanmeldung.";
    const result = extractStatuteCitations(text);
    expect(result).toHaveLength(1);
    expect(result[0].paragraph).toBe("§ 1a");
  });
});

describe("extractTextFromJsonResponse", () => {
  test("extracts from top-level string fields", () => {
    const obj = {
      answer: "§ 433 BGB",
      summary: "Kaufvertrag",
    };
    const result = extractTextFromJsonResponse(obj);
    expect(result).toContain("§ 433 BGB");
    expect(result).toContain("Kaufvertrag");
  });

  test("extracts from array fields with text items", () => {
    const obj = {
      risks: [
        { text: "Risiko 1", description: "Beschreibung 1" },
        { text: "Risiko 2", legal_basis: "§ 823 BGB" },
      ],
    };
    const result = extractTextFromJsonResponse(obj);
    expect(result).toContain("Risiko 1");
    expect(result).toContain("Beschreibung 1");
    expect(result).toContain("Risiko 2");
    expect(result).toContain("§ 823 BGB");
  });

  test("skips non-string fields", () => {
    const obj = {
      answer: 123,
      summary: null,
      text: "",
    };
    const result = extractTextFromJsonResponse(obj);
    expect(result).toHaveLength(0);
  });

  test("skips non-object array items", () => {
    const obj = {
      items: ["string item", 42, null, { text: "valid" }],
    };
    const result = extractTextFromJsonResponse(obj);
    expect(result).toContain("valid");
    expect(result).not.toContain("string item");
  });

  test("returns empty array for object without known fields", () => {
    const obj = { unknown_field: "test" };
    expect(extractTextFromJsonResponse(obj)).toHaveLength(0);
  });

  test("returns empty array for empty object", () => {
    expect(extractTextFromJsonResponse({})).toHaveLength(0);
  });

  test("handles all known text fields", () => {
    const obj = {
      memo: "memo text",
      analysis: "analysis text",
      review: "review text",
      conclusion: "conclusion text",
      recommendation: "recommendation text",
      report: "report text",
    };
    const result = extractTextFromJsonResponse(obj);
    expect(result).toHaveLength(6);
  });

  test("trims whitespace from extracted text", () => {
    const obj = { answer: "  trimmed  " };
    const result = extractTextFromJsonResponse(obj);
    expect(result[0]).toBe("trimmed");
  });
});

describe("emptyGroundingMetadata", () => {
  test("returns zeroed metadata", () => {
    const meta = emptyGroundingMetadata();
    expect(meta.citations_verified).toBe(0);
    expect(meta.citations_unverified).toBe(0);
    expect(meta.corpus_checked).toBe(false);
    expect(meta.grounded_citations).toEqual([]);
    expect(meta.has_unverified).toBe(false);
  });

  test("has ISO timestamp", () => {
    const meta = emptyGroundingMetadata();
    expect(meta.analyzed_at).toBeTruthy();
    expect(() => new Date(meta.analyzed_at)).not.toThrow();
  });

  test("has no warning by default", () => {
    const meta = emptyGroundingMetadata();
    expect(meta.warning).toBeUndefined();
  });
});
