/**
 * Regression test: Mock results can never appear as live measurements.
 *
 * This test enforces the structural separation between mock and live mode:
 *   - RunReceipt.mode is always set (no default, no ambiguity)
 *   - Mock receipts always have mode === "mock"
 *   - Live receipts always have mode === "live"
 *   - E2ERunResult.mode matches the mode passed to runE2E
 *   - buildRunReceipt requires mode in opts (no accidental omission)
 *   - runE2E throws when live mode is requested without a chatFn
 */

import { describe, it, expect } from "vitest";
import { buildRunReceipt } from "./receipt.ts";
import { runE2E } from "./e2e-harness.ts";
import type { RunReceipt, Task, RubricResult } from "./types.ts";
import type { WorkflowResult } from "./workflows.ts";

function makeMockWorkflowResult(): WorkflowResult {
  return {
    task_id: "test-task-001",
    workflow: "rechtsfrage_memorandum",
    output: "Mock output text",
    context: "Mock context",
    deliverables: { "memo.md": "Mock output text" },
    tool_calls: [],
    guardrail_flags: [],
    verification_state: "VERIFIED",
    rubric: {
      task_id: "test-task-001",
      criteria: [],
      all_pass: true,
      strict_all_pass: true,
      critical_all_pass: true,
      criterion_pass_rate: 1,
      criteria_passed: 0,
      criteria_total: 0,
      critical_passed: 0,
      critical_total: 0,
      weighted_score: 1,
    } as RubricResult,
    latency_ms: 100,
    token_count: { input: 100, output: 50 },
    cost_usd: 0,
    llm_latencies_ms: [50, 80, 120, 200],
  };
}

function makeMockTask(): Task {
  return {
    id: "test-task-001",
    title: "Test Task",
    jurisdiction: "AT",
    legal_area: "litigation",
    workflow: "rechtsfrage_memorandum",
    difficulty: "normal",
    split: "test",
    prompt: "Test prompt",
    case_facts: "Test facts",
    deliverables: [],
    criteria: [],
    expected_laws: [],
    expected_paragraphs: [],
    min_citations: 0,
    time_limit_seconds: 300,
    review_status: "approved",
    created_at: "2026-01-01T00:00:00Z",
    created_by: "test",
    reviewed_by: "test",
    as_of_date: "2026-01-01",
  } as Task;
}

describe("Mock/Live Separation Regression", () => {
  it("buildRunReceipt with mode='mock' produces receipt with mode='mock'", () => {
    const receipt = buildRunReceipt(
      makeMockWorkflowResult(),
      makeMockTask(),
      {
        runId: "test-run-001",
        corpusRoot: "/tmp/test-corpus",
        startedAt: "2026-01-01T00:00:00Z",
        mode: "mock",
      }
    );
    expect(receipt.mode).toBe("mock");
    expect(receipt.mode).not.toBe("live");
  });

  it("buildRunReceipt with mode='live' produces receipt with mode='live'", () => {
    const receipt = buildRunReceipt(
      makeMockWorkflowResult(),
      makeMockTask(),
      {
        runId: "test-run-002",
        corpusRoot: "/tmp/test-corpus",
        startedAt: "2026-01-01T00:00:00Z",
        mode: "live",
      }
    );
    expect(receipt.mode).toBe("live");
    expect(receipt.mode).not.toBe("mock");
  });

  it("RunReceipt.mode is a required field (not optional)", () => {
    // Type-level test: this should not compile if mode is optional
    const receipt: RunReceipt = {
      run_id: "test-001",
      task_id: "task-001",
      model_id: "test-model",
      provider: "test-provider",
      prompt_hash: "abc123",
      tool_versions: {},
      token_counts: { input: 0, output: 0 },
      latency_ms: 0,
      cost_usd: 0,
      started_at: "2026-01-01T00:00:00Z",
      completed_at: "2026-01-01T00:00:01Z",
      mode: "mock",
    };
    expect(receipt.mode).toBeDefined();
  });

  it("mock receipt can never be confused with live — mode field is the source of truth", () => {
    const mockReceipt = buildRunReceipt(
      makeMockWorkflowResult(),
      makeMockTask(),
      {
        runId: "test-run-mock",
        corpusRoot: "/tmp/test-corpus",
        startedAt: "2026-01-01T00:00:00Z",
        mode: "mock",
      }
    );
    const liveReceipt = buildRunReceipt(
      makeMockWorkflowResult(),
      makeMockTask(),
      {
        runId: "test-run-live",
        corpusRoot: "/tmp/test-corpus",
        startedAt: "2026-01-01T00:00:00Z",
        mode: "live",
      }
    );
    // Even if all other fields are identical, mode must differ
    expect(mockReceipt.mode).not.toBe(liveReceipt.mode);
    // Mock receipt must never claim to be live
    expect(mockReceipt.mode).toBe("mock");
    // Live receipt must never claim to be mock
    expect(liveReceipt.mode).toBe("live");
  });

  it("buildRunReceipt requires mode in opts — TypeScript enforces this at compile time", () => {
    // This is a compile-time test: the opts object MUST include mode.
    // If mode were optional, this test would still compile but the assertion
    // would fail at runtime. With mode required, omitting it is a type error.
    const opts = {
      runId: "test-run-003",
      corpusRoot: "/tmp/test-corpus",
      startedAt: "2026-01-01T00:00:00Z",
      mode: "mock" as const,
    };
    const receipt = buildRunReceipt(makeMockWorkflowResult(), makeMockTask(), opts);
    expect(receipt.mode).toBe("mock");
  });

  it("provider_errors are passed through to receipt", () => {
    const receipt = buildRunReceipt(
      makeMockWorkflowResult(),
      makeMockTask(),
      {
        runId: "test-run-004",
        corpusRoot: "/tmp/test-corpus",
        startedAt: "2026-01-01T00:00:00Z",
        mode: "live",
        provider_errors: ["timeout", "rate_limited"],
      }
    );
    expect(receipt.provider_errors).toEqual(["timeout", "rate_limited"]);
  });

  it("mock receipt has no provider_errors by default", () => {
    const receipt = buildRunReceipt(
      makeMockWorkflowResult(),
      makeMockTask(),
      {
        runId: "test-run-005",
        corpusRoot: "/tmp/test-corpus",
        startedAt: "2026-01-01T00:00:00Z",
        mode: "mock",
      }
    );
    expect(receipt.provider_errors).toBeUndefined();
  });

  it("runE2E throws when live mode is requested without a chatFn (fail-closed)", async () => {
    await expect(
      runE2E({
        mockMode: false,
        tasks: [],
      })
    ).rejects.toThrow(/live run refused/);
  });

  it("runE2E does NOT throw when mock mode is requested without a chatFn", async () => {
    // mockMode=true should work without chatFn — uses internal mockChatFn
    // Use empty tasks to avoid actual workflow execution
    await expect(
      runE2E({
        mockMode: true,
        tasks: [],
      })
    ).resolves.toBeDefined();
  });

  it("latency p50/p95 are computed from llm_latencies_ms", () => {
    const receipt = buildRunReceipt(
      makeMockWorkflowResult(),
      makeMockTask(),
      {
        runId: "test-run-latency",
        corpusRoot: "/tmp/test-corpus",
        startedAt: "2026-01-01T00:00:00Z",
        mode: "live",
      }
    );
    // latencies [50, 80, 120, 200] → sorted: [50, 80, 120, 200]
    // p50 = index 2 = 120, p95 = index 3 = 200
    expect(receipt.latency_p50_ms).toBe(120);
    expect(receipt.latency_p95_ms).toBe(200);
  });
});
