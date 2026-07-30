import { describe, it, expect, vi } from "vitest";
import {
  evaluateClaims,
  evaluateClaimsBatch,
  formatClaimReport,
  type ClaimEvalOpts,
} from "./claim-evaluation.ts";
import type { ChatOpts, ChatResult } from "./lab-dach/rubric-judge.ts";

// ── Mock Chat Function ────────────────────────────────────────────────

function makeMockChatFn(
  responses: Record<string, ChatResult>
): (opts: ChatOpts) => Promise<ChatResult> {
  return async (opts: ChatOpts) => {
    const systemKey = opts.system?.slice(0, 50) ?? "";
    if (systemKey.includes("Claim-Extractor")) {
      return responses.extract ?? { text: "[]" };
    }
    if (systemKey.includes("Claim-Verifier")) {
      return (
        responses.verify ?? { text: '{"status":"unsupported","evidence":"","reasoning":"mock"}' }
      );
    }
    if (systemKey.includes("Claim-Matcher")) {
      return (
        responses.match ?? { text: '{"found":false,"matched_claim_id":null,"reasoning":"mock"}' }
      );
    }
    return { text: "{}" };
  };
}

// ── Tests ─────────────────────────────────────────────────────────────

describe("evaluateClaims", () => {
  it("returns zero metrics for empty answer with no claims", async () => {
    const chatFn = makeMockChatFn({
      extract: { text: "[]" },
    });
    const result = await evaluateClaims({
      answer: "",
      context: "Some context",
      chatFn,
    });
    expect(result.metrics.total_claims).toBe(0);
    expect(result.metrics.claim_precision).toBe(0);
    expect(result.metrics.misgrounding_rate).toBe(0);
    expect(result.metrics.claim_recall).toBe(1.0); // No expected claims → perfect recall
    // precision 0 >= 0.8 → false → fail
    expect(result.metrics.pass).toBe(false);
  });

  it("extracts and verifies claims correctly", async () => {
    const chatFn = makeMockChatFn({
      extract: {
        text: JSON.stringify([
          { id: 1, text: "§ 823 BGB regelt die Schadensersatzpflicht" },
          { id: 2, text: "Die Verjährungsfrist beträgt drei Jahre" },
        ]),
      },
      verify: {
        text: JSON.stringify({
          status: "supported",
          evidence: "§ 823 BGB: Wer vorsätzlich oder fahrlässig...",
          reasoning: "Kontext bestätigt den Claim",
        }),
      },
    });

    const result = await evaluateClaims({
      answer: "Gemäß § 823 BGB wird Schadensersatz geregelt. Die Verjährung beträgt drei Jahre.",
      context:
        "§ 823 BGB: Wer vorsätzlich oder fahrlässig das Leben, Körper, Gesundheit... verletzt, ist zum Schadensersatz verpflichtet.",
      chatFn,
    });

    expect(result.metrics.total_claims).toBe(2);
    expect(result.metrics.supported_claims).toBe(2);
    expect(result.metrics.claim_precision).toBe(1.0);
    expect(result.metrics.misgrounding_rate).toBe(0);
    expect(result.hallucinated_claims.length).toBe(0);
  });

  it("detects unsupported claims (hallucinations)", async () => {
    let callCount = 0;
    const chatFn = async (opts: ChatOpts): Promise<ChatResult> => {
      if (opts.system?.includes("Claim-Extractor")) {
        return {
          text: JSON.stringify([
            { id: 1, text: "§ 823 BGB regelt Schadensersatz" },
            { id: 2, text: "Die Strafe beträgt 10 Jahre Gefängnis" },
          ]),
        };
      }
      if (opts.system?.includes("Claim-Verifier")) {
        callCount++;
        if (callCount === 1) {
          return {
            text: JSON.stringify({
              status: "supported",
              evidence: "§ 823 BGB...",
              reasoning: "Supported",
            }),
          };
        }
        return {
          text: JSON.stringify({
            status: "unsupported",
            evidence: "",
            reasoning: "Not found in context",
          }),
        };
      }
      return { text: "{}" };
    };

    const result = await evaluateClaims({
      answer: "§ 823 BGB regelt Schadensersatz. Die Strafe beträgt 10 Jahre.",
      context: "§ 823 BGB: Wer vorsätzlich oder fahrlässig...",
      chatFn,
    });

    expect(result.metrics.total_claims).toBe(2);
    expect(result.metrics.supported_claims).toBe(1);
    expect(result.metrics.unsupported_claims).toBe(1);
    expect(result.metrics.claim_precision).toBe(0.5);
    expect(result.metrics.misgrounding_rate).toBe(0.5);
    expect(result.hallucinated_claims.length).toBe(1);
    expect(result.hallucinated_claims[0].text).toContain("Strafe");
  });

  it("checks expected claims against extracted claims", async () => {
    const chatFn = makeMockChatFn({
      extract: {
        text: JSON.stringify([
          { id: 1, text: "§ 823 BGB regelt die Schadensersatzpflicht" },
          { id: 2, text: "Das Verschuldensprinzip gilt" },
        ]),
      },
      verify: {
        text: JSON.stringify({ status: "supported", evidence: "§ 823 BGB", reasoning: "ok" }),
      },
      match: {
        text: JSON.stringify({ found: true, matched_claim_id: 1, reasoning: "Match" }),
      },
    });

    const result = await evaluateClaims({
      answer: "§ 823 BGB regelt Schadensersatz. Verschuldensprinzip gilt.",
      context: "§ 823 BGB: Wer vorsätzlich...",
      expectedClaims: ["§ 823 BGB wird zitiert"],
      chatFn,
    });

    expect(result.expected_claims.length).toBe(1);
    expect(result.expected_claims[0].found).toBe(true);
    expect(result.metrics.claim_recall).toBe(1.0);
  });

  it("reports missing expected claims", async () => {
    const chatFn = makeMockChatFn({
      extract: {
        text: JSON.stringify([{ id: 1, text: "§ 823 BGB regelt Schadensersatz" }]),
      },
      verify: {
        text: JSON.stringify({ status: "supported", evidence: "§ 823", reasoning: "ok" }),
      },
      match: {
        text: JSON.stringify({ found: false, matched_claim_id: null, reasoning: "Not found" }),
      },
    });

    const result = await evaluateClaims({
      answer: "§ 823 BGB regelt Schadensersatz.",
      context: "§ 823 BGB...",
      expectedClaims: ["Verjährungsfrist von drei Jahren"],
      chatFn,
    });

    expect(result.expected_claims[0].found).toBe(false);
    expect(result.metrics.claim_recall).toBe(0);
  });

  it("fail-closed on parse errors", async () => {
    const chatFn = async (opts: ChatOpts): Promise<ChatResult> => {
      if (opts.system?.includes("Claim-Extractor")) {
        return { text: "not valid json at all" };
      }
      return { text: "{}" };
    };

    const result = await evaluateClaims({
      answer: "Some answer",
      context: "Some context",
      chatFn,
    });

    expect(result.metrics.total_claims).toBe(0);
    expect(result.metrics.claim_precision).toBe(0);
  });

  it("fail-closed on LLM errors", async () => {
    const chatFn = async (): Promise<ChatResult> => {
      throw new Error("LLM API error");
    };

    await expect(
      evaluateClaims({
        answer: "Some answer",
        context: "Some context",
        chatFn,
      })
    ).rejects.toThrow("LLM API error");
  });

  it("respects custom thresholds", async () => {
    const chatFn = makeMockChatFn({
      extract: {
        text: JSON.stringify([
          { id: 1, text: "Claim 1" },
          { id: 2, text: "Claim 2" },
        ]),
      },
      verify: {
        text: JSON.stringify({ status: "supported", evidence: "yes", reasoning: "ok" }),
      },
    });

    const result = await evaluateClaims({
      answer: "Answer with two claims.",
      context: "Context supporting both claims.",
      minPrecision: 1.0,
      minRecall: 1.0,
      chatFn,
    });

    expect(result.metrics.claim_precision).toBe(1.0);
    expect(result.metrics.pass).toBe(true);
  });
});

describe("evaluateClaimsBatch", () => {
  it("processes multiple items", async () => {
    const chatFn = makeMockChatFn({
      extract: {
        text: JSON.stringify([{ id: 1, text: "Test claim" }]),
      },
      verify: {
        text: JSON.stringify({ status: "supported", evidence: "yes", reasoning: "ok" }),
      },
    });

    const results = await evaluateClaimsBatch(
      [
        { question_id: "q1", answer: "Answer 1", context: "Context 1" },
        { question_id: "q2", answer: "Answer 2", context: "Context 2" },
      ],
      chatFn
    );

    expect(results.length).toBe(2);
    expect(results[0].question_id).toBe("q1");
    expect(results[0].result.metrics.total_claims).toBe(1);
    expect(results[1].question_id).toBe("q2");
  });

  it("handles errors gracefully per item", async () => {
    let callCount = 0;
    const chatFn = async (opts: ChatOpts): Promise<ChatResult> => {
      callCount++;
      if (callCount === 1) throw new Error("API error on first item");
      return { text: JSON.stringify([{ id: 1, text: "Claim" }]) };
    };

    const results = await evaluateClaimsBatch(
      [
        { question_id: "q1", answer: "Answer 1", context: "Context 1" },
        { question_id: "q2", answer: "Answer 2", context: "Context 2" },
      ],
      chatFn
    );

    expect(results.length).toBe(2);
    expect(results[0].error).toBeDefined();
    expect(results[0].result.metrics.pass).toBe(false);
    expect(results[1].error).toBeUndefined();
  });

  it("calls onProgress callback", async () => {
    const chatFn = makeMockChatFn({
      extract: { text: "[]" },
    });

    const progress: Array<{ idx: number; total: number }> = [];
    await evaluateClaimsBatch(
      [{ question_id: "q1", answer: "A", context: "C" }],
      chatFn,
      (idx, total) => progress.push({ idx, total })
    );

    expect(progress.length).toBe(1);
    expect(progress[0]).toEqual({ idx: 1, total: 1 });
  });
});

describe("formatClaimReport", () => {
  it("formats a report for valid results", async () => {
    const chatFn = makeMockChatFn({
      extract: {
        text: JSON.stringify([{ id: 1, text: "Test claim" }]),
      },
      verify: {
        text: JSON.stringify({ status: "supported", evidence: "yes", reasoning: "ok" }),
      },
    });

    const results = await evaluateClaimsBatch(
      [{ question_id: "q1", answer: "Test answer", context: "Test context" }],
      chatFn
    );

    const report = formatClaimReport(results);
    expect(report).toContain("Claim-Level Evaluation Report");
    expect(report).toContain("Total answers evaluated: 1");
    expect(report).toContain("Average Claim Precision");
  });

  it("handles empty results", () => {
    const report = formatClaimReport([]);
    expect(report).toContain("No valid results");
  });

  it("shows hallucinated claims in report", async () => {
    let verifyCall = 0;
    const chatFn = async (opts: ChatOpts): Promise<ChatResult> => {
      if (opts.system?.includes("Claim-Extractor")) {
        return {
          text: JSON.stringify([
            { id: 1, text: "Supported claim" },
            { id: 2, text: "Hallucinated claim about aliens" },
          ]),
        };
      }
      if (opts.system?.includes("Claim-Verifier")) {
        verifyCall++;
        if (verifyCall === 1) {
          return {
            text: JSON.stringify({ status: "supported", evidence: "yes", reasoning: "ok" }),
          };
        }
        return {
          text: JSON.stringify({
            status: "unsupported",
            evidence: "",
            reasoning: "not in context",
          }),
        };
      }
      return { text: "{}" };
    };

    const results = await evaluateClaimsBatch(
      [{ question_id: "q1", answer: "Answer", context: "Context" }],
      chatFn
    );

    const report = formatClaimReport(results);
    expect(report).toContain("Hallucinated Claims");
    expect(report).toContain("aliens");
  });
});
