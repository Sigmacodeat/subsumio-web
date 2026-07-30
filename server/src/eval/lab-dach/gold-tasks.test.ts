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
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";
import { validateGoldTask, validateChallengeEntry, type Task, type Criterion } from "./types.ts";
import { GOLD_DE_LITIGATION } from "./gold-tasks-de-litigation.ts";
import { GOLD_DE_CRIMINAL } from "./gold-tasks-de-criminal.ts";
import { GOLD_AT_LITIGATION } from "./gold-tasks-at-litigation.ts";
import { ALL_GOLD_CH } from "./gold-tasks-ch.ts";
import { CHALLENGE_SET } from "./challenge-set.ts";
import { CH_CHALLENGE_SET } from "./ch-challenge-set.ts";
import { GOLD_HOLDOUT, loadHoldoutManifest } from "./holdout/gold-tasks-holdout.ts";
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

const ALL_GOLD_TASKS: Task[] = [
  ...GOLD_DE_LITIGATION,
  ...GOLD_DE_CRIMINAL,
  ...GOLD_AT_LITIGATION,
  ...ALL_GOLD_CH,
];

// ── Gold Task Validation Tests ────────────────────────────────────────

describe("Gold Tasks — Validation", () => {
  it("should have 31 development/test gold tasks (25 DE/AT + 6 CH, holdout is sealed)", () => {
    expect(ALL_GOLD_TASKS.length).toBe(31);
    expect(ALL_GOLD_TASKS.every((task) => task.split !== "holdout")).toBe(true);
  });

  it("should have 6 CH gold tasks in the dev/test set", () => {
    const chTasks = ALL_GOLD_TASKS.filter((t) => t.jurisdiction === "CH");
    expect(chTasks.length).toBe(6);
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

  it("every gold task should have reviewer metadata with name and role", () => {
    for (const task of ALL_GOLD_TASKS) {
      expect(task.reviewer).toBeTruthy();
      expect(task.reviewer!.name).toBeTruthy();
      expect(task.reviewer!.role).toBeTruthy();
    }
  });

  it("approved gold tasks should have reviewed_at set, draft tasks may have null", () => {
    for (const task of ALL_GOLD_TASKS) {
      if (task.review_status === "approved") {
        expect(task.reviewer!.reviewed_at).toBeTruthy();
      }
    }
  });

  it("every gold task should have review_status 'draft' or 'approved'", () => {
    for (const task of ALL_GOLD_TASKS) {
      expect(["draft", "approved"]).toContain(task.review_status);
    }
  });

  it("all CH gold tasks should have review_status 'draft'", () => {
    const chTasks = ALL_GOLD_TASKS.filter((t) => t.jurisdiction === "CH");
    for (const task of chTasks) {
      expect(task.review_status).toBe("draft");
    }
  });

  it("every CH gold task should have a Swiss-qualified reviewer", () => {
    const chTasks = ALL_GOLD_TASKS.filter((t) => t.jurisdiction === "CH");
    for (const task of chTasks) {
      expect(task.reviewer).toBeTruthy();
      expect(task.reviewer!.name).toBeTruthy();
      expect(task.reviewer!.role).toBe("Fürsprecher");
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

// ── Challenge Set Tests (DE/AT) ──────────────────────────────────────

describe("Challenge Set (DE/AT)", () => {
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

// ── CH Challenge Set Tests ────────────────────────────────────────────

describe("CH Challenge Set", () => {
  it("should have at least 26 entries", () => {
    expect(CH_CHALLENGE_SET.length).toBeGreaterThanOrEqual(26);
  });

  it("every CH entry should pass validateChallengeEntry", () => {
    for (const entry of CH_CHALLENGE_SET) {
      const errors = validateChallengeEntry(entry);
      if (errors.length > 0) {
        console.error(`CH Challenge ${entry.id} validation errors:`, errors);
      }
      expect(errors).toHaveLength(0);
    }
  });

  it("every CH entry should have a unique id", () => {
    const ids = CH_CHALLENGE_SET.map((e) => e.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it("every CH entry should have a non-empty manipulated_output (min 20 chars)", () => {
    for (const entry of CH_CHALLENGE_SET) {
      expect(entry.manipulated_output.length).toBeGreaterThanOrEqual(20);
    }
  });

  it("every CH entry should have jurisdiction CH", () => {
    for (const entry of CH_CHALLENGE_SET) {
      expect(entry.jurisdiction).toBe("CH");
    }
  });

  it("should cover CH manipulation types (at least 8 of 10)", () => {
    const types = new Set(CH_CHALLENGE_SET.map((e) => e.manipulation_type));
    expect(types.size).toBeGreaterThanOrEqual(8);
    expect(types.has("wrong_jurisdiction")).toBe(true);
    expect(types.has("fabricated_paragraph")).toBe(true);
    expect(types.has("wrong_law")).toBe(true);
    expect(types.has("wrong_conclusion")).toBe(true);
    expect(types.has("language_contamination")).toBe(true);
    expect(types.has("removed_uncertainty")).toBe(true);
    expect(types.has("fabricated_law")).toBe(true);
    expect(types.has("outdated_law")).toBe(true);
  });

  it("should have 10 wrong_jurisdiction entries (5 CH→DE, 5 CH→AT)", () => {
    const count = CH_CHALLENGE_SET.filter(
      (e) => e.manipulation_type === "wrong_jurisdiction"
    ).length;
    expect(count).toBe(10);
  });

  it("every CH entry should reference a valid CH source task_id", () => {
    const chTaskIds = new Set(ALL_GOLD_CH.map((t) => t.id));
    for (const entry of CH_CHALLENGE_SET) {
      expect(chTaskIds.has(entry.source_task_id)).toBe(true);
    }
  });

  it("CH and DE/AT challenge sets should have no overlapping IDs", () => {
    const deAtIds = new Set(CHALLENGE_SET.map((e) => e.id));
    const chIds = CH_CHALLENGE_SET.map((e) => e.id);
    for (const id of chIds) {
      expect(deAtIds.has(id)).toBe(false);
    }
  });
});

// ── Qrels Tests ───────────────────────────────────────────────────────

describe("Retrieval Qrels (BASE — DE/AT only)", () => {
  it("should have qrels for all 25 DE/AT development/test gold tasks", () => {
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

  it("every BASE qrel slug should match pattern law/<jurisdiction>/<law>/<paragraph>", () => {
    for (const q of BASE_QRELS) {
      for (const r of [...q.qrels.relevant, ...q.qrels.hard_negatives]) {
        expect(r.slug).toMatch(/^law\/[a-z]{2}\/[a-z0-9-]+\/(§-[0-9a-z]+|art-[0-9a-z]+)$/);
      }
    }
  });
});

describe("Retrieval Qrels (ALL — including CH)", () => {
  it("should have qrels for all 31 development/test gold tasks (25 DE/AT + 6 CH)", () => {
    expect(TOTAL_QRELS).toBe(31);
  });

  it("ALL_QRELS should have at least 1 relevant entry per task", () => {
    for (const q of ALL_QRELS) {
      expect(q.qrels.relevant.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("ALL_QRELS should have at least 1 hard negative entry per task", () => {
    for (const q of ALL_QRELS) {
      expect(q.qrels.hard_negatives.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("CH qrels should have jurisdiction CH", () => {
    const chQrels = ALL_QRELS.filter((q) => q.jurisdiction === "CH");
    expect(chQrels.length).toBe(6);
    for (const q of chQrels) {
      expect(q.jurisdiction).toBe("CH");
    }
  });

  it("CH qrel slugs should use art- format (not §-)", () => {
    const chQrels = ALL_QRELS.filter((q) => q.jurisdiction === "CH");
    for (const q of chQrels) {
      for (const r of q.qrels.relevant) {
        expect(r.slug).toMatch(/^law\/ch\/[a-z0-9-]+\/art-[0-9a-z]+$/);
      }
    }
  });

  it("every ALL qrel slug should match pattern (§- for DE/AT, art- for CH)", () => {
    for (const q of ALL_QRELS) {
      for (const r of [...q.qrels.relevant, ...q.qrels.hard_negatives]) {
        expect(r.slug).toMatch(/^law\/[a-z]{2}\/[a-z0-9-]+\/(§-[0-9a-z]+|art-[0-9a-z]+)$/);
      }
    }
  });

  it("getQrelsForTask should return qrels for known task ID", () => {
    const firstTask = ALL_GOLD_TASKS[0];
    const qrels = getQrelsForTask(firstTask.id);
    expect(qrels).toBeTruthy();
    expect(qrels!.task_id).toBe(firstTask.id);
  });

  it("getQrelsForTask should return qrels for a CH task ID", () => {
    const chTask = ALL_GOLD_CH[0];
    const qrels = getQrelsForTask(chTask.id);
    expect(qrels).toBeTruthy();
    expect(qrels!.task_id).toBe(chTask.id);
    expect(qrels!.jurisdiction).toBe("CH");
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

// ── Holdout Gold Tasks Tests ──────────────────────────────────────────

// ── Holdout Manifest Tests ────────────────────────────────────────────

describe("Holdout Manifest", () => {
  it("GOLD_HOLDOUT should be empty (cleartext removed from repo)", () => {
    expect(GOLD_HOLDOUT.length).toBe(0);
  });

  it("holdout manifest should load and have 7 tasks", () => {
    const manifest = loadHoldoutManifest();
    expect(manifest.task_count).toBe(7);
    expect(manifest.tasks.length).toBe(7);
  });

  it("holdout manifest should have a seal_hash", () => {
    const manifest = loadHoldoutManifest();
    expect(manifest.seal_hash).toBeTruthy();
    expect(manifest.seal_hash.length).toBe(64);
  });

  it("holdout manifest should have 2 CH tasks", () => {
    const manifest = loadHoldoutManifest();
    const chTasks = manifest.tasks.filter((t) => t.jurisdiction === "CH");
    expect(chTasks.length).toBe(2);
  });

  it("holdout manifest task IDs should not appear in dev/test set", () => {
    const manifest = loadHoldoutManifest();
    const devTestIds = new Set(ALL_GOLD_TASKS.map((t) => t.id));
    for (const entry of manifest.tasks) {
      expect(devTestIds.has(entry.id)).toBe(false);
    }
  });

  it("every manifest entry should have id, title, jurisdiction, legal_area, hash", () => {
    const manifest = loadHoldoutManifest();
    for (const entry of manifest.tasks) {
      expect(entry.id).toBeTruthy();
      expect(entry.title).toBeTruthy();
      expect(entry.jurisdiction).toBeTruthy();
      expect(entry.legal_area).toBeTruthy();
      expect(entry.hash).toBeTruthy();
      expect(entry.hash.length).toBe(64);
    }
  });
});

// ── CI-Guard: No Holdout Cleartext in Repo ─────────────────────────────

describe("CI-Guard: No Holdout Cleartext in Repo", () => {
  const REPO_ROOT = join(import.meta.dirname, "../../../..");
  const HOLDOUT_DIR = join(import.meta.dirname, "holdout");

  function scanDirForHoldoutTasks(
    dir: string,
    results: { file: string; line: number; content: string }[]
  ) {
    const entries = readdirSync(dir);
    for (const entry of entries) {
      const fullPath = join(dir, entry);
      const stat = statSync(fullPath);
      if (stat.isDirectory()) {
        if (
          entry === "node_modules" ||
          entry === ".git" ||
          entry === "dist" ||
          entry === ".next" ||
          entry === ".bun" ||
          entry === ".claude" ||
          entry === ".windsurf" ||
          entry === "target" ||
          entry === "law-corpus" ||
          entry === ".turbo" ||
          entry === "coverage" ||
          entry === ".cache" ||
          entry === "build" ||
          entry === ".svelte-kit" ||
          entry === ".astro"
        )
          continue;
        scanDirForHoldoutTasks(fullPath, results);
      } else if (
        extname(entry) === ".ts" ||
        extname(entry) === ".tsx" ||
        extname(entry) === ".js"
      ) {
        // Skip test files — they legitimately use split:'holdout' in test fixtures
        if (entry.includes(".test.") || entry.includes(".spec.")) continue;
        const content = readFileSync(fullPath, "utf-8");
        const lines = content.split("\n");
        for (let i = 0; i < lines.length; i++) {
          // Flag any file that defines a task with split: "holdout" (except the stub itself)
          // Skip comments (lines starting with *, //, or /*) that mention 'holdout' in prose
          const trimmed = lines[i].trim();
          if (trimmed.startsWith("*") || trimmed.startsWith("//") || trimmed.startsWith("/*"))
            continue;
          if (
            /split\s*:\s*["']holdout["']/.test(lines[i]) &&
            !fullPath.includes("gold-tasks-holdout.ts")
          ) {
            results.push({ file: fullPath, line: i + 1, content: lines[i].trim() });
          }
        }
      }
    }
  }

  it("no .ts/.js file in repo (except holdout stub) should contain split:'holdout' task content", () => {
    const violations: { file: string; line: number; content: string }[] = [];
    scanDirForHoldoutTasks(REPO_ROOT, violations);
    if (violations.length > 0) {
      console.error("Holdout cleartext leakage detected:", violations);
    }
    expect(violations.length).toBe(0);
  }, 30000); // 30s: recursive scan of large repo

  it("holdout stub file should not contain task prompt or reference_output content", () => {
    const stubContent = readFileSync(join(HOLDOUT_DIR, "gold-tasks-holdout.ts"), "utf-8");
    // The stub should not contain actual task prompts or reference outputs
    expect(stubContent).not.toContain("gold-holdout-001");
    expect(stubContent).not.toContain("Rückgewähr nach Rücktritt");
    expect(stubContent).not.toContain("Geschäftsführung ohne Auftrag");
    expect(stubContent).not.toContain("Erpressung");
    expect(stubContent).not.toContain("Brandstiftung");
    expect(stubContent).not.toContain("Klagsänderung");
    expect(stubContent).not.toContain("Werkvertrag");
    expect(stubContent).not.toContain("Totschlag");
  });

  it("holdout manifest JSON should exist and be valid", () => {
    const manifestPath = join(HOLDOUT_DIR, "holdout-manifest.json");
    const content = readFileSync(manifestPath, "utf-8");
    const manifest = JSON.parse(content);
    expect(manifest.task_count).toBe(7);
    expect(manifest.tasks.length).toBe(7);
    expect(manifest.seal_hash).toBeTruthy();
  });
});
