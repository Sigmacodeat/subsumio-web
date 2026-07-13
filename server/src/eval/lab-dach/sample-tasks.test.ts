import { describe, it, expect } from "vitest";
import { validateTask } from "./types.ts";
import {
  ALL_SAMPLE_TASKS,
  SAMPLE_TASK_1_DE,
  SAMPLE_TASK_2_AT,
  SAMPLE_TASK_3_DE,
} from "./sample-tasks.ts";

describe("Sample Tasks Validation", () => {
  it("all sample tasks are valid", () => {
    for (const task of ALL_SAMPLE_TASKS) {
      const errors = validateTask(task);
      expect(
        errors,
        `Task ${task.id} has validation errors: ${errors.map((e) => e.message).join("; ")}`
      ).toHaveLength(0);
    }
  });

  it("task 1 (DE memo) has correct workflow", () => {
    expect(SAMPLE_TASK_1_DE.workflow).toBe("rechtsfrage_memorandum");
    expect(SAMPLE_TASK_1_DE.jurisdiction).toBe("DE");
  });

  it("task 2 (AT fristen) has correct workflow", () => {
    expect(SAMPLE_TASK_2_AT.workflow).toBe("gerichtsakt_fristen");
    expect(SAMPLE_TASK_2_AT.jurisdiction).toBe("AT");
  });

  it("task 3 (DE schriftsatz) has correct workflow", () => {
    expect(SAMPLE_TASK_3_DE.workflow).toBe("schriftsatz_entwurf");
    expect(SAMPLE_TASK_3_DE.jurisdiction).toBe("DE");
  });

  it("each task has at least 8 criteria", () => {
    for (const task of ALL_SAMPLE_TASKS) {
      expect(task.criteria.length).toBeGreaterThanOrEqual(8);
    }
  });

  it("each task has at least 2 critical criteria", () => {
    for (const task of ALL_SAMPLE_TASKS) {
      const critical = task.criteria.filter((c) => c.critical);
      expect(critical.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("each task has at least 3 llm_judge criteria", () => {
    for (const task of ALL_SAMPLE_TASKS) {
      const llmJudge = task.criteria.filter((c) => c.check_type === "llm_judge");
      expect(llmJudge.length).toBeGreaterThanOrEqual(3);
    }
  });

  it("each task has at least 1 automated criterion", () => {
    for (const task of ALL_SAMPLE_TASKS) {
      const automated = task.criteria.filter((c) => c.check_type === "automated");
      expect(automated.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("all sample tasks are in dev split", () => {
    for (const task of ALL_SAMPLE_TASKS) {
      expect(task.split).toBe("dev");
    }
  });
});
