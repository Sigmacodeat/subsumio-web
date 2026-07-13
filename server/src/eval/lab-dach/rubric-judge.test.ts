import { describe, it, expect } from "vitest";
import {
  parseJudgeJSON,
  buildJudgeSystemPrompt,
  buildJudgeUserPrompt,
  getCrossFamilyJudgeConfig,
  JUDGE_CONFIGS,
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

// ── parseJudgeJSON ────────────────────────────────────────────────────

describe("parseJudgeJSON", () => {
  it("parses clean JSON", () => {
    const raw = '{"passed": true, "reasoning": "Analysis is correct", "confidence": 0.9}';
    const result = parseJudgeJSON(raw);
    expect(result).not.toBeNull();
    expect(result!.passed).toBe(true);
    expect(result!.reasoning).toBe("Analysis is correct");
    expect(result!.confidence).toBe(0.9);
  });

  it("parses JSON in code block", () => {
    const raw = '```json\n{"passed": false, "reasoning": "Incorrect", "confidence": 0.8}\n```';
    const result = parseJudgeJSON(raw);
    expect(result).not.toBeNull();
    expect(result!.passed).toBe(false);
    expect(result!.reasoning).toBe("Incorrect");
  });

  it("parses JSON embedded in text", () => {
    const raw =
      'Here is my evaluation:\n{"passed": true, "reasoning": "Good", "confidence": 1.0}\nDone.';
    const result = parseJudgeJSON(raw);
    expect(result).not.toBeNull();
    expect(result!.passed).toBe(true);
  });

  it("parses JSON with trailing comma", () => {
    const raw = '{"passed": true, "reasoning": "Good", "confidence": 0.9,}';
    const result = parseJudgeJSON(raw);
    expect(result).not.toBeNull();
    expect(result!.passed).toBe(true);
  });

  it("parses JSON with single quotes", () => {
    const raw = "{'passed': true, 'reasoning': 'Good', 'confidence': 0.9}";
    const result = parseJudgeJSON(raw);
    expect(result).not.toBeNull();
    expect(result!.passed).toBe(true);
  });

  it("uses regex fallback for malformed JSON", () => {
    const raw =
      'The answer is "passed": true with "reasoning": "Looks good" and "confidence": 0.85';
    const result = parseJudgeJSON(raw);
    expect(result).not.toBeNull();
    expect(result!.passed).toBe(true);
    expect(result!.reasoning).toBe("Looks good");
    expect(result!.confidence).toBe(0.85);
  });

  it("returns null for empty input", () => {
    expect(parseJudgeJSON("")).toBeNull();
    expect(parseJudgeJSON("   ")).toBeNull();
  });

  it("returns null for no JSON at all", () => {
    expect(parseJudgeJSON("This is just text without any JSON")).toBeNull();
  });

  it("handles missing confidence (defaults to 0.5)", () => {
    const raw = '{"passed": true, "reasoning": "Good"}';
    const result = parseJudgeJSON(raw);
    expect(result).not.toBeNull();
    expect(result!.confidence).toBe(0.5);
  });
});

// ── buildJudgeSystemPrompt ────────────────────────────────────────────

describe("buildJudgeSystemPrompt", () => {
  it("includes task title and jurisdiction", () => {
    const prompt = buildJudgeSystemPrompt(makeTask());
    expect(prompt).toContain("Test Task");
    expect(prompt).toContain("DE");
    expect(prompt).toContain("JSON");
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
});

// ── getCrossFamilyJudgeConfig ─────────────────────────────────────────

describe("getCrossFamilyJudgeConfig", () => {
  it("returns Opus as primary for DeepSeek agent", () => {
    const config = getCrossFamilyJudgeConfig("deepseek/deepseek-chat");
    expect(config.primary.primary_model).toBe("opus");
  });

  it("returns DeepSeek as primary for Opus agent", () => {
    const config = getCrossFamilyJudgeConfig("anthropic/claude-opus-4");
    expect(config.primary.primary_model).toBe("deepseek");
  });

  it("returns DeepSeek as default for unknown agent", () => {
    const config = getCrossFamilyJudgeConfig("unknown-model");
    expect(config.primary.primary_model).toBe("deepseek");
  });

  it("includes secondary judge for DeepSeek agent", () => {
    const config = getCrossFamilyJudgeConfig("deepseek/deepseek-chat");
    expect(config.secondary).toBeDefined();
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
