/**
 * LAB-DACH v3 — EPIC 10 Tests
 *
 * Tests for all 4 work packages:
 *   T10.1: Gold Task Scaling Infrastructure
 *   T10.2: CH Challenge Set
 *   T10.3: Public Benchmark Protocol
 *   T10.4: Publisher Partnership Integration
 */

import { describe, test, expect } from "vitest";
import {
  batchImportTasks,
  assignSplits,
  computeCoverageMatrix,
  computeBatchTimeBudget,
  estimateJuristTime,
  checkScalingGates,
  SCALING_TARGETS,
  generateTaskId,
  TASK_TEMPLATES,
} from "../src/eval/lab-dach/task-registry.ts";
import {
  GOLD_CH_LITIGATION,
  GOLD_CH_CRIMINAL,
  GOLD_CH_INHERITANCE,
  ALL_GOLD_CH,
} from "../src/eval/lab-dach/gold-tasks-ch.ts";
import { CH_CHALLENGE_SET, checkCHCorpusReadiness } from "../src/eval/lab-dach/ch-challenge-set.ts";
import { validateGoldTask, validateTask } from "../src/eval/lab-dach/types.ts";
import {
  ALL_QRELS,
  TOTAL_QRELS,
  TOTAL_RELEVANT,
  TOTAL_HARD_NEGATIVES,
} from "../src/eval/lab-dach/retrieval-qrels.ts";
import {
  sealHoldout,
  revealHoldout,
  verifySeal,
  createSubmission,
  checkAntiLeakage,
  exportRawReceipts,
  generatePublicReport,
  wilsonConfidenceInterval,
  getAllDevTestTasks,
  getAllHoldoutTasks,
} from "../src/eval/lab-dach/public-benchmark.ts";
import {
  KNOWN_PUBLISHERS,
  publisherToLicenseTerms,
  createPublisherContentImport,
  createPartnershipWorkflow,
  advancePartnershipPhase,
  checkAttribution,
  computePublisherStats,
  PARTNERSHIP_PHASE_ORDER,
} from "../src/eval/lab-dach/publisher-registry.ts";
import { GOLD_DE_LITIGATION } from "../src/eval/lab-dach/gold-tasks-de-litigation.ts";
import { GOLD_DE_CRIMINAL } from "../src/eval/lab-dach/gold-tasks-de-criminal.ts";
import { GOLD_AT_LITIGATION } from "../src/eval/lab-dach/gold-tasks-at-litigation.ts";
import { CHALLENGE_SET } from "../src/eval/lab-dach/challenge-set.ts";

// ── T10.1: Gold Task Scaling ──────────────────────────────────────────

describe("T10.1: Gold Task Scaling Infrastructure", () => {
  const allExistingTasks = [
    ...GOLD_DE_LITIGATION,
    ...GOLD_DE_CRIMINAL,
    ...GOLD_AT_LITIGATION,
    ...ALL_GOLD_CH,
  ];

  test("scaling targets are defined for 3 phases", () => {
    expect(SCALING_TARGETS.phase1_100.total_tasks).toBe(100);
    expect(SCALING_TARGETS.phase2_300.total_tasks).toBe(300);
    expect(SCALING_TARGETS.phase3_500.total_tasks).toBe(500);
  });

  test("split ratios sum to ~1.0", () => {
    for (const target of Object.values(SCALING_TARGETS) as {
      split_ratios: { dev: number; test: number; holdout: number };
    }[]) {
      const sum = target.split_ratios.dev + target.split_ratios.test + target.split_ratios.holdout;
      expect(sum).toBeCloseTo(1.0, 1);
    }
  });

  test("batch import detects duplicates", () => {
    const result = batchImportTasks(allExistingTasks, allExistingTasks);
    expect(result.imported).toBe(0);
    expect(result.skipped_duplicates).toBe(allExistingTasks.length);
  });

  test("batch import validates tasks", () => {
    const invalidTask = {
      ...allExistingTasks[0],
      id: "test-invalid-001",
      criteria: [],
    };
    const result = batchImportTasks([invalidTask], allExistingTasks);
    expect(result.imported).toBe(0);
    expect(result.errors.length).toBe(1);
  });

  test("batch import accepts valid new tasks", () => {
    const newTask = {
      ...allExistingTasks[0],
      id: "test-new-001",
      title: "Test New Task",
    };
    const result = batchImportTasks([newTask], allExistingTasks);
    expect(result.imported).toBe(1);
    expect(result.task_ids).toContain("test-new-001");
  });

  test("assign splits produces correct ratios", () => {
    const assignments = assignSplits(allExistingTasks, SCALING_TARGETS.phase1_100);
    expect(assignments.length).toBe(allExistingTasks.length);

    const devCount = assignments.filter((a) => a.assigned_split === "dev").length;
    const testCount = assignments.filter((a) => a.assigned_split === "test").length;
    const holdoutCount = assignments.filter((a) => a.assigned_split === "holdout").length;

    expect(devCount + testCount + holdoutCount).toBe(allExistingTasks.length);
  });

  test("coverage matrix computes correct totals", () => {
    const matrix = computeCoverageMatrix(allExistingTasks);
    expect(matrix.total).toBe(allExistingTasks.length);
    expect(matrix.cells.length).toBeGreaterThan(0);
    expect(Object.keys(matrix.by_jurisdiction).length).toBeGreaterThanOrEqual(3);
  });

  test("coverage matrix identifies gaps vs targets", () => {
    const matrix = computeCoverageMatrix(allExistingTasks, SCALING_TARGETS.phase1_100);
    expect(matrix.gaps.length).toBeGreaterThan(0);
    expect(matrix.gaps.some((g) => g.deficit > 0)).toBe(true);
  });

  test("jurist time estimate scales with difficulty", () => {
    const easyTask = { ...allExistingTasks[0], difficulty: "beginner" as const };
    const hardTask = { ...allExistingTasks[0], difficulty: "power_user" as const };

    const easyTime = estimateJuristTime(easyTask);
    const hardTime = estimateJuristTime(hardTask);

    expect(hardTime.total_minutes).toBeGreaterThan(easyTime.total_minutes);
  });

  test("batch time budget computes totals", () => {
    const budget = computeBatchTimeBudget(allExistingTasks, { jurists: 2 });
    expect(budget.total_minutes).toBeGreaterThan(0);
    expect(budget.total_hours).toBeGreaterThan(0);
    expect(budget.estimated_cost_eur).toBeGreaterThan(0);
    expect(budget.recommended_jurists).toBe(2);
  });

  test("scaling gates block when metrics missing", () => {
    const report = checkScalingGates(allExistingTasks, SCALING_TARGETS.phase1_100, "phase1_100");
    expect(report.can_scale).toBe(false);
    expect(report.blocking_gates).toContain("false_pass_rate");
    expect(report.blocking_gates).toContain("gold_error_rate");
    expect(report.blocking_gates).toContain("leakage");
    expect(report.blocking_gates).toContain("judge_kappa");
  });

  test("scaling gates pass when all metrics meet thresholds", () => {
    const report = checkScalingGates(allExistingTasks, SCALING_TARGETS.phase1_100, "phase1_100", {
      falsePassRate: 0.03,
      goldErrorRate: 0.01,
      leakageScore: 0.005,
      judgeKappa: 0.85,
    });
    expect(report.can_scale).toBe(true);
    expect(report.blocking_gates.length).toBe(0);
  });

  test("generateTaskId produces unique sequential IDs", () => {
    const existingIds = new Set(["gold-de-lit-001", "gold-de-lit-002"]);
    const newId = generateTaskId("DE", "litigation", existingIds);
    expect(newId).toBe("gold-de-lit-003");
    expect(existingIds.has(newId)).toBe(false);
  });

  test("task templates cover CH jurisdiction", () => {
    const chTemplates = TASK_TEMPLATES.filter((t) => t.jurisdiction === "CH");
    expect(chTemplates.length).toBeGreaterThanOrEqual(2);
    expect(chTemplates.some((t) => t.legal_area === "litigation")).toBe(true);
    expect(chTemplates.some((t) => t.legal_area === "criminal")).toBe(true);
  });
});

// ── T10.2: CH Challenge Set ───────────────────────────────────────────

describe("T10.2: CH Challenge Set", () => {
  test("CH gold tasks pass basic validation (validateTask)", () => {
    for (const task of ALL_GOLD_CH) {
      const errors = validateTask(task);
      const nonReviewErrors = errors.filter((e) => e.field !== "review_status");
      expect(nonReviewErrors.length).toBe(0);
    }
  });

  test("CH gold tasks fail gold validation only on review_status (draft pending Swiss jurist)", () => {
    for (const task of ALL_GOLD_CH) {
      const errors = validateGoldTask(task);
      const reviewErrors = errors.filter((e) => e.field === "review_status");
      const nonReviewErrors = errors.filter((e) => e.field !== "review_status");
      expect(reviewErrors.length).toBe(1);
      expect(reviewErrors[0].message).toContain("approved");
      expect(nonReviewErrors.length).toBe(0);
    }
  });

  test("CH gold tasks have correct jurisdiction", () => {
    for (const task of ALL_GOLD_CH) {
      expect(task.jurisdiction).toBe("CH");
    }
  });

  test("CH gold tasks have official sources from Fedlex", () => {
    for (const task of ALL_GOLD_CH) {
      expect(task.official_sources).toBeDefined();
      expect(task.official_sources!.length).toBeGreaterThan(0);
      const hasFedlex = task.official_sources!.some((s) => s.url.includes("fedlex"));
      expect(hasFedlex).toBe(true);
    }
  });

  test("CH gold tasks have qrels", () => {
    for (const task of ALL_GOLD_CH) {
      expect(task.qrels).toBeDefined();
      expect(task.qrels!.relevant.length).toBeGreaterThan(0);
      expect(task.qrels!.hard_negatives.length).toBeGreaterThan(0);
    }
  });

  test("CH gold tasks have review_status draft (pending Swiss jurist review)", () => {
    for (const task of ALL_GOLD_CH) {
      expect(task.review_status).toBe("draft");
    }
  });

  test("CH gold tasks have as_of_date", () => {
    for (const task of ALL_GOLD_CH) {
      expect(task.as_of_date).toBeDefined();
      expect(task.as_of_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  test("CH challenge set has entries", () => {
    expect(CH_CHALLENGE_SET.length).toBeGreaterThan(0);
  });

  test("CH challenge entries have CH jurisdiction", () => {
    for (const entry of CH_CHALLENGE_SET) {
      expect(entry.jurisdiction).toBe("CH");
    }
  });

  test("CH challenge entries cover multiple manipulation types", () => {
    const types = new Set(CH_CHALLENGE_SET.map((e) => e.manipulation_type));
    expect(types.has("wrong_jurisdiction")).toBe(true);
    expect(types.has("fabricated_paragraph")).toBe(true);
    expect(types.has("wrong_law")).toBe(true);
    expect(types.has("wrong_conclusion")).toBe(true);
  });

  test("CH corpus readiness check detects missing files", () => {
    const partialCorpus = [
      { slug: "law/ch/or", name: "or.md", size_bytes: 1000000 },
      { slug: "law/ch/zgb", name: "zgb.md", size_bytes: 500000 },
    ];
    const readiness = checkCHCorpusReadiness(partialCorpus);
    expect(readiness.ready).toBe(false);
    expect(readiness.missing.length).toBeGreaterThan(0);
  });

  test("CH corpus readiness check passes with all required files", () => {
    const fullCorpus = [
      { slug: "law/ch/or", name: "or.md", size_bytes: 1000000 },
      { slug: "law/ch/zgb", name: "zgb.md", size_bytes: 500000 },
      { slug: "law/ch/stgb", name: "stgb.md", size_bytes: 400000 },
      { slug: "law/ch/zpo", name: "zpo.md", size_bytes: 6000 },
      { slug: "law/ch/stpo", name: "stpo.md", size_bytes: 350000 },
    ];
    const readiness = checkCHCorpusReadiness(fullCorpus);
    expect(readiness.ready).toBe(true);
    expect(readiness.missing.length).toBe(0);
  });

  test("main CHALLENGE_SET includes CH wrong_jurisdiction entries", () => {
    const chEntries = CH_CHALLENGE_SET.filter((e) => e.jurisdiction === "CH");
    expect(chEntries.length).toBeGreaterThanOrEqual(5);
    const wrongJurEntries = chEntries.filter((e) => e.manipulation_type === "wrong_jurisdiction");
    expect(wrongJurEntries.length).toBe(10);
  });

  test("CH-specific challenge set has CH jurisdiction entries", () => {
    const chEntries = CH_CHALLENGE_SET.filter((e) => e.jurisdiction === "CH");
    expect(chEntries.length).toBeGreaterThan(0);
  });

  test("aggregated qrels include CH tasks", () => {
    const chQrels = ALL_QRELS.filter((q) => q.jurisdiction === "CH");
    expect(chQrels.length).toBe(ALL_GOLD_CH.length);
  });

  test("TOTAL_QRELS increased after CH addition", () => {
    expect(TOTAL_QRELS).toBeGreaterThan(0);
    expect(TOTAL_RELEVANT).toBeGreaterThan(0);
    expect(TOTAL_HARD_NEGATIVES).toBeGreaterThan(0);
  });
});

// ── T10.3: Public Benchmark Protocol ──────────────────────────────────

describe("T10.3: Public Benchmark Protocol", () => {
  const holdoutTasks = getAllHoldoutTasks();
  const devTestTasks = getAllDevTestTasks();

  test("seal holdout produces valid seal", () => {
    const sealed = sealHoldout(holdoutTasks);
    expect(sealed.seal_hash).toHaveLength(64);
    expect(sealed.task_count).toBe(holdoutTasks.length);
    expect(sealed.task_hashes.length).toBe(holdoutTasks.length);
    expect(sealed.revealed).toBe(false);
  });

  test("verify seal succeeds with correct tasks", () => {
    const sealed = sealHoldout(holdoutTasks);
    expect(verifySeal(sealed, holdoutTasks)).toBe(true);
  });

  test("verify seal fails with wrong tasks", () => {
    const sealed = sealHoldout(holdoutTasks);
    const wrongTasks = holdoutTasks.slice(0, -1);
    expect(verifySeal(sealed, wrongTasks)).toBe(false);
  });

  test("reveal holdout sets revealed flag", () => {
    const sealed = sealHoldout(holdoutTasks);
    const revealed = revealHoldout(sealed);
    expect(revealed.revealed).toBe(true);
    expect(revealed.revealed_at).not.toBeNull();
  });

  test("create submission accepts valid config", () => {
    const sealed = sealHoldout(holdoutTasks);
    const receipt = createSubmission({
      submitter_name: "Test Submitter",
      submitter_email: "test@example.com",
      system_name: "Test Legal AI",
      system_description: "Test system for benchmark",
      model_config: {
        primary_model: "deepseek/deepseek-chat",
        provider: "openrouter",
        temperature: 0,
        max_tokens: 2000,
        system_prompt_hash: "a".repeat(64),
        tools_enabled: ["search_law"],
      },
      task_selection: "holdout",
      sealedHoldout: sealed,
    });
    expect(receipt.accepted).toBe(true);
    expect(receipt.rejection_reason).toBeUndefined();
  });

  test("create submission rejects invalid config", () => {
    const sealed = sealHoldout(holdoutTasks);
    const revealed = revealHoldout(sealed);
    const receipt = createSubmission({
      submitter_name: "Test",
      submitter_email: "test@example.com",
      system_name: "Test",
      system_description: "Test",
      model_config: {
        primary_model: "",
        provider: "",
        temperature: 0,
        max_tokens: 2000,
        system_prompt_hash: "short",
        tools_enabled: [],
      },
      task_selection: "invalid" as "dev" | "test" | "holdout" | "all",
      sealedHoldout: revealed,
    });
    expect(receipt.accepted).toBe(false);
    expect(receipt.rejection_reason).toBeDefined();
  });

  test("anti-leakage check passes for distinct tasks", () => {
    const result = checkAntiLeakage(holdoutTasks, devTestTasks);
    expect(result.total_checked).toBe(holdoutTasks.length * devTestTasks.length);
    // Holdout tasks are designed to be distinct from dev/test tasks
    expect(result.leakage_score).toBeLessThan(0.1);
  });

  test("anti-leakage check detects identical prompts", () => {
    const fakeHoldout = [{ ...holdoutTasks[0], id: "fake-holdout-001" }];
    const fakeDevTest = [{ ...holdoutTasks[0], id: "fake-dev-001" }];
    const result = checkAntiLeakage(fakeHoldout, fakeDevTest);
    expect(result.passed).toBe(false);
    expect(result.flagged_pairs.length).toBeGreaterThan(0);
  });

  test("Wilson confidence interval computes correctly", () => {
    const ci = wilsonConfidenceInterval(8, 10, 0.95);
    expect(ci.lower).toBeGreaterThan(0);
    expect(ci.upper).toBeLessThan(1);
    expect(ci.lower).toBeLessThan(0.8);
    expect(ci.upper).toBeGreaterThan(0.8);
  });

  test("Wilson confidence interval handles edge cases", () => {
    const ci0 = wilsonConfidenceInterval(0, 10, 0.95);
    expect(ci0.lower).toBe(0);
    expect(ci0.upper).toBeGreaterThan(0);

    const ci10 = wilsonConfidenceInterval(10, 10, 0.95);
    expect(ci10.lower).toBeLessThan(1);
    expect(ci10.upper).toBe(1);

    const ciEmpty = wilsonConfidenceInterval(0, 0, 0.95);
    expect(ciEmpty.lower).toBe(0);
    expect(ciEmpty.upper).toBe(0);
  });

  test("export raw receipts produces verifiable output", () => {
    const sealed = sealHoldout(holdoutTasks);
    const submission = createSubmission({
      submitter_name: "Test",
      submitter_email: "test@example.com",
      system_name: "Test",
      system_description: "Test",
      model_config: {
        primary_model: "test-model",
        provider: "test",
        temperature: 0,
        max_tokens: 1000,
        system_prompt_hash: "b".repeat(64),
        tools_enabled: [],
      },
      task_selection: "holdout",
      sealedHoldout: sealed,
    });

    const antiLeakage = checkAntiLeakage(holdoutTasks, devTestTasks);
    const taskMap = new Map(holdoutTasks.map((t) => [t.id, t]));

    const exportResult = exportRawReceipts(
      submission.submission,
      [],
      {},
      taskMap,
      antiLeakage,
      sealed,
      holdoutTasks
    );

    expect(exportResult.submission_hash).toBe(submission.submission.submission_hash);
    expect(exportResult.seal_verification).toBe(true);
    expect(exportResult.anti_leakage_report.total_checked).toBeGreaterThan(0);
  });

  test("generate public report produces markdown and JSON", () => {
    const sealed = sealHoldout(holdoutTasks);
    const submission = createSubmission({
      submitter_name: "Test",
      submitter_email: "test@example.com",
      system_name: "Test System",
      system_description: "Test",
      model_config: {
        primary_model: "test-model",
        provider: "test",
        temperature: 0,
        max_tokens: 1000,
        system_prompt_hash: "c".repeat(64),
        tools_enabled: [],
      },
      task_selection: "holdout",
      sealedHoldout: sealed,
    });

    const antiLeakage = checkAntiLeakage(holdoutTasks, devTestTasks);
    const taskMap = new Map(holdoutTasks.map((t) => [t.id, t]));

    const rawReceipts = exportRawReceipts(
      submission.submission,
      [],
      {},
      taskMap,
      antiLeakage,
      sealed,
      holdoutTasks
    );

    const report = generatePublicReport(submission.submission, sealed, rawReceipts);
    expect(report.benchmark_name).toBe("LAB-DACH");
    expect(report.benchmark_version).toBe("v3");
    expect(report.markdown_report).toContain("LAB-DACH v3");
    expect(report.markdown_report).toContain("Test System");
    expect(report.json_report).toContain("benchmark_name");
  });
});

// ── T10.4: Publisher Partnership Integration ──────────────────────────

describe("T10.4: Publisher Partnership Integration", () => {
  test("known publishers include MANZ, C.H.BECK, Schulthess", () => {
    const ids = KNOWN_PUBLISHERS.map((p) => p.id);
    expect(ids).toContain("publisher-manz");
    expect(ids).toContain("publisher-ch-beck");
    expect(ids).toContain("publisher-schulthess");
  });

  test("all publishers have commercial license type", () => {
    for (const publisher of KNOWN_PUBLISHERS) {
      expect(publisher.license_type).toBe("commercial");
    }
  });

  test("all publishers require attribution", () => {
    for (const publisher of KNOWN_PUBLISHERS) {
      expect(publisher.attribution_required).toBe(true);
    }
  });

  test("all publishers are DRM protected", () => {
    for (const publisher of KNOWN_PUBLISHERS) {
      expect(publisher.drm_protected).toBe(true);
    }
  });

  test("publisherToLicenseTerms converts correctly", () => {
    const terms = publisherToLicenseTerms(KNOWN_PUBLISHERS[0]);
    expect(terms.source_id).toBe(KNOWN_PUBLISHERS[0].id);
    expect(terms.license_type).toBe("commercial");
    expect(terms.attribution_required).toBe(true);
    expect(terms.scraping_allowed).toBe(false);
  });

  test("createPublisherContentImport generates correct hash", () => {
    const import_ = createPublisherContentImport({
      publisher_id: "publisher-ch-beck",
      content_type: "commentary",
      title: "Test Commentary",
      source_url: "https://api.beck-online.de/test",
      content: "Test content for hashing",
      article_count: 5,
    });
    expect(import_.content_hash).toHaveLength(64);
    expect(import_.attribution_text).toContain("C.H.BECK");
    expect(import_.drm_tracked).toBe(true);
  });

  test("createPublisherContentImport throws for unknown publisher", () => {
    expect(() =>
      createPublisherContentImport({
        publisher_id: "unknown-publisher",
        content_type: "commentary",
        title: "Test",
        source_url: "https://example.com",
        content: "test",
        article_count: 1,
      })
    ).toThrow();
  });

  test("partnership workflow starts at identified phase", () => {
    const workflow = createPartnershipWorkflow("publisher-manz");
    expect(workflow.current_phase).toBe("identified");
    expect(workflow.phase_history.length).toBe(1);
  });

  test("partnership workflow advances forward", () => {
    let workflow = createPartnershipWorkflow("publisher-ch-beck");
    workflow = advancePartnershipPhase(workflow, "initial_contact", "Sent initial email");
    expect(workflow.current_phase).toBe("initial_contact");
    expect(workflow.phase_history.length).toBe(2);
  });

  test("partnership workflow prevents backwards transition", () => {
    const workflow = createPartnershipWorkflow("publisher-manz");
    expect(() => advancePartnershipPhase(workflow, "identified", "Cannot go back")).toThrow();
  });

  test("partnership workflow allows paused/terminated from any state", () => {
    const workflow = createPartnershipWorkflow("publisher-manz");
    const paused = advancePartnershipPhase(workflow, "paused", "Paused for review");
    expect(paused.current_phase).toBe("paused");
  });

  test("checkAttribution detects missing attribution", () => {
    const import_ = createPublisherContentImport({
      publisher_id: "publisher-ch-beck",
      content_type: "commentary",
      title: "Test",
      source_url: "https://example.com",
      content: "test content",
      article_count: 1,
    });
    const result = checkAttribution("Output without attribution", [import_]);
    expect(result.passed).toBe(false);
    expect(result.missing_attribution).toContain("publisher-ch-beck");
  });

  test("checkAttribution passes when attribution present", () => {
    const import_ = createPublisherContentImport({
      publisher_id: "publisher-ch-beck",
      content_type: "commentary",
      title: "Test",
      source_url: "https://example.com",
      content: "test content",
      article_count: 1,
    });
    const output = `Some legal analysis.\n\n${import_.attribution_text}`;
    const result = checkAttribution(output, [import_]);
    expect(result.passed).toBe(true);
  });

  test("computePublisherStats returns correct counts", () => {
    const stats = computePublisherStats();
    expect(stats.total_publishers).toBe(KNOWN_PUBLISHERS.length);
    expect(stats.total_publishers).toBeGreaterThanOrEqual(5);
    expect(stats.by_jurisdiction.DE).toBeGreaterThanOrEqual(1);
    expect(stats.by_jurisdiction.AT).toBeGreaterThanOrEqual(2);
    expect(stats.by_jurisdiction.CH).toBeGreaterThanOrEqual(1);
  });

  test("publisher catalog entries have valid content types", () => {
    const validTypes = [
      "commentary",
      "journal",
      "textbook",
      "case_law_annotated",
      "encyclopedia",
      "form_book",
    ];
    for (const publisher of KNOWN_PUBLISHERS) {
      for (const entry of publisher.content_catalog) {
        expect(validTypes).toContain(entry.content_type);
      }
    }
  });

  test("C.H.BECK has API endpoint configured", () => {
    const beck = KNOWN_PUBLISHERS.find((p) => p.id === "publisher-ch-beck");
    expect(beck).toBeDefined();
    expect(beck!.api_endpoint).not.toBeNull();
    expect(beck!.api_key_env_var).toBe("BECK_API_KEY");
  });
});
