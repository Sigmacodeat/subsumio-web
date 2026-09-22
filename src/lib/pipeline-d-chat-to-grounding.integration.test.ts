// @vitest-environment node
/**
 * Pipeline D: Chat Query → Intent → Routing → Citation Extraction → Grounding
 * =========================================================================
 * Integration test chaining the legal chat pipeline from user query through
 * citation grounding verification.
 *
 * Stages:
 *   1. parseIntent              — classify user chat intent
 *   2. parseRoutingResult       — parse LLM routing response for RAG strategy
 *   3. extractStatuteCitations  — extract § references from answer text
 *   4. groundAnswerCitations    — verify citations against law corpus
 *
 * No vi.mock for business logic — only fs.readFile is mocked for grounding
 * (to avoid reading actual corpus files in unit tests).
 */

import { describe, test, expect, vi, beforeEach } from "vitest";
import { parseIntent } from "@/lib/legal-chat/actions";
import { parseRoutingResult } from "@/lib/legal-graph/pipeline";
import {
  extractStatuteCitations,
  groundAnswerCitations,
  extractTextFromJsonResponse,
  groundJsonResponse,
} from "@/lib/citation-gate";

// Mock fs.promises.readFile for grounding verification — the module imports
// `{ promises as fs } from "node:fs"`, so the mock must live on node:fs, not
// node:fs/promises (otherwise CI without law-corpus/ reads the real fs).
vi.mock("node:fs", async () => {
  const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
  const fn = vi.fn();
  return {
    ...actual,
    default: { ...actual, promises: { ...actual.promises, readFile: fn } },
    promises: { ...actual.promises, readFile: fn },
  };
});

import { promises as fs } from "node:fs";
const mockReadFile = vi.mocked(fs.readFile);

// ── Fixtures ───────────────────────────────────────────────────────────

const LEGAL_ANSWER = `
Gemäß § 433 BGB regelt das Kaufrecht die Pflichten von Verkäufer und Käufer.
Der Verkäufer hat die Sache zu übergeben und das Eigentum zu verschaffen.
Bei Mängeln greift § 437 BGB mit den Nacherfüllungsansprüchen.
Die Verjährung erfolgt nach § 195 BGB mit einer regelmäßigen Verjährungsfrist von drei Jahren.
`;

const LLM_ROUTING_RESPONSE = `{
  "intent": "legal_question",
  "legal_concepts": ["BGB § 433", "Kaufrecht", "Gewährleistung"],
  "jurisdiction": "de",
  "suggested_filters": {
    "legalArea": "Zivilrecht"
  },
  "search_strategy": "hybrid",
  "expanded_query": "Kaufrecht Gewährleistung BGB 433 437 Verjährung"
}`;

const LLM_ANSWER_RESPONSE = {
  answer:
    "Nach § 433 BGB hat der Verkäufer die Pflicht zur Übergabe. § 437 BGB regelt die Gewährleistung.",
  summary: "Kaufrechtliche Pflichten nach BGB",
  risks: [
    {
      text: "Verjährung nach § 195 BGB innerhalb von 3 Jahren",
      reason: "Fristbeginn nach § 199 BGB",
    },
  ],
};

// ── Pipeline ───────────────────────────────────────────────────────────

describe("Pipeline D: Chat → Intent → Routing → Citation → Grounding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("full pipeline: user query through citation grounding", async () => {
    // ── Stage 1: Parse user intent ────────────────────────────────────
    // "finde" triggers search; "suche" is captured by brain_query earlier
    const intent = parseIntent("finde Akte Müller");
    expect(intent.kind).toBe("search");
    if (intent.kind !== "search") return;
    expect(intent.query).toContain("Müller");

    // ── Stage 2: Parse LLM routing response ───────────────────────────
    const routing = parseRoutingResult(LLM_ROUTING_RESPONSE, "Kaufvertrag BGB");

    expect(routing.intent).toBe("legal_question");
    expect(routing.legal_concepts).toContain("BGB § 433");
    expect(routing.jurisdiction).toBe("de");
    expect(routing.search_strategy).toBe("hybrid");
    expect(routing.expanded_query).toContain("Kaufrecht");

    // ── Stage 3: Extract statute citations from answer ────────────────
    const citations = extractStatuteCitations(LEGAL_ANSWER);

    // Should find § 433 BGB, § 437 BGB, § 195 BGB
    expect(citations.length).toBeGreaterThanOrEqual(3);

    const codes = citations.map((c) => c.code);
    expect(codes).toContain("BGB");

    const paragraphs = citations.map((c) => c.paragraph);
    expect(paragraphs.some((p) => p?.includes("433"))).toBe(true);
    expect(paragraphs.some((p) => p?.includes("437"))).toBe(true);
    expect(paragraphs.some((p) => p?.includes("195"))).toBe(true);

    // ── Stage 4: Ground citations against corpus ──────────────────────
    // The mock has to look like a real corpus file. lookupCorpusParagraph
    // reads the norm under its "## § N" heading — a prose sentence mentioning
    // the paragraph matches nothing, so grounding verified zero citations and
    // this test failed for that reason alone, not because of the pipeline.
    mockReadFile.mockResolvedValue(
      [
        "## § 195 Regelmäßige Verjährungsfrist",
        "Die regelmäßige Verjährungsfrist beträgt drei Jahre.",
        "",
        "## § 433 Vertragstypische Pflichten beim Kaufvertrag",
        "Durch den Kaufvertrag wird der Verkäufer einer Sache verpflichtet, dem Käufer die Sache zu übergeben und das Eigentum an der Sache zu verschaffen.",
        "",
        "## § 437 Rechte des Käufers bei Mängeln",
        "Ist die Sache mangelhaft, kann der Käufer Nacherfüllung verlangen, vom Vertrag zurücktreten oder den Kaufpreis mindern.",
      ].join("\n")
    );

    const grounding = await groundAnswerCitations(LEGAL_ANSWER);

    expect(grounding.corpus_checked).toBe(true);
    expect(grounding.grounded_citations.length).toBeGreaterThanOrEqual(3);
    expect(grounding.analyzed_at).toBeTruthy();

    // Every cited paragraph stands in the mocked corpus file, so all of them
    // verify — a weaker "> 0" hid the fact that none of them did.
    const verifiedCount = grounding.citations_verified;
    expect(verifiedCount).toBeGreaterThanOrEqual(3);
  });

  test("pipeline: routing handles malformed LLM response gracefully", () => {
    const badResponse = "Sorry, I could not generate a JSON response.";
    const routing = parseRoutingResult(badResponse, "original query");

    // Should fall back to defaults
    expect(routing.intent).toBe("general");
    expect(routing.expanded_query).toBe("original query");
    expect(routing.search_strategy).toBe("hybrid");
    expect(routing.legal_concepts).toEqual([]);
  });

  test("pipeline: JSON response grounding extracts citations from structured fields", async () => {
    mockReadFile.mockResolvedValue("Kaufvertragsgewährleistung nach BGB...");

    const grounding = await groundJsonResponse(LLM_ANSWER_RESPONSE);

    expect(grounding.corpus_checked).toBe(true);
    // Should find citations from both "answer" and "risks[].text" fields
    expect(grounding.grounded_citations.length).toBeGreaterThanOrEqual(2);

    const codes = grounding.grounded_citations.map((c) => c.code);
    expect(codes).toContain("BGB");
  });

  test("pipeline: text without statutes produces empty grounding", async () => {
    const plainText = "Der Mandant sollte den Vertrag sorgfältig prüfen.";
    const grounding = await groundAnswerCitations(plainText);

    expect(grounding.citations_verified).toBe(0);
    expect(grounding.citations_unverified).toBe(0);
    expect(grounding.grounded_citations).toHaveLength(0);
    expect(grounding.has_unverified).toBe(false);
  });

  test("pipeline: unverified citations produce warning", async () => {
    mockReadFile.mockRejectedValue(new Error("ENOENT"));

    const text = "§ 999 NONEXISTENT regelt eine fiktive Norm.";
    const grounding = await groundAnswerCitations(text);

    expect(grounding.citations_unverified).toBe(1);
    expect(grounding.citations_verified).toBe(0);
    expect(grounding.has_unverified).toBe(true);
    expect(grounding.warning).toBeTruthy();
    expect(grounding.warning).toContain("1");
  });

  test("pipeline: intent parsing routes help vs search vs time_entry", () => {
    expect(parseIntent("hilfe").kind).toBe("help");
    expect(parseIntent("finde Akte Müller").kind).toBe("search");
    expect(parseIntent("30m akt 2026-014 telefonat").kind).toBe("time_entry");
    expect(parseIntent("abbrechen").kind).toBe("cancel");
  });

  test("pipeline: extractTextFromJsonResponse finds text in nested arrays", () => {
    const response = {
      answer: "§ 433 BGB",
      results: [
        { text: "§ 437 BGB", description: "Gewährleistung" },
        { text: "§ 195 BGB", reason: "Verjährung" },
      ],
      summary: "Zusammenfassung ohne Paragrafen",
    };

    const texts = extractTextFromJsonResponse(response);
    expect(texts.length).toBeGreaterThanOrEqual(3);
    expect(texts.some((t) => t.includes("433"))).toBe(true);
    expect(texts.some((t) => t.includes("437"))).toBe(true);
    expect(texts.some((t) => t.includes("195"))).toBe(true);
  });
});
