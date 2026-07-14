import { describe, it, expect } from "vitest";
import {
  buildReviewQueue,
  canAutoResolve,
  persistHumanVerdict,
  computeQueueStats,
  assertNoHoldout,
  type ReviewQueueItem,
  type HumanVerdict,
} from "./review-queue.ts";
import type { Task } from "./types.ts";
import type { CrossJudgeResult, ModelAnswer } from "./cross-judge.ts";
import type { Criterion } from "./types.ts";

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
    criteria: [],
    ...overrides,
  };
}

function makeModelAnswer(text: string = "answer text"): ModelAnswer {
  return {
    model_config: {
      vendor: "anthropic",
      model_id: "test-model",
      label: "test",
      max_tokens: 1024,
      temperature: 0,
    },
    text,
    grounding: {
      citations: [],
      all_verified: true,
      unverified: [],
    },
  };
}

function makeCrossJudgeResult(
  overrides?: Partial<CrossJudgeResult>,
  criteria?: Array<{ criterion_id: string; passed: boolean; severity: "low" | "medium" | "high" | "critical" }>
): CrossJudgeResult {
  const baseCriteria = criteria ?? [
    {
      criterion_id: "crit-001",
      criterion: { id: "crit-001", description: "test", check_type: "llm_judge", critical: false, severity: "low" as const } as Criterion,
      severity: "low" as const,
      verdict: { status: "pass" as const, passed: true, reasoning: "ok", confidence: 0.9, evidence_quotes: [], raw_response: "", model: "test" as const },
      grounding_passed: true,
      grounding_overrode: false,
      passed: true,
      judge_model: { vendor: "openai", model_id: "gpt", label: "gpt", max_tokens: 1024, temperature: 0 },
      answer_model: { vendor: "anthropic", model_id: "claude", label: "opus", max_tokens: 1024, temperature: 0 },
    },
  ];

  return {
    task_id: "lab-dach-de-001",
    answer: makeModelAnswer(),
    criteria: baseCriteria as CrossJudgeResult["criteria"],
    all_pass: true,
    full_agreement: true,
    has_disagreement: false,
    has_uncertain: false,
    has_critical: false,
    needs_review: false,
    review_reasons: [],
    reviewer_type: "llm_cross_judge",
    ...overrides,
  };
}

function makeVerdict(overrides?: Partial<HumanVerdict>): HumanVerdict {
  return {
    decision: "pass_a",
    passed_criteria: ["crit-001"],
    failed_criteria: [],
    notes: "Looks good",
    reviewer_name: "Dr. Test",
    reviewed_at: "2026-07-14T10:00:00Z",
    reviewer_type: "human_jurist",
    split: "dev",
    ...overrides,
  };
}

// ── assertNoHoldout ────────────────────────────────────────────────────

describe("assertNoHoldout", () => {
  it("passes when no holdout tasks are present", () => {
    const tasks = [makeTask({ split: "dev" }), makeTask({ id: "t2", split: "test" })];
    expect(() => assertNoHoldout(tasks)).not.toThrow();
  });

  it("throws when holdout tasks are present", () => {
    const tasks = [makeTask({ split: "dev" }), makeTask({ id: "t2", split: "holdout" })];
    expect(() => assertNoHoldout(tasks)).toThrow(/Holdout guard violation.*holdout/i);
  });

  it("throws with specific task IDs in error message", () => {
    const tasks = [makeTask({ id: "holdout-001", split: "holdout" })];
    expect(() => assertNoHoldout(tasks)).toThrow(/holdout-001/);
  });
});

// ── buildReviewQueue ───────────────────────────────────────────────────

describe("buildReviewQueue", () => {
  it("queues items that need review", () => {
    const sessions = [
      {
        task: makeTask({ id: "t1", split: "dev" }),
        answer_a: makeModelAnswer(),
        answer_b: makeModelAnswer(),
        judge_a: makeCrossJudgeResult({ needs_review: true, review_reasons: ["critical_criterion_requires_human"] }),
        judge_b: makeCrossJudgeResult({ needs_review: true, review_reasons: ["critical_criterion_requires_human"] }),
        disagreement: false,
        needs_review: true,
        review_reasons: ["critical_criterion_requires_human"],
      },
    ];

    const queue = buildReviewQueue(sessions);
    expect(queue).toHaveLength(1);
    expect(queue[0]!.task_id).toBe("t1");
    expect(queue[0]!.status).toBe("pending");
  });

  it("does not queue items that don't need review", () => {
    const sessions = [
      {
        task: makeTask({ id: "t1", split: "dev" }),
        answer_a: makeModelAnswer(),
        answer_b: makeModelAnswer(),
        judge_a: makeCrossJudgeResult({ needs_review: false }),
        judge_b: makeCrossJudgeResult({ needs_review: false }),
        disagreement: false,
        needs_review: false,
        review_reasons: [],
      },
    ];

    const queue = buildReviewQueue(sessions);
    expect(queue).toHaveLength(0);
  });

  it("throws when trying to queue a holdout task", () => {
    const sessions = [
      {
        task: makeTask({ id: "holdout-001", split: "holdout" }),
        answer_a: makeModelAnswer(),
        answer_b: makeModelAnswer(),
        judge_a: makeCrossJudgeResult({ needs_review: true }),
        judge_b: makeCrossJudgeResult({ needs_review: true }),
        disagreement: false,
        needs_review: true,
        review_reasons: ["critical_criterion_requires_human"],
      },
    ];

    expect(() => buildReviewQueue(sessions)).toThrow(/Review queue violation.*holdout/i);
  });

  it("queues items for judge disagreement", () => {
    const sessions = [
      {
        task: makeTask({ id: "t1", split: "dev" }),
        answer_a: makeModelAnswer(),
        answer_b: makeModelAnswer(),
        judge_a: makeCrossJudgeResult({ needs_review: true }),
        judge_b: makeCrossJudgeResult({ needs_review: true }),
        disagreement: true,
        needs_review: true,
        review_reasons: ["judge_disagreement"],
      },
    ];

    const queue = buildReviewQueue(sessions);
    expect(queue).toHaveLength(1);
    expect(queue[0]!.disagreement).toBe(true);
    expect(queue[0]!.review_reasons).toContain("judge_disagreement");
  });
});

// ── canAutoResolve ─────────────────────────────────────────────────────

describe("canAutoResolve", () => {
  it("returns true when no disagreement, no uncertain, no critical, all verified", () => {
    const judgeA = makeCrossJudgeResult({
      has_uncertain: false,
      has_critical: false,
      answer: makeModelAnswer("text"),
    });
    judgeA.answer.grounding.all_verified = true;

    const judgeB = makeCrossJudgeResult({
      has_uncertain: false,
      has_critical: false,
      answer: makeModelAnswer("text"),
    });
    judgeB.answer.grounding.all_verified = true;

    expect(canAutoResolve(judgeA, judgeB, false)).toBe(true);
  });

  it("returns false when there is disagreement", () => {
    const judgeA = makeCrossJudgeResult();
    const judgeB = makeCrossJudgeResult();
    expect(canAutoResolve(judgeA, judgeB, true)).toBe(false);
  });

  it("returns false when judge has uncertain status", () => {
    const judgeA = makeCrossJudgeResult({ has_uncertain: true });
    const judgeB = makeCrossJudgeResult();
    expect(canAutoResolve(judgeA, judgeB, false)).toBe(false);
  });

  it("returns false when critical criterion is present", () => {
    const judgeA = makeCrossJudgeResult({ has_critical: true });
    const judgeB = makeCrossJudgeResult();
    expect(canAutoResolve(judgeA, judgeB, false)).toBe(false);
  });

  it("returns false when grounding not verified", () => {
    const judgeA = makeCrossJudgeResult();
    judgeA.answer.grounding.all_verified = false;
    const judgeB = makeCrossJudgeResult();
    judgeB.answer.grounding.all_verified = true;
    expect(canAutoResolve(judgeA, judgeB, false)).toBe(false);
  });
});

// ── persistHumanVerdict ────────────────────────────────────────────────

describe("persistHumanVerdict", () => {
  it("persists human verdict as goldtask with correct metadata", () => {
    const task = makeTask({ id: "t1", split: "dev" });
    const item: ReviewQueueItem = {
      id: "review-t1-123",
      task_id: "t1",
      task,
      answer_a: makeModelAnswer("Answer A text"),
      answer_b: makeModelAnswer("Answer B text"),
      judge_a: makeCrossJudgeResult(),
      judge_b: makeCrossJudgeResult(),
      review_reasons: ["critical_criterion_requires_human"],
      disagreement: false,
      status: "pending",
      queued_at: "2026-07-14T10:00:00Z",
    };

    const existingTasks = new Map<string, Task>();
    const verdict = makeVerdict({ decision: "pass_a" });

    const result = persistHumanVerdict(item, verdict, existingTasks);

    expect(result.task_id).toBe("t1");
    expect(result.split).toBe("dev");
    expect(result.reviewer_type).toBe("human_jurist");
    expect(result.created).toBe(true);

    const persistedTask = existingTasks.get("t1")!;
    expect(persistedTask.review_status).toBe("approved");
    expect(persistedTask.reviewed_by).toBe("Dr. Test");
    expect(persistedTask.reference_output).toBe("Answer A text");
    expect(persistedTask.reviewer?.name).toBe("Dr. Test");
    expect(persistedTask.reviewer?.role).toBe("Jurist (Human Review)");
  });

  it("uses edited text when decision is 'edit'", () => {
    const task = makeTask({ id: "t1", split: "dev" });
    const item: ReviewQueueItem = {
      id: "review-t1-123",
      task_id: "t1",
      task,
      answer_a: makeModelAnswer("Original A"),
      answer_b: makeModelAnswer("Original B"),
      judge_a: makeCrossJudgeResult(),
      judge_b: makeCrossJudgeResult(),
      review_reasons: [],
      disagreement: false,
      status: "pending",
      queued_at: "2026-07-14T10:00:00Z",
    };

    const existingTasks = new Map<string, Task>();
    const verdict = makeVerdict({ decision: "edit", edited_text: "My edited answer" });

    persistHumanVerdict(item, verdict, existingTasks);

    const persistedTask = existingTasks.get("t1")!;
    expect(persistedTask.reference_output).toBe("My edited answer");
  });

  it("throws when task has holdout split", () => {
    const task = makeTask({ id: "t1", split: "holdout" });
    const item: ReviewQueueItem = {
      id: "review-t1-123",
      task_id: "t1",
      task,
      answer_a: makeModelAnswer(),
      answer_b: makeModelAnswer(),
      judge_a: makeCrossJudgeResult(),
      judge_b: makeCrossJudgeResult(),
      review_reasons: [],
      disagreement: false,
      status: "pending",
      queued_at: "2026-07-14T10:00:00Z",
    };

    const existingTasks = new Map<string, Task>();
    const verdict = makeVerdict();

    expect(() => persistHumanVerdict(item, verdict, existingTasks)).toThrow(
      /Persistence violation.*holdout/i
    );
  });

  it("marks as update (not create) when task already exists", () => {
    const task = makeTask({ id: "t1", split: "dev" });
    const item: ReviewQueueItem = {
      id: "review-t1-123",
      task_id: "t1",
      task,
      answer_a: makeModelAnswer("Answer A"),
      answer_b: makeModelAnswer("Answer B"),
      judge_a: makeCrossJudgeResult(),
      judge_b: makeCrossJudgeResult(),
      review_reasons: [],
      disagreement: false,
      status: "pending",
      queued_at: "2026-07-14T10:00:00Z",
    };

    const existingTasks = new Map<string, Task>([["t1", task]]);
    const verdict = makeVerdict();

    const result = persistHumanVerdict(item, verdict, existingTasks);
    expect(result.created).toBe(false);
  });

  it("never sets reviewer_type to llm_cross_judge on human verdicts", () => {
    const task = makeTask({ id: "t1", split: "dev" });
    const item: ReviewQueueItem = {
      id: "review-t1-123",
      task_id: "t1",
      task,
      answer_a: makeModelAnswer("A"),
      answer_b: makeModelAnswer("B"),
      judge_a: makeCrossJudgeResult(),
      judge_b: makeCrossJudgeResult(),
      review_reasons: [],
      disagreement: false,
      status: "pending",
      queued_at: "2026-07-14T10:00:00Z",
    };

    const existingTasks = new Map<string, Task>();
    const verdict = makeVerdict();

    const result = persistHumanVerdict(item, verdict, existingTasks);
    expect(result.reviewer_type).toBe("human_jurist");
    expect(result.reviewer_type).not.toBe("llm_cross_judge");
  });
});

// ── computeQueueStats ──────────────────────────────────────────────────

describe("computeQueueStats", () => {
  it("computes stats correctly", () => {
    const items: ReviewQueueItem[] = [
      {
        id: "r1",
        task_id: "t1",
        task: makeTask(),
        answer_a: makeModelAnswer(),
        answer_b: makeModelAnswer(),
        judge_a: makeCrossJudgeResult(),
        judge_b: makeCrossJudgeResult(),
        review_reasons: ["judge_disagreement", "critical_criterion_requires_human"],
        disagreement: true,
        status: "pending",
        queued_at: "2026-07-14T10:00:00Z",
      },
      {
        id: "r2",
        task_id: "t2",
        task: makeTask({ id: "t2" }),
        answer_a: makeModelAnswer(),
        answer_b: makeModelAnswer(),
        judge_a: makeCrossJudgeResult(),
        judge_b: makeCrossJudgeResult(),
        review_reasons: ["uncertain_or_not_judgeable"],
        disagreement: false,
        status: "resolved",
        queued_at: "2026-07-14T10:00:00Z",
      },
    ];

    const stats = computeQueueStats(items);
    expect(stats.total).toBe(2);
    expect(stats.pending).toBe(1);
    expect(stats.resolved).toBe(1);
    expect(stats.by_disagreement).toBe(1);
    expect(stats.by_reason.judge_disagreement).toBe(1);
    expect(stats.by_reason.critical_criterion_requires_human).toBe(1);
    expect(stats.by_reason.uncertain_or_not_judgeable).toBe(1);
  });

  it("handles empty queue", () => {
    const stats = computeQueueStats([]);
    expect(stats.total).toBe(0);
    expect(stats.pending).toBe(0);
  });
});
