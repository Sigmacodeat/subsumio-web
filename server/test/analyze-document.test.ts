/**
 * Proactive legal issue-spotting + the anti-hallucination grounding gate.
 * An issue the model invents (no verbatim anchor in the document) MUST be
 * dropped — a fabricated "problem" is exactly what a law firm cannot tolerate.
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { PGLiteEngine } from "../src/core/pglite-engine.ts";
import {
  analyzeDocument,
  groundIssues,
  isAnalysisFailed,
  isDateGroundedInText,
  splitForAnalysis,
  type AnalyzeLLM,
  type DocumentIssue,
} from "../src/core/legal/analyze-document.ts";

let engine: PGLiteEngine;

const CONTRACT = `Dienstleistungsvertrag zwischen Acme GmbH und Widget AG.
§ 5 Haftung: Die Haftung des Auftragnehmers ist vollständig ausgeschlossen.
§ 9 Laufzeit: Der Vertrag läuft auf unbestimmte Zeit mit einer Kündigungsfrist von 24 Monaten.`;

beforeAll(async () => {
  engine = new PGLiteEngine();
  await engine.connect({});
  await engine.initSchema();
  await engine.putPage("akten/vertrag-acme", {
    type: "legal_document",
    title: "Vertrag Acme",
    compiled_truth: CONTRACT,
    frontmatter: {},
  });
}, 60_000);

afterAll(async () => {
  if (engine) await engine.disconnect();
});

describe("groundIssues", () => {
  const issues: DocumentIssue[] = [
    {
      issue: "Totalausschluss der Haftung",
      severity: "high",
      quote: "Die Haftung des Auftragnehmers ist vollständig ausgeschlossen",
      rationale: "§ 309 Nr. 7 BGB",
    },
    {
      issue: "Erfundene Schiedsklausel",
      severity: "critical",
      quote: "Alle Streitigkeiten werden durch ein Schiedsgericht in Genf entschieden",
      rationale: "halluziniert",
    },
  ];

  test("keeps issues whose quote appears verbatim, drops the rest", () => {
    const { grounded, warnings } = groundIssues(issues, CONTRACT);
    expect(grounded.map((g) => g.issue)).toEqual(["Totalausschluss der Haftung"]);
    expect(warnings.some((w) => w.startsWith("UNGROUNDED_ISSUE_DROPPED"))).toBe(true);
  });

  test("whitespace differences in the quote still match", () => {
    const { grounded } = groundIssues(
      [
        {
          issue: "Lange Kündigungsfrist",
          severity: "medium",
          quote: "Kündigungsfrist von   24\n  Monaten",
          rationale: "§ 309 Nr. 9 BGB",
        },
      ],
      CONTRACT
    );
    expect(grounded.length).toBe(1);
  });
});

describe("analyzeDocument (stub LLM)", () => {
  const stub: AnalyzeLLM = async () =>
    JSON.stringify({
      document_type: "Dienstleistungsvertrag",
      parties: ["Acme GmbH", "Widget AG"],
      key_dates: [{ date: "unbestimmt", what: "Laufzeit" }],
      issues: [
        {
          issue: "Totalausschluss der Haftung",
          severity: "high",
          quote: "Die Haftung des Auftragnehmers ist vollständig ausgeschlossen",
          rationale: "§ 309 Nr. 7 BGB — unwirksam",
        },
        // Fabricated: this text is NOT in the contract → must be dropped.
        {
          issue: "Vertragsstrafe 1 Mio EUR",
          severity: "critical",
          quote: "Es wird eine Vertragsstrafe von 1.000.000 EUR vereinbart",
          rationale: "erfunden",
        },
      ],
      relevant_statutes: ["§ 309 BGB"],
      recommended_actions: ["Haftungsklausel nachverhandeln"],
    });

  test("returns a grounded brief; drops the fabricated issue + flags it", async () => {
    const a = await analyzeDocument(engine, { slug: "akten/vertrag-acme", llm: stub });
    expect(a.document_type).toBe("Dienstleistungsvertrag");
    expect(a.parties).toContain("Acme GmbH");
    expect(a.issues.map((i) => i.issue)).toEqual(["Totalausschluss der Haftung"]);
    expect(a.warnings).toContain("DROPPED_1_UNGROUNDED_ISSUES");
    expect(a.attorney_review_required).toBe(true);
  });

  test("malformed LLM output degrades gracefully, never throws", async () => {
    const a = await analyzeDocument(engine, {
      slug: "akten/vertrag-acme",
      llm: async () => "not json at all",
    });
    expect(a.issues).toEqual([]);
    expect(a.warnings).toContain("LLM_OUTPUT_NOT_JSON");
  });

  test("missing page throws a clear error", async () => {
    await expect(
      analyzeDocument(engine, { slug: "akten/gibt-es-nicht", llm: stub })
    ).rejects.toThrow(/not found/);
  });
});

describe("date grounding", () => {
  const text = "Zugestellt am 12.3.2026. Die Berufungsfrist endet am 9. April 2026.";
  test("accepts ISO dates the document spells in DACH formats", () => {
    expect(isDateGroundedInText("2026-03-12", text)).toBe(true);
    expect(isDateGroundedInText("2026-04-09", text)).toBe(true);
  });
  test("rejects dates the document does not carry", () => {
    expect(isDateGroundedInText("2026-05-01", text)).toBe(false);
  });
});

describe("long documents and model failures", () => {
  test("splitForAnalysis covers the tail of a long document", () => {
    const text = "a".repeat(50_000) + "ENDE";
    const { chunks, truncated } = splitForAnalysis(text, 24_000, 8);
    expect(truncated).toBe(false);
    expect(chunks[chunks.length - 1]!.endsWith("ENDE")).toBe(true);
  });

  test("a failing model yields a FAILED analysis, not an empty success", async () => {
    const llm: AnalyzeLLM = async () => {
      throw new Error("provider down");
    };
    const a = await analyzeDocument(engine, { slug: "akten/vertrag-acme", llm });
    expect(isAnalysisFailed(a)).toBe(true);
  });

  test("key dates without an anchor in the text are dropped", async () => {
    const llm: AnalyzeLLM = async () =>
      JSON.stringify({
        document_type: "Vertrag",
        key_dates: [{ date: "2031-01-01", what: "erfundene Frist" }],
        issues: [],
      });
    const a = await analyzeDocument(engine, { slug: "akten/vertrag-acme", llm });
    expect(isAnalysisFailed(a)).toBe(false);
    expect(a.key_dates).toEqual([]);
    expect(a.warnings.some((w) => w.includes("UNGROUNDED_DATES"))).toBe(true);
  });

  test("every part of a long document is sent to the model", async () => {
    await engine.putPage("akten/lang", {
      type: "legal_document",
      title: "Lang",
      compiled_truth: "x".repeat(30_000) + " Frist bis 9. April 2026.",
      frontmatter: {},
    });
    const seen: string[] = [];
    const llm: AnalyzeLLM = async ({ user }) => {
      seen.push(user);
      return JSON.stringify({
        document_type: "Bescheid",
        key_dates: user.includes("9. April 2026") ? [{ date: "2026-04-09", what: "Frist" }] : [],
        issues: [],
      });
    };
    const a = await analyzeDocument(engine, { slug: "akten/lang", llm, maxChars: 24_000 });
    expect(seen.length).toBe(2);
    expect(a.key_dates).toEqual([{ date: "2026-04-09", what: "Frist" }]);
  });
});
