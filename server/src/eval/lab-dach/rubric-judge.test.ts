import { describe, it, expect } from "vitest";
import {
  parseJudgeJSON,
  buildJudgeSystemPrompt,
  buildJudgeUserPrompt,
  getUnifiedJudgeConfig,
  getCrossFamilyJudgeConfig,
  JUDGE_CONFIGS,
  judgeCriterion,
  crossFamilyJudge,
  type JudgeInput,
  type ChatOpts,
  type ChatResult,
} from "./rubric-judge.ts";
import type { Task, Criterion } from "./types.ts";

// ── Fixtures ──────────────────────────────────────────────────────────

function makeTask(): Task {
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
    criteria: [],
  };
}

function makeCriterion(): Criterion {
  return {
    id: "crit-001",
    description: "Is the analysis correct?",
    check_type: "llm_judge",
    critical: true,
    judge_question: "Does the output correctly identify the legal issue?",
  };
}

// ── parseJudgeJSON (Strict 2-Strategy, Fail-Closed) ──────────────────

describe("parseJudgeJSON", () => {
  it("parses clean JSON with status field", () => {
    const raw =
      '{"status": "pass", "reasoning": "Analysis is correct", "confidence": 0.9, "evidence_quotes": ["quote 1"]}';
    const result = parseJudgeJSON(raw);
    expect(result).not.toBeNull();
    expect(result!.status).toBe("pass");
    expect(result!.reasoning).toBe("Analysis is correct");
    expect(result!.confidence).toBe(0.9);
    expect(result!.evidence_quotes).toEqual(["quote 1"]);
  });

  it("parses JSON in code block", () => {
    const raw =
      '```json\n{"status": "fail", "reasoning": "Incorrect", "confidence": 0.8, "evidence_quotes": []}\n```';
    const result = parseJudgeJSON(raw);
    expect(result).not.toBeNull();
    expect(result!.status).toBe("fail");
    expect(result!.reasoning).toBe("Incorrect");
  });

  it("parses uncertain status", () => {
    const raw =
      '{"status": "uncertain", "reasoning": "Borderline case", "confidence": 0.4, "evidence_quotes": ["some quote"]}';
    const result = parseJudgeJSON(raw);
    expect(result).not.toBeNull();
    expect(result!.status).toBe("uncertain");
  });

  it("parses not_judgeable status", () => {
    const raw =
      '{"status": "not_judgeable", "reasoning": "Output too short", "confidence": 0.1, "evidence_quotes": []}';
    const result = parseJudgeJSON(raw);
    expect(result).not.toBeNull();
    expect(result!.status).toBe("not_judgeable");
  });

  it("backward compat: converts old 'passed' field to status", () => {
    const raw = '{"passed": true, "reasoning": "Good", "confidence": 0.9}';
    const result = parseJudgeJSON(raw);
    expect(result).not.toBeNull();
    expect(result!.status).toBe("pass");
  });

  it("backward compat: converts passed=false to fail", () => {
    const raw = '{"passed": false, "reasoning": "Bad", "confidence": 0.9}';
    const result = parseJudgeJSON(raw);
    expect(result).not.toBeNull();
    expect(result!.status).toBe("fail");
  });

  // T2.4: Strict parser — no creative recovery
  it("returns null for trailing comma (no creative recovery)", () => {
    const raw = '{"status": "pass", "reasoning": "Good", "confidence": 0.9,}';
    const result = parseJudgeJSON(raw);
    expect(result).toBeNull();
  });

  it("returns null for single quotes (no creative recovery)", () => {
    const raw = "{'status': 'pass', 'reasoning': 'Good', 'confidence': 0.9}";
    const result = parseJudgeJSON(raw);
    expect(result).toBeNull();
  });

  it("returns null for regex-only fallback (no creative recovery)", () => {
    const raw =
      'The answer is "status": "pass" with "reasoning": "Looks good" and "confidence": 0.85';
    const result = parseJudgeJSON(raw);
    expect(result).toBeNull();
  });

  it("returns null for empty input", () => {
    expect(parseJudgeJSON("")).toBeNull();
    expect(parseJudgeJSON("   ")).toBeNull();
  });

  it("returns null for no JSON at all", () => {
    expect(parseJudgeJSON("This is just text without any JSON")).toBeNull();
  });

  it("handles missing confidence (defaults to 0.5)", () => {
    const raw = '{"status": "pass", "reasoning": "Good", "evidence_quotes": []}';
    const result = parseJudgeJSON(raw);
    expect(result).not.toBeNull();
    expect(result!.confidence).toBe(0.5);
  });

  it("handles missing evidence_quotes (defaults to empty array)", () => {
    const raw = '{"status": "pass", "reasoning": "Good", "confidence": 0.9}';
    const result = parseJudgeJSON(raw);
    expect(result).not.toBeNull();
    expect(result!.evidence_quotes).toEqual([]);
  });

  it("filters non-string evidence_quotes entries", () => {
    const raw =
      '{"status": "pass", "reasoning": "Good", "evidence_quotes": ["valid", 123, null, "also valid"]}';
    const result = parseJudgeJSON(raw);
    expect(result).not.toBeNull();
    expect(result!.evidence_quotes).toEqual(["valid", "also valid"]);
  });
});

// ── buildJudgeSystemPrompt (Blinded) ─────────────────────────────────

describe("buildJudgeSystemPrompt", () => {
  it("includes task title and jurisdiction", () => {
    const prompt = buildJudgeSystemPrompt(makeTask());
    expect(prompt).toContain("Test Task");
    expect(prompt).toContain("DE");
    expect(prompt).toContain("JSON");
  });

  it("does not mention agent model (blinded)", () => {
    const prompt = buildJudgeSystemPrompt(makeTask());
    expect(prompt).not.toContain("DeepSeek");
    expect(prompt).not.toContain("Opus");
    expect(prompt).not.toContain("Claude");
    expect(prompt).not.toContain("Grok");
  });

  it("includes status values in prompt", () => {
    const prompt = buildJudgeSystemPrompt(makeTask());
    expect(prompt).toContain("pass");
    expect(prompt).toContain("fail");
    expect(prompt).toContain("uncertain");
    expect(prompt).toContain("not_judgeable");
  });

  it("requires evidence_quotes", () => {
    const prompt = buildJudgeSystemPrompt(makeTask());
    expect(prompt).toContain("evidence_quotes");
  });
});

// ── buildJudgeUserPrompt ──────────────────────────────────────────────

describe("buildJudgeUserPrompt", () => {
  it("includes criterion description and question", () => {
    const prompt = buildJudgeUserPrompt({
      task: makeTask(),
      output: "Test output",
      context: "Test context",
      criterion: makeCriterion(),
    });
    expect(prompt).toContain("Is the analysis correct?");
    expect(prompt).toContain("Does the output correctly identify the legal issue?");
    expect(prompt).toContain("Test output");
    expect(prompt).toContain("Test context");
  });

  it("uses 'KI-Ausgabe' instead of 'Agent-Ausgabe' (blinded)", () => {
    const prompt = buildJudgeUserPrompt({
      task: makeTask(),
      output: "Test output",
      context: "Test context",
      criterion: makeCriterion(),
    });
    expect(prompt).toContain("KI-Ausgabe");
    expect(prompt).not.toContain("Agent-Ausgabe");
  });
});

// ── getUnifiedJudgeConfig (Blinded) ──────────────────────────────────

describe("getUnifiedJudgeConfig", () => {
  it("always returns Opus as primary judge", () => {
    const config = getUnifiedJudgeConfig();
    expect(config.primary.primary_model).toBe("opus");
  });

  it("always returns DeepSeek as secondary judge", () => {
    const config = getUnifiedJudgeConfig();
    expect(config.secondary).toBeDefined();
    expect(config.secondary.primary_model).toBe("deepseek");
  });

  it("returns the same config regardless of agent model (blinded)", () => {
    const config1 = getUnifiedJudgeConfig();
    const config2 = getUnifiedJudgeConfig();
    expect(config1).toEqual(config2);
  });
});

// ── getCrossFamilyJudgeConfig (deprecated, delegates) ──────────────────

describe("getCrossFamilyJudgeConfig (deprecated)", () => {
  it("delegates to getUnifiedJudgeConfig — same primary for any agent", () => {
    const deepseekAgent = getCrossFamilyJudgeConfig("deepseek/deepseek-chat");
    const opusAgent = getCrossFamilyJudgeConfig("anthropic/claude-opus-4");
    const unknownAgent = getCrossFamilyJudgeConfig("unknown-model");
    // All should return the same config (blinded)
    expect(deepseekAgent.primary.primary_model).toBe("opus");
    expect(opusAgent.primary.primary_model).toBe("opus");
    expect(unknownAgent.primary.primary_model).toBe("opus");
  });
});

// ── JUDGE_CONFIGS ─────────────────────────────────────────────────────

describe("JUDGE_CONFIGS", () => {
  it("Opus has thinking config with high effort", () => {
    expect(JUDGE_CONFIGS.opus.thinking).toBeDefined();
    expect(JUDGE_CONFIGS.opus.thinking!.effort).toBe("high");
  });

  it("DeepSeek has no thinking config", () => {
    expect(JUDGE_CONFIGS.deepseek.thinking).toBeUndefined();
  });

  it("All configs have temperature 0", () => {
    expect(JUDGE_CONFIGS.opus.temperature).toBe(0);
    expect(JUDGE_CONFIGS.deepseek.temperature).toBe(0);
    expect(JUDGE_CONFIGS.grok.temperature).toBe(0);
  });
});

// ── judgeCriterion (Fail-Closed) ──────────────────────────────────────

describe("judgeCriterion", () => {
  function makeChatFn(response: string): (opts: ChatOpts) => Promise<ChatResult> {
    return async () => ({ text: response });
  }

  function makeInput(): JudgeInput {
    return {
      task: makeTask(),
      output: "Test output",
      context: "Test context",
      criterion: makeCriterion(),
    };
  }

  it("returns judge_error for unparseable response (fail-closed)", async () => {
    const verdict = await judgeCriterion(
      makeInput(),
      JUDGE_CONFIGS.opus,
      makeChatFn("This is not JSON at all")
    );
    expect(verdict.status).toBe("judge_error");
    expect(verdict.passed).toBe(false);
    expect(verdict.confidence).toBe(0);
    expect(verdict.evidence_quotes).toEqual([]);
  });

  it("returns judge_error when chatFn throws (fail-closed)", async () => {
    const throwingChatFn = async (): Promise<ChatResult> => {
      throw new Error("API timeout");
    };
    const verdict = await judgeCriterion(makeInput(), JUDGE_CONFIGS.opus, throwingChatFn);
    expect(verdict.status).toBe("judge_error");
    expect(verdict.passed).toBe(false);
    expect(verdict.reasoning).toContain("Judge-Fehler");
  });

  it("returns pass verdict for valid JSON with status=pass", async () => {
    const verdict = await judgeCriterion(
      makeInput(),
      JUDGE_CONFIGS.opus,
      makeChatFn(
        '{"status": "pass", "reasoning": "Correct", "confidence": 0.9, "evidence_quotes": ["quote"]}'
      )
    );
    expect(verdict.status).toBe("pass");
    expect(verdict.passed).toBe(true);
    expect(verdict.confidence).toBe(0.9);
    expect(verdict.evidence_quotes).toEqual(["quote"]);
  });

  it("returns fail verdict for valid JSON with status=fail", async () => {
    const verdict = await judgeCriterion(
      makeInput(),
      JUDGE_CONFIGS.opus,
      makeChatFn(
        '{"status": "fail", "reasoning": "Incorrect", "confidence": 0.8, "evidence_quotes": ["bad quote"]}'
      )
    );
    expect(verdict.status).toBe("fail");
    expect(verdict.passed).toBe(false);
  });

  it("returns uncertain verdict for status=uncertain", async () => {
    const verdict = await judgeCriterion(
      makeInput(),
      JUDGE_CONFIGS.opus,
      makeChatFn(
        '{"status": "uncertain", "reasoning": "Borderline", "confidence": 0.4, "evidence_quotes": []}'
      )
    );
    expect(verdict.status).toBe("uncertain");
    expect(verdict.passed).toBe(false);
  });
});

// ── crossFamilyJudge (Unified Blinded) ────────────────────────────────

describe("crossFamilyJudge", () => {
  function makeChatFn(response: string): (opts: ChatOpts) => Promise<ChatResult> {
    return async () => ({ text: response });
  }

  function makeInput(): JudgeInput {
    return {
      task: makeTask(),
      output: "Test output",
      context: "Test context",
      criterion: makeCriterion(),
    };
  }

  it("returns primary verdict when no secondary config", async () => {
    const result = await crossFamilyJudge(
      makeInput(),
      JUDGE_CONFIGS.opus,
      undefined,
      makeChatFn(
        '{"status": "pass", "reasoning": "Good", "confidence": 0.9, "evidence_quotes": []}'
      )
    );
    expect(result.finalVerdict.status).toBe("pass");
    expect(result.finalPassed).toBe(true);
    expect(result.agreement).toBe(true);
    expect(result.secondary).toBeUndefined();
  });

  it("returns judge_error if primary judge errors", async () => {
    const result = await crossFamilyJudge(
      makeInput(),
      JUDGE_CONFIGS.opus,
      JUDGE_CONFIGS.deepseek,
      makeChatFn("not json")
    );
    expect(result.finalVerdict.status).toBe("judge_error");
    expect(result.finalPassed).toBe(false);
  });

  it("returns fail on disagreement (conservative)", async () => {
    let callCount = 0;
    const chatFn = async (): Promise<ChatResult> => {
      callCount++;
      if (callCount === 1) {
        return {
          text: '{"status": "pass", "reasoning": "Good", "confidence": 0.9, "evidence_quotes": []}',
        };
      }
      return {
        text: '{"status": "fail", "reasoning": "Bad", "confidence": 0.8, "evidence_quotes": []}',
      };
    };
    const result = await crossFamilyJudge(
      makeInput(),
      JUDGE_CONFIGS.opus,
      JUDGE_CONFIGS.deepseek,
      chatFn
    );
    expect(result.agreement).toBe(false);
    expect(result.finalPassed).toBe(false);
  });
});
