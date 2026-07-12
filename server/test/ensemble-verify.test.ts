import { describe, test, expect, mock } from "bun:test";
import {
  runParaphraseJudge,
  runEnsembleStrict,
  runEnsembleVerification,
  type ChatFn,
  type EnsembleVerifyOpts,
} from "../src/core/ensemble-verify.ts";
import type { ChatResult } from "../src/core/ai/gateway.ts";

// ── Mock chat function ────────────────────────────────────────────────

const mockChat: ChatFn = mock(async (opts) => {
  const userMsg = opts.messages[0]?.content ?? "";

  // Extract citations from the user message
  const citationLines = userMsg.match(/- (§ \d+[a-z]* [A-Z]+)/g) ?? [];
  const citations = citationLines.map((l: string) => l.replace("- ", ""));

  const makeResult = (text: string): ChatResult => ({
    text,
    blocks: [{ type: "text" as const, text }],
    stopReason: "end" as const,
    usage: { input_tokens: 100, output_tokens: 50, cache_read_tokens: 0, cache_creation_tokens: 0 },
    model: opts.model ?? "",
    providerId: "mock",
  });

  // Paraphrase judge: verify all except "§ 999 BGB" (non-existent)
  if (opts.model?.includes("gpt-4o-mini")) {
    return makeResult(JSON.stringify({
      citations: citations.map((c: string) => ({
        citation: c,
        verified: !c.includes("999"),
        confidence: c.includes("999") ? 0.1 : 0.9,
        issue: c.includes("999") ? "§ nicht im Kontext gefunden" : undefined,
      })),
    }));
  }

  // Ensemble models: each model has slightly different behavior
  if (opts.model?.includes("gpt-4o")) {
    return makeResult(JSON.stringify({
      citations: citations.map((c: string) => ({
        citation: c,
        verified: true,
        confidence: 0.95,
        reason: "Im Kontext gefunden",
      })),
    }));
  }

  if (opts.model?.includes("claude")) {
    return makeResult(JSON.stringify({
      citations: citations.map((c: string) => ({
        citation: c,
        verified: !c.includes("999"),
        confidence: c.includes("999") ? 0.1 : 0.9,
        reason: c.includes("999") ? "Nicht im Kontext" : "Verifiziert",
      })),
    }));
  }

  if (opts.model?.includes("grok")) {
    return makeResult(JSON.stringify({
      citations: citations.map((c: string) => ({
        citation: c,
        verified: !c.includes("999") && !c.includes("434"),
        confidence: c.includes("999") || c.includes("434") ? 0.2 : 0.85,
        reason: c.includes("999") ? "Fingiert" : c.includes("434") ? "Falsche Anwendung" : "OK",
      })),
    }));
  }

  return makeResult("{}");
});

const failingChat: ChatFn = mock(async () => {
  throw new Error("API error");
});

const invalidJsonChat: ChatFn = mock(async () => ({
  text: "not json",
  blocks: [{ type: "text" as const, text: "not json" }],
  stopReason: "end" as const,
  usage: { input_tokens: 0, output_tokens: 0, cache_read_tokens: 0, cache_creation_tokens: 0 },
  model: "",
  providerId: "mock",
}));

const ENSEMBLE_TEST_MODELS = ["openrouter:openai/gpt-4o", "openrouter:anthropic/claude-3.5-sonnet", "openrouter:x-ai/grok-4.3"];

const TEST_ANSWER = "Gemäß § 433 BGB ist der Verkäufer verpflichtet, die Sache zu übergeben. § 999 BGB regelt die Pflichten des Käufers.";
const TEST_CONTEXT = "§ 433 BGB: Der Verkäufer ist verpflichtet, dem Käufer die Sache zu übergeben. § 434 BGB: Sachmangel.";
const TEST_CITATIONS = ["§ 433 BGB", "§ 999 BGB"];

describe("runParaphraseJudge", () => {
  test("verifies grounded citations and flags ungrounded ones", async () => {
    const results = await runParaphraseJudge(TEST_ANSWER, TEST_CONTEXT, TEST_CITATIONS, mockChat);

    expect(results.length).toBe(2);

    const c433 = results.find((r) => r.citation === "§ 433 BGB");
    expect(c433).toBeDefined();
    expect(c433!.verified).toBe(true);
    expect(c433!.confidence).toBeGreaterThan(0.5);

    const c999 = results.find((r) => r.citation === "§ 999 BGB");
    expect(c999).toBeDefined();
    expect(c999!.verified).toBe(false);
    expect(c999!.issue).toBeTruthy();
  });

  test("returns empty array for no citations", async () => {
    const results = await runParaphraseJudge("", TEST_CONTEXT, [], mockChat);
    expect(results.length).toBe(0);
  });

  test("returns default values on parse failure", async () => {
    const results = await runParaphraseJudge("test", "context", ["§ 1 BGB"], invalidJsonChat);
    expect(results.length).toBe(1);
    expect(results[0].verified).toBe(true);
    expect(results[0].confidence).toBe(0.5);
  });
});

describe("runEnsembleStrict", () => {
  test("majority vote correctly identifies ungrounded citation", async () => {
    const results = await runEnsembleStrict(
      TEST_ANSWER,
      TEST_CONTEXT,
      TEST_CITATIONS,
      ENSEMBLE_TEST_MODELS,
      mockChat
    );

    expect(results.length).toBe(2);

    // § 433: GPT-4o says yes, Claude says yes, Grok says yes → verified
    const c433 = results.find((r) => r.citation === "§ 433 BGB");
    expect(c433).toBeDefined();
    expect(c433!.verified).toBe(true);
    expect(c433!.votes.length).toBe(3);

    // § 999: GPT-4o says yes, Claude says no, Grok says no → NOT verified (2/3 say no)
    const c999 = results.find((r) => r.citation === "§ 999 BGB");
    expect(c999).toBeDefined();
    expect(c999!.verified).toBe(false);
  });

  test("handles model failures gracefully", async () => {
    const results = await runEnsembleStrict("test", "context", ["§ 1 BGB"], ["model1", "model2"], failingChat);
    expect(results.length).toBe(1);
    // All models failed → 0 votes → not verified (no majority)
    expect(results[0].votes.length).toBe(0);
    expect(results[0].verified).toBe(false);
  });

  test("returns empty for no citations", async () => {
    const results = await runEnsembleStrict("", "", [], ENSEMBLE_TEST_MODELS, mockChat);
    expect(results.length).toBe(0);
  });
});

describe("runEnsembleVerification", () => {
  const baseOpts: EnsembleVerifyOpts = {
    answer: TEST_ANSWER,
    context: TEST_CONTEXT,
    citations: TEST_CITATIONS,
    stage1Flags: [],
    stage2Result: {
      clean: true,
      flags: [],
      verified_citations: TEST_CITATIONS,
      flagged_citations: [],
    },
    ensembleMode: "standard",
    chatFn: mockChat,
  };

  test("runs stages 1+2+3 in standard mode", async () => {
    const result = await runEnsembleVerification(baseOpts);
    
    expect(result.stages_run).toContain(1);
    expect(result.stages_run).toContain(2);
    expect(result.stages_run).toContain(3);
    expect(result.stages_run).not.toContain(4);
    
    // § 999 should be flagged by stage 3
    const c999 = result.citations.find((c) => c.citation === "§ 999 BGB");
    expect(c999).toBeDefined();
    expect(c999!.verified).toBe(false);
    expect(c999!.flags.some((f) => f.stage === 3)).toBe(true);
  });

  test("runs all 4 stages in strict mode", async () => {
    const result = await runEnsembleVerification({
      ...baseOpts,
      ensembleMode: "strict",
    });
    
    expect(result.stages_run).toContain(4);
    expect(result.models_used.length).toBeGreaterThan(1);
    expect(result.estimated_cost).toBeGreaterThan(0);
  });

  test("incorporates stage 1 flags", async () => {
    const result = await runEnsembleVerification({
      ...baseOpts,
      stage1Flags: [
        {
          type: "ungrounded_citation",
          detail: "§ 999 not in context",
          citation: "§ 999 BGB",
          severity: "high",
        },
      ],
    });
    
    const c999 = result.citations.find((c) => c.citation === "§ 999 BGB");
    expect(c999).toBeDefined();
    expect(c999!.flags.some((f) => f.stage === 1)).toBe(true);
    expect(c999!.verified).toBe(false);
  });

  test("incorporates stage 2 flags", async () => {
    const result = await runEnsembleVerification({
      ...baseOpts,
      stage2Result: {
        clean: false,
        flags: [
          {
            type: "fabricated_reference",
            detail: "§ 999 appears fabricated",
            citation: "§ 999 BGB",
            severity: "high",
          },
        ],
        verified_citations: ["§ 433 BGB"],
        flagged_citations: ["§ 999 BGB"],
      },
    });
    
    const c999 = result.citations.find((c) => c.citation === "§ 999 BGB");
    expect(c999!.flags.some((f) => f.stage === 2)).toBe(true);
    expect(c999!.verified).toBe(false);
  });

  test("clean when all citations verified", async () => {
    const result = await runEnsembleVerification({
      ...baseOpts,
      citations: ["§ 433 BGB"],
      answer: "§ 433 BGB regelt die Übergabe.",
    });
    
    expect(result.clean).toBe(true);
    const c433 = result.citations.find((c) => c.citation === "§ 433 BGB");
    expect(c433!.verified).toBe(true);
  });

  test("method string describes stages", async () => {
    const result = await runEnsembleVerification(baseOpts);
    expect(result.method).toContain("Stage 1");
    expect(result.method).toContain("Stage 3");
  });

  test("method string includes ensemble in strict mode", async () => {
    const result = await runEnsembleVerification({
      ...baseOpts,
      ensembleMode: "strict",
    });
    expect(result.method).toContain("Stage 4");
    expect(result.method).toContain("ensemble");
  });

  test("handles empty citations", async () => {
    const result = await runEnsembleVerification({
      ...baseOpts,
      citations: [],
    });
    expect(result.citations.length).toBe(0);
    expect(result.clean).toBe(true);
  });
});
