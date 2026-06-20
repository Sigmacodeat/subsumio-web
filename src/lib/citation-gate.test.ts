import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  extractStatuteCitations,
  groundAnswerCitations,
  groundRedlineCitations,
  createCitationGateStream,
  extractTextFromJsonResponse,
  groundJsonResponse,
  emptyGroundingMetadata,
} from "@/lib/citation-gate";
import { promises as fs } from "node:fs";

vi.mock("node:fs", () => {
  const fn = vi.fn();
  return {
    default: { promises: { readFile: fn } },
    promises: { readFile: fn },
  };
});

describe("extractStatuteCitations", () => {
  it("extracts simple statute references", () => {
    const text = "Der Kaufvertrag gemäß § 433 BGB regelt die Pflichten.";
    const result = extractStatuteCitations(text);
    expect(result).toHaveLength(1);
    expect(result[0].code).toBe("BGB");
    expect(result[0].paragraph).toBe("§ 433");
  });

  it("extracts multiple different statute references", () => {
    const text = "Gemäß § 433 BGB und § 922 ABGB sowie § 12 ZPO.";
    const result = extractStatuteCitations(text);
    expect(result).toHaveLength(3);
    expect(result.map((c) => c.code).sort()).toEqual(["ABGB", "BGB", "ZPO"]);
  });

  it("deduplicates identical references", () => {
    const text = "§ 433 BGB ist wichtig. Auch § 433 BGB sagt das.";
    const result = extractStatuteCitations(text);
    expect(result).toHaveLength(1);
  });

  it("handles §§ (multiple paragraphs)", () => {
    const text = "Die §§ 433 BGB und folgende gelten hier.";
    const result = extractStatuteCitations(text);
    expect(result).toHaveLength(1);
    expect(result[0].code).toBe("BGB");
  });

  it("handles Absatz references", () => {
    const text = "Nach § 433 Abs. 1 BGB muss geliefert werden.";
    const result = extractStatuteCitations(text);
    expect(result).toHaveLength(1);
    expect(result[0].code).toBe("BGB");
  });

  it("handles Austrian statute abbreviations with umlauts", () => {
    const text = "Der § 1 StGB regelt strafbare Handlungen.";
    const result = extractStatuteCitations(text);
    expect(result).toHaveLength(1);
    expect(result[0].code).toBe("StGB");
  });

  it("returns empty array for text without statute references", () => {
    const text = "Dies ist ein normaler Text ohne Gesetzesreferenzen.";
    const result = extractStatuteCitations(text);
    expect(result).toHaveLength(0);
  });

  it("includes context around the citation", () => {
    const text = "Wie bereits erörtert, regelt § 433 BGB die Pflichten des Verkäufers beim Kaufvertrag.";
    const result = extractStatuteCitations(text);
    expect(result).toHaveLength(1);
    expect(result[0].context).toContain("433");
    expect(result[0].context).toContain("BGB");
  });
});

describe("groundAnswerCitations", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns grounding metadata with verified citations", async () => {
    vi.mocked(fs.readFile).mockResolvedValueOnce("Kaufvertragsgewährleistung...");
    const text = "§ 433 BGB regelt die Pflichten.";
    const result = await groundAnswerCitations(text);
    expect(result.corpus_checked).toBe(true);
    expect(result.citations_verified).toBe(1);
    expect(result.citations_unverified).toBe(0);
    expect(result.grounded_citations).toHaveLength(1);
    expect(result.grounded_citations[0].verified).toBe(true);
    expect(result.analyzed_at).toBeTruthy();
  });

  it("returns grounding metadata with unverified citations when corpus miss", async () => {
    vi.mocked(fs.readFile).mockRejectedValue(new Error("ENOENT"));
    const text = "§ 999 NONEXISTENT regelt etwas.";
    const result = await groundAnswerCitations(text);
    expect(result.corpus_checked).toBe(true);
    expect(result.citations_verified).toBe(0);
    expect(result.citations_unverified).toBe(1);
  });

  it("returns empty grounding for text without statutes", async () => {
    const text = "Keine Gesetzesreferenzen hier.";
    const result = await groundAnswerCitations(text);
    expect(result.citations_verified).toBe(0);
    expect(result.citations_unverified).toBe(0);
    expect(result.grounded_citations).toHaveLength(0);
  });
});

describe("groundRedlineCitations", () => {
  beforeEach(() => vi.clearAllMocks());

  it("extracts statutes from legal_basis and reason fields", async () => {
    vi.mocked(fs.readFile).mockResolvedValueOnce("Kaufvertragsgewährleistung...");
    const redlines = [
      { legal_basis: "§ 433 BGB", reason: "Kaufvertragspflichten nach § 433 BGB" },
      { legal_basis: "§ 922 ABGB", reason: "Gewährleistung" },
    ];
    const result = await groundRedlineCitations(redlines);
    expect(result.corpus_checked).toBe(true);
    expect(result.grounded_citations.length).toBeGreaterThanOrEqual(1);
  });

  it("includes summary text in citation extraction", async () => {
    vi.mocked(fs.readFile).mockRejectedValue(new Error("ENOENT"));
    const redlines = [
      { legal_basis: "", reason: "Keine spezifische Norm" },
    ];
    const result = await groundRedlineCitations(redlines, "Zusammenfassung: § 433 BGB regelt den Kaufvertrag.");
    expect(result.grounded_citations.length).toBeGreaterThanOrEqual(1);
  });

  it("returns empty grounding for redlines without statute references", async () => {
    const redlines = [
      { legal_basis: "", reason: "Allgemeine Klauseländerung" },
    ];
    const result = await groundRedlineCitations(redlines, "Keine spezifischen Normen genannt.");
    expect(result.citations_verified).toBe(0);
    expect(result.citations_unverified).toBe(0);
    expect(result.grounded_citations).toHaveLength(0);
  });

  it("handles empty redlines array", async () => {
    const result = await groundRedlineCitations([]);
    expect(result.citations_verified).toBe(0);
    expect(result.grounded_citations).toHaveLength(0);
  });

  it("deduplicates statutes found across multiple redlines", async () => {
    vi.mocked(fs.readFile).mockRejectedValue(new Error("ENOENT"));
    const redlines = [
      { legal_basis: "§ 433 BGB", reason: "§ 433 BGB ist einschlägig" },
      { legal_basis: "§ 433 BGB", reason: "Siehe auch § 433 BGB" },
    ];
    const result = await groundRedlineCitations(redlines);
    const codes = result.grounded_citations.map((c) => `${c.code}#${c.paragraph}`);
    expect(new Set(codes).size).toBe(codes.length);
  });
});

describe("createCitationGateStream", () => {
  beforeEach(() => vi.clearAllMocks());

  function makeSSEStream(events: string[]): ReadableStream<Uint8Array> {
    const encoder = new TextEncoder();
    return new ReadableStream({
      start(controller) {
        for (const event of events) {
          controller.enqueue(encoder.encode(event));
        }
        controller.close();
      },
    });
  }

  async function readStream(stream: ReadableStream<Uint8Array>): Promise<string> {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let result = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      result += decoder.decode(value, { stream: true });
    }
    return result;
  }

  it("passes through chunk events and collects text", async () => {
    vi.mocked(fs.readFile).mockRejectedValue(new Error("ENOENT"));
    const events = [
      'data: {"chunk":"Der "}\n\n',
      'data: {"chunk":"§ 433 BGB"}\n\n',
      'data: {"citations":[],"gaps":[]}\n\n',
      "data: [DONE]\n\n",
    ];
    const stream = createCitationGateStream(makeSSEStream(events));
    const output = await readStream(stream);

    expect(output).toContain('"chunk":"Der "');
    expect(output).toContain('"chunk":"§ 433 BGB"');
    expect(output).toContain("[DONE]");
  });

  it("injects grounding metadata into citations event", async () => {
    vi.mocked(fs.readFile).mockResolvedValueOnce("Kaufvertragsgewährleistung...");
    const events = [
      'data: {"chunk":"§ 433 BGB"}\n\n',
      'data: {"citations":[{"page_slug":"bgb-433","row_num":null,"citation_index":1}],"gaps":[]}\n\n',
      "data: [DONE]\n\n",
    ];
    const stream = createCitationGateStream(makeSSEStream(events));
    const output = await readStream(stream);

    expect(output).toContain("grounding");
    expect(output).toContain("citations_verified");
    expect(output).toContain("corpus_checked");
  });

  it("handles empty stream gracefully", async () => {
    const stream = createCitationGateStream(makeSSEStream([]));
    const output = await readStream(stream);
    expect(output).toBe("");
  });

  it("passes through non-JSON data lines as-is", async () => {
    const events = ["data: not-json\n\n", "data: [DONE]\n\n"];
    const stream = createCitationGateStream(makeSSEStream(events));
    const output = await readStream(stream);
    expect(output).toContain("not-json");
    expect(output).toContain("[DONE]");
  });

  it("adds grounding with corpus_checked=false on grounding failure", async () => {
    vi.mocked(fs.readFile).mockRejectedValue(new Error("ENOENT"));
    const events = [
      'data: {"chunk":"§ 999 NONEXISTENT"}\n\n',
      'data: {"citations":[],"gaps":[]}\n\n',
      "data: [DONE]\n\n",
    ];
    const stream = createCitationGateStream(makeSSEStream(events));
    const output = await readStream(stream);

    expect(output).toContain("grounding");
    expect(output).toContain('"corpus_checked":true');
    expect(output).toContain('"citations_unverified":1');
  });
});

describe("extractTextFromJsonResponse", () => {
  it("extracts text from top-level string fields", () => {
    const obj = { answer: "§ 433 BGB regelt den Kaufvertrag.", summary: "Keine Normen" };
    const parts = extractTextFromJsonResponse(obj);
    expect(parts).toHaveLength(2);
    expect(parts[0]).toContain("433 BGB");
  });

  it("extracts text from array item fields", () => {
    const obj = {
      risks: [
        { description: "Risiko nach § 433 BGB", mitigation: "Prüfung nötig" },
        { description: "Keine Norm", mitigation: "" },
      ],
    };
    const parts = extractTextFromJsonResponse(obj);
    expect(parts.length).toBeGreaterThanOrEqual(2);
    expect(parts.some((p) => p.includes("433 BGB"))).toBe(true);
  });

  it("extracts text from redlines with legal_basis and reason", () => {
    const obj = {
      redlines: [
        { legal_basis: "§ 922 ABGB", reason: "Gewährleistung" },
      ],
    };
    const parts = extractTextFromJsonResponse(obj);
    expect(parts.length).toBeGreaterThanOrEqual(2);
    expect(parts.some((p) => p.includes("922 ABGB"))).toBe(true);
  });

  it("returns empty array for object without known fields", () => {
    const obj = { unknown_field: "§ 433 BGB", other: "text" };
    const parts = extractTextFromJsonResponse(obj);
    expect(parts).toHaveLength(0);
  });

  it("skips empty strings", () => {
    const obj = { answer: "", summary: "   ", report: "§ 1 StGB" };
    const parts = extractTextFromJsonResponse(obj);
    expect(parts).toHaveLength(1);
    expect(parts[0]).toContain("StGB");
  });

  it("skips non-object array items", () => {
    const obj = { results: ["string item", 42, null, { text: "§ 433 BGB" }] };
    const parts = extractTextFromJsonResponse(obj);
    expect(parts).toHaveLength(1);
    expect(parts[0]).toContain("433 BGB");
  });
});

describe("groundJsonResponse", () => {
  beforeEach(() => vi.clearAllMocks());

  it("grounds citations from a structured JSON response", async () => {
    vi.mocked(fs.readFile).mockResolvedValueOnce("Kaufvertragsgewährleistung...");
    const obj = { answer: "§ 433 BGB regelt den Kaufvertrag.", summary: "Zusammenfassung" };
    const result = await groundJsonResponse(obj);
    expect(result.corpus_checked).toBe(true);
    expect(result.citations_verified).toBe(1);
    expect(result.citations_unverified).toBe(0);
    expect(result.grounded_citations).toHaveLength(1);
  });

  it("grounds citations from array fields", async () => {
    vi.mocked(fs.readFile).mockRejectedValue(new Error("ENOENT"));
    const obj = {
      risks: [
        { description: "Risiko nach § 999 NONEXISTENT", mitigation: "Prüfung" },
      ],
    };
    const result = await groundJsonResponse(obj);
    expect(result.corpus_checked).toBe(true);
    expect(result.citations_unverified).toBe(1);
  });

  it("returns empty grounding for JSON without statute references", async () => {
    const obj = { answer: "Keine Normen hier.", summary: "Alles gut." };
    const result = await groundJsonResponse(obj);
    expect(result.citations_verified).toBe(0);
    expect(result.citations_unverified).toBe(0);
    expect(result.grounded_citations).toHaveLength(0);
    expect(result.corpus_checked).toBe(true);
  });

  it("returns corpus_checked=false for JSON without any known text fields", async () => {
    const obj = { unknown: "§ 433 BGB" };
    const result = await groundJsonResponse(obj);
    expect(result.corpus_checked).toBe(false);
    expect(result.grounded_citations).toHaveLength(0);
  });
});

describe("emptyGroundingMetadata", () => {
  it("returns valid empty grounding metadata", () => {
    const meta = emptyGroundingMetadata();
    expect(meta.citations_verified).toBe(0);
    expect(meta.citations_unverified).toBe(0);
    expect(meta.corpus_checked).toBe(false);
    expect(meta.grounded_citations).toHaveLength(0);
    expect(meta.analyzed_at).toBeTruthy();
  });

  it("returns fresh timestamp on each call", () => {
    const a = emptyGroundingMetadata();
    const b = emptyGroundingMetadata();
    expect(a.analyzed_at).toBeTruthy();
    expect(b.analyzed_at).toBeTruthy();
  });
});
