/**
 * Agent Supervisor handler unit tests.
 */

import { describe, it, expect } from "bun:test";
import {
  parsePlanJson,
  extractTextFromResult,
  buildExecutionWaves,
  withDependencyContext,
  criticRecommendsRevision,
  type SupervisorStep,
  type SupervisorChildResult,
} from "../src/core/minions/handlers/supervisor.ts";

describe("parsePlanJson", () => {
  it("parses valid JSON plan", () => {
    const json = JSON.stringify({
      reasoning: "Need research then analysis",
      steps: [
        { specialist: "legal-researcher", prompt: "Research § 823 BGB" },
        { specialist: "legal-analyst", prompt: "Analyze the case" },
      ],
    });
    const plan = parsePlanJson(json);
    expect(plan.reasoning).toBe("Need research then analysis");
    expect(plan.steps).toHaveLength(2);
    expect(plan.steps[0]!.specialist).toBe("legal-researcher");
    expect(plan.steps[1]!.specialist).toBe("legal-analyst");
  });

  it("parses JSON inside markdown code block", () => {
    const md =
      "```json\n" +
      JSON.stringify({
        reasoning: "test",
        steps: [{ specialist: "legal-researcher", prompt: "go" }],
      }) +
      "\n```";
    const plan = parsePlanJson(md);
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0]!.specialist).toBe("legal-researcher");
  });

  it("falls back to single researcher on invalid JSON", () => {
    const plan = parsePlanJson("not json at all");
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0]!.specialist).toBe("legal-researcher");
    expect(plan.reasoning).toContain("Auto-decomposition failed");
  });

  it("falls back to single researcher on malformed object", () => {
    const plan = parsePlanJson(JSON.stringify({ steps: "not an array" }));
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0]!.specialist).toBe("legal-researcher");
  });
});

describe("extractTextFromResult", () => {
  it("extracts text field", () => {
    const result = { text: "hello world" };
    expect(extractTextFromResult(result)).toBe("hello world");
  });

  it("extracts content field", () => {
    const result = { content: "hello world" };
    expect(extractTextFromResult(result)).toBe("hello world");
  });

  it("extracts nested message.content", () => {
    const result = { message: { content: "hello world" } };
    expect(extractTextFromResult(result)).toBe("hello world");
  });

  it("stringifies unknown shapes", () => {
    const result = { foo: "bar" };
    expect(extractTextFromResult(result)).toBe('{"foo":"bar"}');
  });

  it("returns empty for null", () => {
    expect(extractTextFromResult(null)).toBe("");
  });
});

describe("parsePlanJson depends_on", () => {
  it("preserves integer depends_on from the plan", () => {
    const json = JSON.stringify({
      reasoning: "pipeline",
      steps: [
        { specialist: "legal-researcher", prompt: "a" },
        { specialist: "legal-analyst", prompt: "b", depends_on: 0 },
      ],
    });
    const plan = parsePlanJson(json);
    expect(plan.steps[0]!.depends_on).toBeUndefined();
    expect(plan.steps[1]!.depends_on).toBe(0);
  });

  it("drops non-integer depends_on", () => {
    const json = JSON.stringify({
      reasoning: "x",
      steps: [{ specialist: "legal-researcher", prompt: "a", depends_on: "zero" }],
    });
    expect(parsePlanJson(json).steps[0]!.depends_on).toBeUndefined();
  });
});

describe("buildExecutionWaves", () => {
  const step = (specialist: string, depends_on?: number): SupervisorStep => ({
    specialist,
    prompt: "p",
    ...(depends_on !== undefined ? { depends_on } : {}),
  });

  it("independent steps run in one parallel wave", () => {
    expect(buildExecutionWaves([step("a"), step("b"), step("c")])).toEqual([[0, 1, 2]]);
  });

  it("a chain becomes sequential waves", () => {
    const waves = buildExecutionWaves([step("r"), step("a", 0), step("s", 1)]);
    expect(waves).toEqual([[0], [1], [2]]);
  });

  it("mixed: dependent step waits, independent runs in wave 0", () => {
    const waves = buildExecutionWaves([step("r1"), step("r2"), step("a", 0)]);
    expect(waves).toEqual([[0, 1], [2]]);
  });

  it("forward and self references are ignored (wave 0)", () => {
    expect(buildExecutionWaves([step("a", 1), step("b")])).toEqual([[0, 1]]);
    expect(buildExecutionWaves([step("a", 0)])).toEqual([[0]]);
  });
});

describe("withDependencyContext", () => {
  const steps: SupervisorStep[] = [
    { specialist: "legal-researcher", prompt: "research" },
    { specialist: "legal-analyst", prompt: "analyze", depends_on: 0 },
  ];

  it("injects the dependency result as a context section", () => {
    const results = new Map<number, SupervisorChildResult>([
      [
        0,
        {
          child_id: 1,
          specialist: "legal-researcher",
          outcome: "complete",
          result: "§ 823 BGB findings",
          error: null,
        },
      ],
    ]);
    const prompt = withDependencyContext(steps[1]!, steps, results);
    expect(prompt).toContain("analyze");
    expect(prompt).toContain("§ 823 BGB findings");
    expect(prompt).toContain("legal-researcher");
  });

  it("returns the bare prompt when the dependency failed", () => {
    const results = new Map<number, SupervisorChildResult>([
      [
        0,
        {
          child_id: 1,
          specialist: "legal-researcher",
          outcome: "failed",
          result: null,
          error: "boom",
        },
      ],
    ]);
    expect(withDependencyContext(steps[1]!, steps, results)).toBe("analyze");
  });

  it("returns the bare prompt for steps without depends_on", () => {
    expect(withDependencyContext(steps[0]!, steps, new Map())).toBe("research");
  });
});

describe("criticRecommendsRevision", () => {
  it("triggers on revise / reject as whole words", () => {
    expect(criticRecommendsRevision('{"recommendation": "revise"}')).toBe(true);
    expect(criticRecommendsRevision("Overall: REJECT — fabricated citation")).toBe(true);
  });

  it("does not trigger on publish or derived words", () => {
    expect(criticRecommendsRevision('{"recommendation": "publish"}')).toBe(false);
    expect(criticRecommendsRevision("The revised draft already addressed this.")).toBe(false);
  });
});
