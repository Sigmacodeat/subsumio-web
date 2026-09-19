import { describe, test, expect } from "bun:test";
import { finalAnswerEvent } from "../src/core/think/final-answer.ts";

describe("finalAnswerEvent", () => {
  test("no replacement when the verified answer is what was streamed", () => {
    expect(finalAnswerEvent("Antwort  nach § 1 ABGB", "Antwort nach § 1 ABGB", [])).toEqual({});
  });

  test("a guardrail regeneration replaces the streamed draft", () => {
    const r = finalAnswerEvent("Entwurf § 999 ABGB", "Neu § 1295 ABGB", [
      "GUARDRAIL_REGENERATION_PASSED",
    ]);
    expect(r).toEqual({
      final_answer: "Neu § 1295 ABGB",
      answer_revised: true,
      revision_reason: "citation_guardrail",
    });
  });

  test("cross-verify regeneration wins as the reason", () => {
    const r = finalAnswerEvent("a", "b", [
      "GUARDRAIL_REGENERATION_PASSED",
      "CROSS_VERIFY_REGENERATION_DONE",
    ]);
    expect(r.revision_reason).toBe("cross_verify");
  });

  test("a still-flagged regeneration carries a visible warning", () => {
    const r = finalAnswerEvent("a", "b", ["GUARDRAIL_REGENERATION_STILL_FLAGGED: 2 flags"]);
    expect(r.final_answer?.startsWith("⚠️ Hinweis")).toBe(true);
    expect(r.final_answer?.endsWith("b")).toBe(true);
  });

  test("a duplicated stream (fallback re-stream) is replaced by the clean answer", () => {
    const r = finalAnswerEvent("Teil Teil vollständig", "Teil vollständig", [
      "STREAM_FAILED_FALLBACK: x",
    ]);
    expect(r.final_answer).toBe("Teil vollständig");
  });
});

describe("finalAnswerEvent — retrieval outage", () => {
  test("an answer produced while retrieval was down carries a visible warning", () => {
    const r = finalAnswerEvent("Antwort", "Antwort", [
      "RETRIEVAL_FAILED: page search unavailable — answer is not source-backed",
    ]);
    expect(r.final_answer?.startsWith("⚠️ Hinweis: Die Suche")).toBe(true);
    expect(r.revision_reason).toBe("retrieval_failed");
  });
});
