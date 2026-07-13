import { describe, it, expect } from "vitest";
import {
  type Task,
  type Criterion,
  validateTask,
  isValidTask,
  AUTOMATED_CHECK_REGISTRY,
} from "./types.ts";

// ── Fixtures ──────────────────────────────────────────────────────────

function makeValidCriterion(id: string, overrides: Partial<Criterion> = {}): Criterion {
  return {
    id,
    description: `Criterion ${id}`,
    check_type: "llm_judge",
    critical: false,
    judge_question: `Does the output satisfy criterion ${id}?`,
    ...overrides,
  };
}

function makeValidTask(overrides: Partial<Task> = {}): Task {
  const criteria: Criterion[] = [
    makeValidCriterion("crit-001", {
      check_type: "automated",
      automated_check: "citation_grounded_v2",
      critical: true,
    }),
    makeValidCriterion("crit-002", {
      check_type: "automated",
      automated_check: "law_valid",
      critical: true,
    }),
    makeValidCriterion("crit-003", { check_type: "automated", automated_check: "language_german" }),
    makeValidCriterion("crit-004", {
      check_type: "automated",
      automated_check: "jurisdiction_correct",
    }),
    makeValidCriterion("crit-005", {
      check_type: "llm_judge",
      judge_question: "Is the legal analysis correct?",
    }),
    makeValidCriterion("crit-006", {
      check_type: "llm_judge",
      judge_question: "Are all relevant §§ cited?",
    }),
    makeValidCriterion("crit-007", {
      check_type: "llm_judge",
      judge_question: "Is the conclusion well-reasoned?",
    }),
    makeValidCriterion("crit-008", {
      check_type: "llm_judge",
      judge_question: "Is the format correct?",
    }),
  ];

  return {
    id: "lab-dach-de-001",
    title: "Test Task",
    jurisdiction: "DE",
    legal_area: "litigation",
    workflow: "rechtsfrage_memorandum",
    difficulty: "normal",
    split: "dev",
    prompt: "Beantworten Sie die folgende Rechtsfrage: ...",
    deliverables: [
      {
        type: "memo",
        filename: "memo.md",
        description: "Kurzmemorandum zur Rechtsfrage",
      },
    ],
    criteria,
    ...overrides,
  };
}

// ── Validation Tests ──────────────────────────────────────────────────

describe("validateTask", () => {
  it("passes for a valid task", () => {
    const errors = validateTask(makeValidTask());
    expect(errors).toHaveLength(0);
  });

  it("flags empty id", () => {
    const errors = validateTask(makeValidTask({ id: "" }));
    expect(errors.some((e) => e.field === "id")).toBe(true);
  });

  it("flags empty title", () => {
    const errors = validateTask(makeValidTask({ title: "" }));
    expect(errors.some((e) => e.field === "title")).toBe(true);
  });

  it("flags empty prompt", () => {
    const errors = validateTask(makeValidTask({ prompt: "" }));
    expect(errors.some((e) => e.field === "prompt")).toBe(true);
  });

  it("flags CH jurisdiction (not yet supported)", () => {
    const errors = validateTask(makeValidTask({ jurisdiction: "CH" }));
    expect(errors.some((e) => e.field === "jurisdiction")).toBe(true);
  });

  it("flags no deliverables", () => {
    const errors = validateTask(makeValidTask({ deliverables: [] }));
    expect(errors.some((e) => e.field === "deliverables")).toBe(true);
  });

  it("flags fewer than 8 criteria", () => {
    const task = makeValidTask();
    task.criteria = task.criteria.slice(0, 7);
    const errors = validateTask(task);
    expect(errors.some((e) => e.field === "criteria")).toBe(true);
  });

  it("flags no automated criteria", () => {
    const task = makeValidTask();
    task.criteria = task.criteria.map((c) => ({
      ...c,
      check_type: "llm_judge" as const,
      automated_check: undefined,
      judge_question: c.judge_question ?? "test?",
    }));
    const errors = validateTask(task);
    expect(errors.some((e) => e.field === "criteria" && e.message.includes("automated"))).toBe(
      true
    );
  });

  it("flags fewer than 3 llm_judge criteria", () => {
    const task = makeValidTask();
    task.criteria = task.criteria.map((c, i) => ({
      ...c,
      check_type: i < 6 ? ("automated" as const) : ("llm_judge" as const),
      automated_check: i < 6 ? ("language_german" as const) : undefined,
      judge_question: i < 6 ? undefined : "test?",
    }));
    const errors = validateTask(task);
    expect(errors.some((e) => e.field === "criteria" && e.message.includes("llm_judge"))).toBe(
      true
    );
  });

  it("flags fewer than 2 critical criteria", () => {
    const task = makeValidTask();
    task.criteria = task.criteria.map((c) => ({ ...c, critical: false }));
    task.criteria[0]!.critical = true;
    const errors = validateTask(task);
    expect(errors.some((e) => e.field === "criteria" && e.message.includes("critical"))).toBe(true);
  });

  it("flags duplicate criterion IDs", () => {
    const task = makeValidTask();
    task.criteria[5]!.id = "crit-001";
    const errors = validateTask(task);
    expect(errors.some((e) => e.field === "criteria" && e.message.includes("unique"))).toBe(true);
  });

  it("flags automated criterion without automated_check", () => {
    const task = makeValidTask();
    task.criteria[0]!.automated_check = undefined;
    const errors = validateTask(task);
    expect(errors.some((e) => e.message.includes("automated_check"))).toBe(true);
  });

  it("flags llm_judge criterion without judge_question", () => {
    const task = makeValidTask();
    task.criteria[4]!.judge_question = undefined;
    const errors = validateTask(task);
    expect(errors.some((e) => e.message.includes("judge_question"))).toBe(true);
  });
});

// ── isValidTask ───────────────────────────────────────────────────────

describe("isValidTask", () => {
  it("returns true for valid task", () => {
    expect(isValidTask(makeValidTask())).toBe(true);
  });

  it("returns false for invalid task", () => {
    expect(isValidTask(makeValidTask({ id: "" }))).toBe(false);
  });
});

// ── Automated Check Registry ──────────────────────────────────────────

describe("AUTOMATED_CHECK_REGISTRY", () => {
  it("has all 7 automated checks", () => {
    const checks = Object.keys(AUTOMATED_CHECK_REGISTRY);
    expect(checks).toHaveLength(7);
    expect(checks).toContain("citation_grounded_v2");
    expect(checks).toContain("law_valid");
    expect(checks).toContain("substantiated_uncertainty");
    expect(checks).toContain("language_german");
    expect(checks).toContain("min_citations");
    expect(checks).toContain("jurisdiction_correct");
    expect(checks).toContain("source_provenance");
  });

  it("marks citation_grounded_v2 as critical by default", () => {
    expect(AUTOMATED_CHECK_REGISTRY.citation_grounded_v2.default_critical).toBe(true);
  });

  it("marks law_valid as critical by default", () => {
    expect(AUTOMATED_CHECK_REGISTRY.law_valid.default_critical).toBe(true);
  });

  it("marks jurisdiction_correct as critical by default", () => {
    expect(AUTOMATED_CHECK_REGISTRY.jurisdiction_correct.default_critical).toBe(true);
  });

  it("marks min_citations as critical by default", () => {
    expect(AUTOMATED_CHECK_REGISTRY.min_citations.default_critical).toBe(true);
  });

  it("marks substantiated_uncertainty as non-critical by default", () => {
    expect(AUTOMATED_CHECK_REGISTRY.substantiated_uncertainty.default_critical).toBe(false);
  });

  it("marks language_german as non-critical by default", () => {
    expect(AUTOMATED_CHECK_REGISTRY.language_german.default_critical).toBe(false);
  });

  it("marks source_provenance as non-critical by default", () => {
    expect(AUTOMATED_CHECK_REGISTRY.source_provenance.default_critical).toBe(false);
  });
});
