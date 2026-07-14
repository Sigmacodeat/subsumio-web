import { describe, it, expect } from "vitest";
import {
  crossJudgeAnswer,
  crossJudgeSession,
  detectDisagreement,
  assertDifferentVendors,
  runGroundingCheck,
  type ModelConfig,
  type CrossJudgeResult,
} from "./cross-judge.ts";
import type { ChatOpts, ChatResult } from "./rubric-judge.ts";
import type { Task, Criterion } from "./types.ts";

// ── Fixtures ──────────────────────────────────────────────────────────

function makeTask(overrides?: Partial<Task>): Task {
  return {
    id: "lab-dach-de-001",
    title: "Test Task",
    jurisdiction: "DE",
    legal_area: "litigation",
    workflow: "rechtsfrage_memorandum",
    difficulty: "normal",
    split: "dev",
    prompt: "Test prompt",
    deliverables: [{ type: "memo", filename: "memo.md", description: "test" }],
    criteria: [
      {
        id: "crit-001",
        description: "Is the analysis correct?",
        check_type: "llm_judge",
        critical: true,
        judge_question: "Does the output correctly identify the legal issue?",
      },
      {
        id: "crit-002",
        description: "Is the structure clear?",
        check_type: "llm_judge",
        critical: false,
        severity: "medium",
        judge_question: "Does the output have a clear structure?",
      },
    ],
    ...overrides,
  };
}

const MODEL_A: ModelConfig = {
  vendor: "anthropic",
  model_id: "claude-opus-4-8",
  label: "opus",
  max_tokens: 1024,
  temperature: 0,
};

const MODEL_B: ModelConfig = {
  vendor: "openai",
  model_id: "gpt-4.1",
  label: "gpt41",
  max_tokens: 1024,
  temperature: 0,
};

const MODEL_A_ALT: ModelConfig = {
  vendor: "anthropic",
  model_id: "claude-sonnet-4",
  label: "sonnet",
  max_tokens: 1024,
  temperature: 0,
};

function makeChatFn(response: string): (opts: ChatOpts) => Promise<ChatResult> {
  return async () => ({ text: response });
}

function makeSequentialChatFn(responses: string[]): (opts: ChatOpts) => Promise<ChatResult> {
  let idx = 0;
  return async () => {
    const resp = responses[idx] ?? responses[responses.length - 1]!;
    idx++;
    return { text: resp };
  };
}

function mockGroundAllVerified(citations: Array<{ code: string; paragraph: string }>) {
  return Promise.resolve(
    citations.map((c) => ({
      code: c.code,
      paragraph: c.paragraph,
      verified: true,
      source_text: `Mock norm text for § ${c.paragraph} ${c.code}`,
    }))
  );
}

function mockGroundAllUnverified(citations: Array<{ code: string; paragraph: string }>) {
  return Promise.resolve(
    citations.map((c) => ({
      code: c.code,
      paragraph: c.paragraph,
      verified: false,
    }))
  );
}

const PASS_RESPONSE =
  '{"status": "pass", "reasoning": "Correct", "confidence": 0.9, "evidence_quotes": ["quote"]}';
const FAIL_RESPONSE =
  '{"status": "fail", "reasoning": "Incorrect", "confidence": 0.8, "evidence_quotes": ["bad quote"]}';
const UNCERTAIN_RESPONSE =
  '{"status": "uncertain", "reasoning": "Borderline", "confidence": 0.4, "evidence_quotes": []}';

// ── assertDifferentVendors ─────────────────────────────────────────────

describe("assertDifferentVendors", () => {
  it("passes when vendors are different", () => {
    expect(() => assertDifferentVendors(MODEL_A, MODEL_B)).not.toThrow();
  });

  it("throws when vendors are the same (self-judging prevention)", () => {
    expect(() => assertDifferentVendors(MODEL_A, MODEL_A_ALT)).toThrow(
      /Cross-vendor violation.*same vendor.*anthropic/i
    );
  });
});

// ── runGroundingCheck ──────────────────────────────────────────────────

describe("runGroundingCheck", () => {
  it("returns all_verified=true when no citations found", async () => {
    const result = await runGroundingCheck("No citations here", mockGroundAllVerified);
    expect(result.citations).toEqual([]);
    expect(result.all_verified).toBe(true);
    expect(result.unverified).toEqual([]);
  });

  it("returns all_verified=true when all citations verified", async () => {
    const result = await runGroundingCheck(
      "Gemäß § 433 BGB und § 437 BGB",
      mockGroundAllVerified
    );
    expect(result.all_verified).toBe(true);
    expect(result.unverified).toEqual([]);
  });

  it("returns all_verified=false when citations are unverified", async () => {
    const result = await runGroundingCheck(
      "Gemäß § 433 BGB und § 999 BGB",
      mockGroundAllUnverified
    );
    expect(result.all_verified).toBe(false);
    expect(result.unverified).toHaveLength(2);
  });

  it("extracts CH-style Art. citations", async () => {
    const result = await runGroundingCheck(
      "Nach Art. 127 OR und Art. 12 StGB",
      mockGroundAllVerified
    );
    expect(result.citations).toHaveLength(2);
    expect(result.citations[0]!.code).toBe("OR");
    expect(result.citations[1]!.code).toBe("StGB");
  });
});

// ── crossJudgeAnswer ───────────────────────────────────────────────────

describe("crossJudgeAnswer", () => {
  it("judges answer with cross-vendor model (pass)", async () => {
    const task = makeTask();
    const result = await crossJudgeAnswer(
      task,
      "A good legal answer with § 433 BGB",
      MODEL_A,
      MODEL_B,
      "context",
      makeChatFn(PASS_RESPONSE),
      mockGroundAllVerified
    );

    expect(result.task_id).toBe("lab-dach-de-001");
    expect(result.criteria).toHaveLength(2);
    expect(result.criteria[0]!.passed).toBe(true);
    expect(result.criteria[0]!.grounding_overrode).toBe(false);
    expect(result.criteria[0]!.judge_model.vendor).toBe("openai");
    expect(result.criteria[0]!.answer_model.vendor).toBe("anthropic");
  });

  it("auto-fails when grounding check finds unverified citations", async () => {
    const task = makeTask();
    const result = await crossJudgeAnswer(
      task,
      "Answer with § 999 BGB (fake norm)",
      MODEL_A,
      MODEL_B,
      "context",
      makeChatFn(PASS_RESPONSE), // judge would say pass, but grounding overrides
      mockGroundAllUnverified
    );

    expect(result.criteria[0]!.grounding_passed).toBe(false);
    expect(result.criteria[0]!.grounding_overrode).toBe(true);
    expect(result.criteria[0]!.passed).toBe(false);
    expect(result.criteria[0]!.verdict.status).toBe("fail");
    expect(result.criteria[0]!.verdict.reasoning).toContain("Grounding gate");
    // Judge should NOT have been called — the corpus decides
    expect(result.criteria[0]!.verdict.raw_response).toBe("");
  });

  it("routes to review queue when critical criterion is present", async () => {
    const task = makeTask();
    const result = await crossJudgeAnswer(
      task,
      "Good answer with § 433 BGB",
      MODEL_A,
      MODEL_B,
      "context",
      makeChatFn(PASS_RESPONSE),
      mockGroundAllVerified
    );

    // crit-001 is critical → always needs human review
    expect(result.has_critical).toBe(true);
    expect(result.needs_review).toBe(true);
    expect(result.review_reasons).toContain("critical_criterion_requires_human");
  });

  it("routes to review queue when judge returns uncertain", async () => {
    const task = makeTask({
      criteria: [
        {
          id: "crit-001",
          description: "Is the analysis correct?",
          check_type: "llm_judge",
          critical: false,
          severity: "medium",
          judge_question: "Does the output correctly identify the legal issue?",
        },
      ],
    });
    const result = await crossJudgeAnswer(
      task,
      "Answer with § 433 BGB",
      MODEL_A,
      MODEL_B,
      "context",
      makeChatFn(UNCERTAIN_RESPONSE),
      mockGroundAllVerified
    );

    expect(result.has_uncertain).toBe(true);
    expect(result.needs_review).toBe(true);
    expect(result.review_reasons).toContain("uncertain_or_not_judgeable");
  });

  it("does not route to review when non-critical, all verified, and judge is pass/fail", async () => {
    const task = makeTask({
      criteria: [
        {
          id: "crit-001",
          description: "Is the structure clear?",
          check_type: "llm_judge",
          critical: false,
          severity: "low",
          judge_question: "Does the output have a clear structure?",
        },
      ],
    });
    const result = await crossJudgeAnswer(
      task,
      "Answer with § 433 BGB",
      MODEL_A,
      MODEL_B,
      "context",
      makeChatFn(PASS_RESPONSE),
      mockGroundAllVerified
    );

    expect(result.has_critical).toBe(false);
    expect(result.has_uncertain).toBe(false);
    expect(result.needs_review).toBe(false);
    expect(result.reviewer_type).toBe("llm_cross_judge");
  });

  it("throws when trying to self-judge (same vendor)", async () => {
    const task = makeTask();
    await expect(
      crossJudgeAnswer(
        task,
        "Answer",
        MODEL_A,
        MODEL_A_ALT, // same vendor: anthropic
        "context",
        makeChatFn(PASS_RESPONSE),
        mockGroundAllVerified
      )
    ).rejects.toThrow(/Cross-vendor violation/i);
  });

  it("sets reviewer_type to llm_cross_judge (never human)", async () => {
    const task = makeTask();
    const result = await crossJudgeAnswer(
      task,
      "Answer with § 433 BGB",
      MODEL_A,
      MODEL_B,
      "context",
      makeChatFn(PASS_RESPONSE),
      mockGroundAllVerified
    );

    expect(result.reviewer_type).toBe("llm_cross_judge");
    expect(result.reviewer_type).not.toBe("human_jurist");
  });
});

// ── crossJudgeSession ──────────────────────────────────────────────────

describe("crossJudgeSession", () => {
  it("runs two models and cross-judges both answers", async () => {
    const task = makeTask({
      criteria: [
        {
          id: "crit-001",
          description: "Is the analysis correct?",
          check_type: "llm_judge",
          critical: false,
          severity: "low",
          judge_question: "Does the output correctly identify the legal issue?",
        },
      ],
    });

    const generateFn = async (_model: ModelConfig, _task: Task) => "A good answer with § 433 BGB";
    const result = await crossJudgeSession(
      task,
      generateFn,
      makeChatFn(PASS_RESPONSE),
      "context",
      MODEL_A,
      MODEL_B,
      mockGroundAllVerified
    );

    expect(result.answer_a.text).toContain("good answer");
    expect(result.answer_b.text).toContain("good answer");
    expect(result.judge_a.criteria[0]!.passed).toBe(true);
    expect(result.judge_b.criteria[0]!.passed).toBe(true);
    expect(result.disagreement).toBe(false);
    // Non-critical, all verified, both pass → no review needed
    expect(result.needs_review).toBe(false);
  });

  it("detects disagreement when judges give different verdicts", async () => {
    const task = makeTask({
      criteria: [
        {
          id: "crit-001",
          description: "Is the analysis correct?",
          check_type: "llm_judge",
          critical: false,
          severity: "low",
          judge_question: "Does the output correctly identify the legal issue?",
        },
      ],
    });

    const generateFn = async (_model: ModelConfig, _task: Task) => "An answer with § 433 BGB";
    // First call judges answer A (by model B), second call judges answer B (by model A)
    const chatFn = makeSequentialChatFn([PASS_RESPONSE, FAIL_RESPONSE]);

    const result = await crossJudgeSession(
      task,
      generateFn,
      chatFn,
      "context",
      MODEL_A,
      MODEL_B,
      mockGroundAllVerified
    );

    expect(result.judge_a.criteria[0]!.passed).toBe(true);
    expect(result.judge_b.criteria[0]!.passed).toBe(false);
    expect(result.disagreement).toBe(true);
    expect(result.needs_review).toBe(true);
    expect(result.review_reasons).toContain("judge_disagreement");
  });

  it("throws when both models are from the same vendor", async () => {
    const task = makeTask();
    const generateFn = async () => "answer";

    await expect(
      crossJudgeSession(
        task,
        generateFn,
        makeChatFn(PASS_RESPONSE),
        "context",
        MODEL_A,
        MODEL_A_ALT, // same vendor
        mockGroundAllVerified
      )
    ).rejects.toThrow(/Cross-vendor violation/i);
  });
});

// ── detectDisagreement ─────────────────────────────────────────────────

describe("detectDisagreement", () => {
  it("returns false when both judges agree on all criteria", () => {
    const judgeA: CrossJudgeResult = {
      task_id: "t1",
      answer: { model_config: MODEL_A, text: "", grounding: { citations: [], all_verified: true, unverified: [] } },
      criteria: [
        { criterion_id: "c1", criterion: {} as Criterion, severity: "low", verdict: { status: "pass", passed: true, reasoning: "", confidence: 1, evidence_quotes: [], raw_response: "", model: "opus" }, grounding_passed: true, grounding_overrode: false, passed: true, judge_model: MODEL_B, answer_model: MODEL_A },
      ],
      all_pass: true,
      full_agreement: true,
      has_disagreement: false,
      has_uncertain: false,
      has_critical: false,
      needs_review: false,
      review_reasons: [],
      reviewer_type: "llm_cross_judge",
    };

    const judgeB: CrossJudgeResult = {
      ...judgeA,
      criteria: [
        { ...judgeA.criteria[0]!, passed: true },
      ],
    };

    expect(detectDisagreement(judgeA, judgeB)).toBe(false);
  });

  it("returns true when judges disagree on a criterion", () => {
    const judgeA: CrossJudgeResult = {
      task_id: "t1",
      answer: { model_config: MODEL_A, text: "", grounding: { citations: [], all_verified: true, unverified: [] } },
      criteria: [
        { criterion_id: "c1", criterion: {} as Criterion, severity: "low", verdict: { status: "pass", passed: true, reasoning: "", confidence: 1, evidence_quotes: [], raw_response: "", model: "opus" }, grounding_passed: true, grounding_overrode: false, passed: true, judge_model: MODEL_B, answer_model: MODEL_A },
      ],
      all_pass: true,
      full_agreement: true,
      has_disagreement: false,
      has_uncertain: false,
      has_critical: false,
      needs_review: false,
      review_reasons: [],
      reviewer_type: "llm_cross_judge",
    };

    const judgeB: CrossJudgeResult = {
      ...judgeA,
      criteria: [
        { ...judgeA.criteria[0]!, passed: false },
      ],
    };

    expect(detectDisagreement(judgeA, judgeB)).toBe(true);
  });
});
