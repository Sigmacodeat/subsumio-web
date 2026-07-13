/**
 * LAB-DACH v3 — Tests for Gold Tasks, Challenge Set, and Qrels
 *
 * Verifies:
 *   1. All gold tasks pass validateGoldTask()
 *   2. All gold tasks have required + severity flags on criteria
 *   3. Challenge set has exactly 100 entries, all valid
 *   4. Challenge set covers all manipulation types
 *   5. Qrels are aggregated correctly
 */

import { describe, it, expect } from "vitest";
import { validateGoldTask, validateChallengeEntry, type Task, type Criterion } from "./types.ts";
import { GOLD_DE_LITIGATION } from "./gold-tasks-de-litigation.ts";
import { GOLD_DE_CRIMINAL } from "./gold-tasks-de-criminal.ts";
import { GOLD_AT_LITIGATION } from "./gold-tasks-at-litigation.ts";
import { CHALLENGE_SET } from "./challenge-set.ts";
import {
  BASE_QRELS,
  BASE_TOTAL_QRELS,
  ALL_QRELS,
  TOTAL_QRELS,
  TOTAL_RELEVANT,
  TOTAL_HARD_NEGATIVES,
  getQrelsForTask,
  getRelevantSlugs,
  getHardNegativeSlugs,
} from "./retrieval-qrels.ts";

const ALL_GOLD_TASKS: Task[] = [...GOLD_DE_LITIGATION, ...GOLD_DE_CRIMINAL, ...GOLD_AT_LITIGATION];

// ── Gold Task Validation Tests ────────────────────────────────────────

describe("Gold Tasks — Validation", () => {
  it("should have 25 development/test gold tasks (holdout is sealed)", () => {
    expect(ALL_GOLD_TASKS.length).toBe(25);
    expect(ALL_GOLD_TASKS.every((task) => task.split !== "holdout")).toBe(true);
  });

  it("every gold task should pass validateGoldTask with zero errors", () => {
    for (const task of ALL_GOLD_TASKS) {
      const errors = validateGoldTask(task);
      if (errors.length > 0) {
        console.error(`Task ${task.id} validation errors:`, errors);
      }
      expect(errors).toHaveLength(0);
    }
  });

  it("every gold task should have as_of_date set", () => {
    for (const task of ALL_GOLD_TASKS) {
      expect(task.as_of_date).toBeTruthy();
      expect(task.as_of_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("every gold task should have at least 1 official source", () => {
    for (const task of ALL_GOLD_TASKS) {
      expect(task.official_sources).toBeTruthy();
      expect(task.official_sources!.length).toBeGreaterThanOrEqual(1);
      for (const src of task.official_sources!) {
        expect(src.url).toBeTruthy();
        expect(src.description).toBeTruthy();
      }
    }
  });

  it("every gold task should have a non-empty reference_output", () => {
    for (const task of ALL_GOLD_TASKS) {
      expect(task.reference_output).toBeTruthy();
      expect(task.reference_output!.length).toBeGreaterThanOrEqual(100);
    }
  });

  it("every gold task should have reviewer metadata", () => {
    for (const task of ALL_GOLD_TASKS) {
      expect(task.reviewer).toBeTruthy();
      expect(task.reviewer!.name).toBeTruthy();
      expect(task.reviewer!.role).toBeTruthy();
      expect(task.reviewer!.reviewed_at).toBeTruthy();
    }
  });

  it("every gold task should have review_status 'approved'", () => {
    for (const task of ALL_GOLD_TASKS) {
      expect(task.review_status).toBe("approved");
    }
  });

  it("every gold task should have qrels with at least 1 relevant entry", () => {
    for (const task of ALL_GOLD_TASKS) {
      expect(task.qrels).toBeTruthy();
      expect(task.qrels!.relevant.length).toBeGreaterThanOrEqual(1);
      expect(task.qrels!.hard_negatives.length).toBeGreaterThanOrEqual(1);
    }
  });
});

// ── Criterion Quality Tests ───────────────────────────────────────────

describe("Gold Tasks — Criteria Quality", () => {
  it("every criterion should have required and severity fields set", () => {
    for (const task of ALL_GOLD_TASKS) {
      for (const crit of task.criteria as Criterion[]) {
        expect(crit.required).toBeDefined();
        expect(crit.severity).toBeDefined();
        expect(["low", "medium", "high", "critical"]).toContain(crit.severity);
      }
    }
  });

  it("every gold task should have at least 8 criteria", () => {
    for (const task of ALL_GOLD_TASKS) {
      expect(task.criteria.length).toBeGreaterThanOrEqual(8);
    }
  });

  it("every gold task should have at least 1 automated criterion", () => {
    for (const task of ALL_GOLD_TASKS) {
      const automated = task.criteria.filter((c) => c.check_type === "automated");
      expect(automated.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("every gold task should have at least 3 llm_judge criteria", () => {
    for (const task of ALL_GOLD_TASKS) {
      const llmJudge = task.criteria.filter((c) => c.check_type === "llm_judge");
      expect(llmJudge.length).toBeGreaterThanOrEqual(3);
    }
  });

  it("every gold task should have at least 2 critical criteria", () => {
    for (const task of ALL_GOLD_TASKS) {
      const critical = task.criteria.filter((c) => c.critical);
      expect(critical.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("criterion IDs should be unique within each task", () => {
    for (const task of ALL_GOLD_TASKS) {
      const ids = task.criteria.map((c) => c.id);
      const unique = new Set(ids);
      expect(unique.size).toBe(ids.length);
    }
  });
});

// ── Challenge Set Tests ───────────────────────────────────────────────

describe("Challenge Set", () => {
  it("should have exactly 100 entries", () => {
    expect(CHALLENGE_SET.length).toBe(100);
  });

  it("every entry should pass validateChallengeEntry", () => {
    for (const entry of CHALLENGE_SET) {
      const errors = validateChallengeEntry(entry);
      if (errors.length > 0) {
        console.error(`Challenge ${entry.id} validation errors:`, errors);
      }
      expect(errors).toHaveLength(0);
    }
  });

  it("every entry should have a unique id", () => {
    const ids = CHALLENGE_SET.map((e) => e.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it("every entry should have a non-empty manipulated_output (min 20 chars)", () => {
    for (const entry of CHALLENGE_SET) {
      expect(entry.manipulated_output.length).toBeGreaterThanOrEqual(20);
    }
  });

  it("should cover all 10 manipulation types", () => {
    const types = new Set(CHALLENGE_SET.map((e) => e.manipulation_type));
    expect(types.size).toBe(10);
    expect(types.has("wrong_jurisdiction")).toBe(true);
    expect(types.has("fabricated_paragraph")).toBe(true);
    expect(types.has("ungrounded_citation")).toBe(true);
    expect(types.has("wrong_law")).toBe(true);
    expect(types.has("wrong_conclusion")).toBe(true);
    expect(types.has("language_contamination")).toBe(true);
    expect(types.has("removed_uncertainty")).toBe(true);
    expect(types.has("fabricated_law")).toBe(true);
    expect(types.has("misattributed_quote")).toBe(true);
    expect(types.has("outdated_law")).toBe(true);
  });

  it("should have 20 wrong_jurisdiction entries", () => {
    const count = CHALLENGE_SET.filter((e) => e.manipulation_type === "wrong_jurisdiction").length;
    expect(count).toBe(20);
  });

  it("should have 15 fabricated_paragraph entries", () => {
    const count = CHALLENGE_SET.filter(
      (e) => e.manipulation_type === "fabricated_paragraph"
    ).length;
    expect(count).toBe(15);
  });

  it("should have 15 ungrounded_citation entries", () => {
    const count = CHALLENGE_SET.filter((e) => e.manipulation_type === "ungrounded_citation").length;
    expect(count).toBe(15);
  });

  it("should have 15 wrong_law entries", () => {
    const count = CHALLENGE_SET.filter((e) => e.manipulation_type === "wrong_law").length;
    expect(count).toBe(15);
  });

  it("should have 15 wrong_conclusion entries", () => {
    const count = CHALLENGE_SET.filter((e) => e.manipulation_type === "wrong_conclusion").length;
    expect(count).toBe(15);
  });

  it("should have 5 language_contamination entries", () => {
    const count = CHALLENGE_SET.filter(
      (e) => e.manipulation_type === "language_contamination"
    ).length;
    expect(count).toBe(5);
  });

  it("should have 5 removed_uncertainty entries", () => {
    const count = CHALLENGE_SET.filter((e) => e.manipulation_type === "removed_uncertainty").length;
    expect(count).toBe(5);
  });

  it("should have 5 fabricated_law entries", () => {
    const count = CHALLENGE_SET.filter((e) => e.manipulation_type === "fabricated_law").length;
    expect(count).toBe(5);
  });

  it("should have 3 misattributed_quote entries", () => {
    const count = CHALLENGE_SET.filter((e) => e.manipulation_type === "misattributed_quote").length;
    expect(count).toBe(3);
  });

  it("should have 2 outdated_law entries", () => {
    const count = CHALLENGE_SET.filter((e) => e.manipulation_type === "outdated_law").length;
    expect(count).toBe(2);
  });

  it("every entry should reference a valid source task_id", () => {
    const taskIds = new Set(ALL_GOLD_TASKS.map((t) => t.id));
    for (const entry of CHALLENGE_SET) {
      expect(taskIds.has(entry.source_task_id)).toBe(true);
    }
  });
});

// ── Qrels Tests ───────────────────────────────────────────────────────

describe("Retrieval Qrels", () => {
  it("should have qrels for all 25 development/test gold tasks", () => {
    expect(BASE_TOTAL_QRELS).toBe(25);
  });

  it("should have at least 1 relevant entry per task", () => {
    for (const q of BASE_QRELS) {
      expect(q.qrels.relevant.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("should have at least 1 hard negative entry per task", () => {
    for (const q of BASE_QRELS) {
      expect(q.qrels.hard_negatives.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("relevant entries should have grade >= 1", () => {
    for (const q of BASE_QRELS) {
      for (const r of q.qrels.relevant) {
        expect(r.grade).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it("hard negative entries should have grade 0 or 1", () => {
    for (const q of BASE_QRELS) {
      for (const r of q.qrels.hard_negatives) {
        expect(r.grade).toBeLessThanOrEqual(1);
      }
    }
  });

  it("every qrel slug should match pattern law/<jurisdiction>/<law>/<paragraph>", () => {
    for (const q of BASE_QRELS) {
      for (const r of [...q.qrels.relevant, ...q.qrels.hard_negatives]) {
        expect(r.slug).toMatch(/^law\/[a-z]{2}\/[a-z0-9-]+\/§-[0-9a-z]+$/);
      }
    }
  });

  it("getQrelsForTask should return qrels for known task ID", () => {
    const firstTask = ALL_GOLD_TASKS[0];
    const qrels = getQrelsForTask(firstTask.id);
    expect(qrels).toBeTruthy();
    expect(qrels!.task_id).toBe(firstTask.id);
  });

  it("getQrelsForTask should return undefined for unknown task ID", () => {
    const qrels = getQrelsForTask("nonexistent-task");
    expect(qrels).toBeUndefined();
  });

  it("getRelevantSlugs should return array of slug strings", () => {
    const firstTask = ALL_GOLD_TASKS[0];
    const slugs = getRelevantSlugs(firstTask.id);
    expect(slugs.length).toBeGreaterThanOrEqual(1);
    for (const s of slugs) {
      expect(typeof s).toBe("string");
    }
  });

  it("getHardNegativeSlugs should return array of slug strings", () => {
    const firstTask = ALL_GOLD_TASKS[0];
    const slugs = getHardNegativeSlugs(firstTask.id);
    expect(slugs.length).toBeGreaterThanOrEqual(1);
  });

  it("TOTAL_RELEVANT should be > 0", () => {
    expect(TOTAL_RELEVANT).toBeGreaterThan(0);
  });

  it("TOTAL_HARD_NEGATIVES should be > 0", () => {
    expect(TOTAL_HARD_NEGATIVES).toBeGreaterThan(0);
  });
});
