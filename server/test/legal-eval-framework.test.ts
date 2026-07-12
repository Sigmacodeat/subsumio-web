import { describe, expect, test } from "bun:test";
import {
  parseEvalOutput,
  runEval,
  type EvalDataset,
} from "../src/core/legal/eval-framework.ts";

const DATASET: EvalDataset = {
  specialist_name: "test-specialist",
  version: "1.0.0",
  cases: [
    {
      id: "case-1",
      input: "Prüfe diesen Fall",
      expected: { answer: "ABGB", confidence: "high" },
      description: "executes and parses a structured specialist result",
    },
  ],
};

function queueWithStates(states: Array<Record<string, unknown>>) {
  let read = 0;
  return {
    submissions: [] as Array<{ name: string; data: unknown; opts: unknown }>,
    async add(name: string, data: unknown, opts: unknown) {
      this.submissions.push({ name, data, opts });
      return { id: 42, status: "waiting", result: null, error_text: null };
    },
    async getJob() {
      return states[Math.min(read++, states.length - 1)];
    },
  };
}

describe("legal eval framework", () => {
  test("parses plain and fenced JSON while preserving prose", () => {
    expect(parseEvalOutput('{"answer":"ABGB"}')).toEqual({ answer: "ABGB" });
    expect(parseEvalOutput('```json\n{"answer":"ABGB"}\n```')).toEqual({ answer: "ABGB" });
    expect(parseEvalOutput("juristische Begründung")).toBe("juristische Begründung");
  });

  test("waits for the real subagent result and scores it", async () => {
    const queue = queueWithStates([
      { id: 42, status: "active", result: null, error_text: null },
      {
        id: 42,
        status: "completed",
        result: { result: '```json\n{"answer":"ABGB","confidence":"high"}\n```' },
        error_text: null,
      },
    ]);

    const result = await runEval({
      specialistName: "test-specialist",
      dataset: DATASET,
      engine: {},
      queue,
      pollIntervalMs: 0,
      caseTimeoutMs: 1_000,
    });

    expect(result.passed).toBe(true);
    expect(result.pass_rate).toBe(1);
    expect(queue.submissions[0]).toMatchObject({
      name: "subagent",
      data: { prompt: "Prüfe diesen Fall", subagent_def: "test-specialist" },
      opts: { timeout_ms: 1_000, remove_on_complete: false, remove_on_fail: false },
    });
  });

  test("records terminal job failures as failed eval cases", async () => {
    const queue = queueWithStates([
      { id: 42, status: "failed", result: null, error_text: "model unavailable" },
    ]);
    const result = await runEval({
      specialistName: "test-specialist",
      dataset: DATASET,
      engine: {},
      queue,
      pollIntervalMs: 0,
      caseTimeoutMs: 1_000,
    });

    expect(result.passed).toBe(false);
    expect(result.results[0]?.errors[0]).toContain("model unavailable");
  });

  test("fails fast when no executable queue is provided", async () => {
    expect(
      runEval({ specialistName: "x", dataset: DATASET, engine: {}, queue: {} })
    ).rejects.toThrow("queue with add() and getJob()");
  });
});
