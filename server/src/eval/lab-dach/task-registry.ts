/**
 * LAB-DACH v3 — Task Registry & Scaling Infrastructure (T10.1)
 *
 * Provides batch import, split management, and scaling validation for
 * scaling the gold task set from 25 → 100 → 300 → 500 tasks.
 *
 * Features:
 *   - Batch import with deduplication and ID collision detection
 *   - Split management (dev / test / holdout) with ratio enforcement
 *   - Coverage matrix: jurisdiction × legal_area × workflow × difficulty
 *   - Jurist time budgeting (realistic estimates per task)
 *   - Scaling gates: false-pass, gold-error, leakage checks before scaling
 */

import type {
  Task,
  Jurisdiction,
  LegalArea,
  WorkflowType,
  DifficultyLevel,
  SplitType,
} from "./types.ts";
import { validateGoldTask, validateTask } from "./types.ts";

// ── Coverage Matrix ───────────────────────────────────────────────────

export interface CoverageCell {
  jurisdiction: Jurisdiction;
  legal_area: LegalArea;
  count: number;
  by_difficulty: Record<DifficultyLevel, number>;
  by_workflow: Record<WorkflowType, number>;
  by_split: Record<SplitType, number>;
}

export interface CoverageMatrix {
  total: number;
  by_jurisdiction: Record<Jurisdiction, number>;
  by_legal_area: Record<LegalArea, number>;
  by_workflow: Record<WorkflowType, number>;
  by_difficulty: Record<DifficultyLevel, number>;
  by_split: Record<SplitType, number>;
  cells: CoverageCell[];
  gaps: CoverageGap[];
}

export interface CoverageGap {
  jurisdiction: Jurisdiction;
  legal_area: LegalArea;
  current: number;
  target: number;
  deficit: number;
}

// ── Scaling Targets ───────────────────────────────────────────────────

export interface ScalingTarget {
  total_tasks: number;
  split_ratios: { dev: number; test: number; holdout: number };
  min_per_jurisdiction: Record<Jurisdiction, number>;
  min_per_legal_area: Record<LegalArea, number>;
  min_per_workflow: Record<WorkflowType, number>;
  difficulty_distribution: Record<DifficultyLevel, number>;
}

export const SCALING_TARGETS: Record<"phase1_100" | "phase2_300" | "phase3_500", ScalingTarget> = {
  phase1_100: {
    total_tasks: 100,
    split_ratios: { dev: 0.15, test: 0.65, holdout: 0.2 },
    min_per_jurisdiction: { DE: 40, AT: 30, CH: 20, EU: 10 },
    min_per_legal_area: {
      litigation: 25,
      corporate_m_and_a: 10,
      employment: 10,
      real_estate: 10,
      tax: 10,
      criminal: 15,
      family: 10,
      inheritance: 10,
    },
    min_per_workflow: {
      rechtsfrage_memorandum: 40,
      gerichtsakt_fristen: 30,
      schriftsatz_entwurf: 30,
    },
    difficulty_distribution: { beginner: 0.2, normal: 0.5, power_user: 0.3 },
  },
  phase2_300: {
    total_tasks: 300,
    split_ratios: { dev: 0.1, test: 0.7, holdout: 0.2 },
    min_per_jurisdiction: { DE: 120, AT: 90, CH: 60, EU: 30 },
    min_per_legal_area: {
      litigation: 60,
      corporate_m_and_a: 30,
      employment: 30,
      real_estate: 30,
      tax: 30,
      criminal: 50,
      family: 35,
      inheritance: 35,
    },
    min_per_workflow: {
      rechtsfrage_memorandum: 120,
      gerichtsakt_fristen: 90,
      schriftsatz_entwurf: 90,
    },
    difficulty_distribution: { beginner: 0.15, normal: 0.5, power_user: 0.35 },
  },
  phase3_500: {
    total_tasks: 500,
    split_ratios: { dev: 0.08, test: 0.72, holdout: 0.2 },
    min_per_jurisdiction: { DE: 200, AT: 150, CH: 100, EU: 50 },
    min_per_legal_area: {
      litigation: 90,
      corporate_m_and_a: 50,
      employment: 50,
      real_estate: 50,
      tax: 50,
      criminal: 80,
      family: 60,
      inheritance: 70,
    },
    min_per_workflow: {
      rechtsfrage_memorandum: 200,
      gerichtsakt_fristen: 150,
      schriftsatz_entwurf: 150,
    },
    difficulty_distribution: { beginner: 0.12, normal: 0.48, power_user: 0.4 },
  },
};

// ── Jurist Time Budget ────────────────────────────────────────────────

export interface JuristTimeEstimate {
  task_creation_minutes: number;
  review_minutes: number;
  revision_minutes: number;
  total_minutes: number;
}

export function estimateJuristTime(task: Task): JuristTimeEstimate {
  const baseCreation = 45;
  const baseReview = 30;
  const baseRevision = 15;

  const criteriaComplexity = task.criteria.length * 3;
  const hasReferenceOutput = task.reference_output ? (task.reference_output.length / 100) * 2 : 0;
  const hasQrels = task.qrels ? 10 : 0;
  const hasCaseFacts = task.case_facts ? 5 : 0;
  const difficultyMultiplier =
    task.difficulty === "beginner" ? 0.8 : task.difficulty === "normal" ? 1.0 : 1.4;

  const creation = Math.round(
    (baseCreation + criteriaComplexity + hasReferenceOutput + hasQrels + hasCaseFacts) *
      difficultyMultiplier
  );
  const review = Math.round(baseReview * difficultyMultiplier);
  const revision = Math.round(baseRevision * difficultyMultiplier);

  return {
    task_creation_minutes: creation,
    review_minutes: review,
    revision_minutes: revision,
    total_minutes: creation + review + revision,
  };
}

export interface BatchTimeBudget {
  total_minutes: number;
  total_hours: number;
  total_days_full_time: number;
  per_jurist_days: number;
  recommended_jurists: number;
  estimated_cost_eur: number;
}

export function computeBatchTimeBudget(
  tasks: Task[],
  opts?: { jurists?: number; hourlyRateEur?: number; hoursPerDay?: number }
): BatchTimeBudget {
  const jurists = opts?.jurists ?? 2;
  const hourlyRate = opts?.hourlyRateEur ?? 120;
  const hoursPerDay = opts?.hoursPerDay ?? 7;

  let totalMinutes = 0;
  for (const task of tasks) {
    const est = estimateJuristTime(task);
    totalMinutes += est.total_minutes;
  }

  const totalHours = totalMinutes / 60;
  const totalDays = totalHours / hoursPerDay;
  const perJuristDays = totalDays / jurists;
  const cost = totalHours * hourlyRate;

  return {
    total_minutes: totalMinutes,
    total_hours: Math.round(totalHours * 10) / 10,
    total_days_full_time: Math.round(totalDays * 10) / 10,
    per_jurist_days: Math.round(perJuristDays * 10) / 10,
    recommended_jurists: jurists,
    estimated_cost_eur: Math.round(cost),
  };
}

// ── Batch Import ──────────────────────────────────────────────────────

export interface BatchImportResult {
  imported: number;
  skipped_duplicates: number;
  errors: BatchImportError[];
  task_ids: string[];
}

export interface BatchImportError {
  task_id: string;
  errors: string[];
}

export function batchImportTasks(
  newTasks: Task[],
  existingTasks: Task[],
  opts?: { requireGold?: boolean }
): BatchImportResult {
  const existingIds = new Set(existingTasks.map((t) => t.id));
  const seenIds = new Set<string>();
  const imported: Task[] = [];
  const skippedDuplicates: string[] = [];
  const errors: BatchImportError[] = [];
  const taskIds: string[] = [];

  for (const task of newTasks) {
    if (existingIds.has(task.id) || seenIds.has(task.id)) {
      skippedDuplicates.push(task.id);
      continue;
    }

    const validationErrors = opts?.requireGold ? validateGoldTask(task) : validateTask(task);

    if (validationErrors.length > 0) {
      errors.push({
        task_id: task.id,
        errors: validationErrors.map((e) => `[${e.field}] ${e.message}`),
      });
      continue;
    }

    seenIds.add(task.id);
    imported.push(task);
    taskIds.push(task.id);
  }

  return {
    imported: imported.length,
    skipped_duplicates: skippedDuplicates.length,
    errors,
    task_ids: taskIds,
  };
}

// ── Split Management ──────────────────────────────────────────────────

export interface SplitAssignment {
  task_id: string;
  assigned_split: SplitType;
  previous_split?: SplitType;
  reason: string;
}

export function assignSplits(tasks: Task[], target: ScalingTarget): SplitAssignment[] {
  const assignments: SplitAssignment[] = [];
  const total = tasks.length;

  if (total === 0) return assignments;

  const devCount = Math.round(total * target.split_ratios.dev);
  const holdoutCount = Math.round(total * target.split_ratios.holdout);
  const testCount = total - devCount - holdoutCount;

  const shuffled = [...tasks].sort((a, b) => {
    if (a.split !== b.split) {
      const order: Record<SplitType, number> = { dev: 0, test: 1, holdout: 2 };
      return order[a.split] - order[b.split];
    }
    return a.id.localeCompare(b.id);
  });

  let devAssigned = 0;
  let testAssigned = 0;
  let holdoutAssigned = 0;

  for (const task of shuffled) {
    let assignedSplit: SplitType;

    if (task.split === "holdout" && holdoutAssigned < holdoutCount) {
      assignedSplit = "holdout";
      holdoutAssigned++;
    } else if (task.split === "dev" && devAssigned < devCount) {
      assignedSplit = "dev";
      devAssigned++;
    } else if (testAssigned < testCount) {
      assignedSplit = "test";
      testAssigned++;
    } else if (devAssigned < devCount) {
      assignedSplit = "dev";
      devAssigned++;
    } else {
      assignedSplit = "holdout";
      holdoutAssigned++;
    }

    assignments.push({
      task_id: task.id,
      assigned_split: assignedSplit,
      previous_split: task.split !== assignedSplit ? task.split : undefined,
      reason:
        task.split === assignedSplit
          ? "Kept existing split"
          : `Reassigned from ${task.split} to ${assignedSplit} to meet target ratios`,
    });
  }

  return assignments;
}

// ── Coverage Matrix Computation ───────────────────────────────────────

export function computeCoverageMatrix(tasks: Task[], target?: ScalingTarget): CoverageMatrix {
  const byJurisdiction: Record<string, number> = {};
  const byLegalArea: Record<string, number> = {};
  const byWorkflow: Record<string, number> = {};
  const byDifficulty: Record<string, number> = {};
  const bySplit: Record<string, number> = {};

  const cellMap = new Map<string, CoverageCell>();

  for (const task of tasks) {
    byJurisdiction[task.jurisdiction] = (byJurisdiction[task.jurisdiction] ?? 0) + 1;
    byLegalArea[task.legal_area] = (byLegalArea[task.legal_area] ?? 0) + 1;
    byWorkflow[task.workflow] = (byWorkflow[task.workflow] ?? 0) + 1;
    byDifficulty[task.difficulty] = (byDifficulty[task.difficulty] ?? 0) + 1;
    bySplit[task.split] = (bySplit[task.split] ?? 0) + 1;

    const cellKey = `${task.jurisdiction}:${task.legal_area}`;
    if (!cellMap.has(cellKey)) {
      cellMap.set(cellKey, {
        jurisdiction: task.jurisdiction,
        legal_area: task.legal_area,
        count: 0,
        by_difficulty: { beginner: 0, normal: 0, power_user: 0 },
        by_workflow: { rechtsfrage_memorandum: 0, gerichtsakt_fristen: 0, schriftsatz_entwurf: 0 },
        by_split: { dev: 0, test: 0, holdout: 0 },
      });
    }
    const cell = cellMap.get(cellKey)!;
    cell.count++;
    cell.by_difficulty[task.difficulty]++;
    cell.by_workflow[task.workflow]++;
    cell.by_split[task.split]++;
  }

  const gaps: CoverageGap[] = [];
  if (target) {
    for (const [jurisStr, minCount] of Object.entries(target.min_per_jurisdiction)) {
      const jurisdiction = jurisStr as Jurisdiction;
      const current = byJurisdiction[jurisdiction] ?? 0;
      if (current < minCount) {
        gaps.push({
          jurisdiction,
          legal_area: "all" as LegalArea,
          current,
          target: minCount,
          deficit: minCount - current,
        });
      }
    }
    for (const [areaStr, minCount] of Object.entries(target.min_per_legal_area)) {
      const legalArea = areaStr as LegalArea;
      const current = byLegalArea[legalArea] ?? 0;
      if (current < minCount) {
        gaps.push({
          jurisdiction: "all" as Jurisdiction,
          legal_area: legalArea,
          current,
          target: minCount,
          deficit: minCount - current,
        });
      }
    }
  }

  return {
    total: tasks.length,
    by_jurisdiction: byJurisdiction as Record<Jurisdiction, number>,
    by_legal_area: byLegalArea as Record<LegalArea, number>,
    by_workflow: byWorkflow as Record<WorkflowType, number>,
    by_difficulty: byDifficulty as Record<DifficultyLevel, number>,
    by_split: bySplit as Record<SplitType, number>,
    cells: [...cellMap.values()],
    gaps,
  };
}

// ── Scaling Gates ─────────────────────────────────────────────────────

export interface ScalingGateResult {
  gate: string;
  passed: boolean;
  details: string;
  metrics?: Record<string, number>;
}

export interface ScalingGateReport {
  can_scale: boolean;
  gates: ScalingGateResult[];
  blocking_gates: string[];
  current_task_count: number;
  target_phase: string;
  target_task_count: number;
  estimated_jurist_time?: BatchTimeBudget;
}

export function checkScalingGates(
  currentTasks: Task[],
  target: ScalingTarget,
  targetPhase: string,
  opts?: {
    falsePassRate?: number;
    falsePassThreshold?: number;
    goldErrorRate?: number;
    goldErrorThreshold?: number;
    leakageScore?: number;
    leakageThreshold?: number;
    judgeKappa?: number;
    judgeKappaThreshold?: number;
    jurists?: number;
  }
): ScalingGateReport {
  const gates: ScalingGateResult[] = [];
  const falsePassThreshold = opts?.falsePassThreshold ?? 0.05;
  const goldErrorThreshold = opts?.goldErrorThreshold ?? 0.02;
  const leakageThreshold = opts?.leakageThreshold ?? 0.01;
  const judgeKappaThreshold = opts?.judgeKappaThreshold ?? 0.7;

  // Gate 1: False-Pass-Rate
  if (opts?.falsePassRate !== undefined) {
    gates.push({
      gate: "false_pass_rate",
      passed: opts.falsePassRate <= falsePassThreshold,
      details: `False-pass-rate: ${(opts.falsePassRate * 100).toFixed(1)}% (threshold: ${(falsePassThreshold * 100).toFixed(1)}%)`,
      metrics: { false_pass_rate: opts.falsePassRate, threshold: falsePassThreshold },
    });
  } else {
    gates.push({
      gate: "false_pass_rate",
      passed: false,
      details: "False-pass-rate not yet measured — run judge vs human comparison first",
    });
  }

  // Gate 2: Gold-Error-Rate
  if (opts?.goldErrorRate !== undefined) {
    gates.push({
      gate: "gold_error_rate",
      passed: opts.goldErrorRate <= goldErrorThreshold,
      details: `Gold-error-rate: ${(opts.goldErrorRate * 100).toFixed(1)}% (threshold: ${(goldErrorThreshold * 100).toFixed(1)}%)`,
      metrics: { gold_error_rate: opts.goldErrorRate, threshold: goldErrorThreshold },
    });
  } else {
    gates.push({
      gate: "gold_error_rate",
      passed: false,
      details: "Gold-error-rate not yet measured — run gold task audit first",
    });
  }

  // Gate 3: Leakage
  if (opts?.leakageScore !== undefined) {
    gates.push({
      gate: "leakage",
      passed: opts.leakageScore <= leakageThreshold,
      details: `Leakage score: ${(opts.leakageScore * 100).toFixed(1)}% (threshold: ${(leakageThreshold * 100).toFixed(1)}%)`,
      metrics: { leakage_score: opts.leakageScore, threshold: leakageThreshold },
    });
  } else {
    gates.push({
      gate: "leakage",
      passed: false,
      details: "Leakage score not yet measured — run anti-leakage check first",
    });
  }

  // Gate 4: Judge-Human Agreement (Cohen's Kappa)
  if (opts?.judgeKappa !== undefined) {
    gates.push({
      gate: "judge_kappa",
      passed: opts.judgeKappa >= judgeKappaThreshold,
      details: `Cohen's Kappa: ${opts.judgeKappa.toFixed(3)} (threshold: ${judgeKappaThreshold})`,
      metrics: { kappa: opts.judgeKappa, threshold: judgeKappaThreshold },
    });
  } else {
    gates.push({
      gate: "judge_kappa",
      passed: false,
      details: "Judge-human agreement not yet measured — run cross-validation first",
    });
  }

  // Gate 5: Current task count
  const currentCount = currentTasks.length;
  const needCount = target.total_tasks - currentCount;
  gates.push({
    gate: "task_count",
    passed: needCount > 0,
    details: `Current: ${currentCount}, Target: ${target.total_tasks}, Need: ${Math.max(0, needCount)} more tasks`,
    metrics: { current: currentCount, target: target.total_tasks, needed: Math.max(0, needCount) },
  });

  const blockingGates = gates.filter((g) => !g.passed).map((g) => g.gate);
  const canScale = blockingGates.length === 0;

  let estimatedTime: BatchTimeBudget | undefined;
  if (canScale && needCount > 0) {
    const placeholderTasks: Task[] = Array.from({ length: needCount }, (_, i) => ({
      id: `placeholder-${i}`,
      title: "Placeholder",
      jurisdiction: "DE",
      legal_area: "litigation",
      workflow: "rechtsfrage_memorandum",
      difficulty: "normal",
      split: "test",
      prompt: "placeholder",
      deliverables: [],
      criteria: [],
    }));
    estimatedTime = computeBatchTimeBudget(placeholderTasks, { jurists: opts?.jurists });
  }

  return {
    can_scale: canScale,
    gates,
    blocking_gates: blockingGates,
    current_task_count: currentCount,
    target_phase: targetPhase,
    target_task_count: target.total_tasks,
    estimated_jurist_time: estimatedTime,
  };
}

// ── Task Template Generator ───────────────────────────────────────────

export interface TaskTemplate {
  jurisdiction: Jurisdiction;
  legal_area: LegalArea;
  workflow: WorkflowType;
  difficulty: DifficultyLevel;
  prompt_hint: string;
  expected_laws_hint: string[];
  expected_paragraphs_hint: string[];
  criteria_template: "standard_10" | "fristen_10" | "schriftsatz_10";
}

export const TASK_TEMPLATES: TaskTemplate[] = [
  {
    jurisdiction: "DE",
    legal_area: "litigation",
    workflow: "rechtsfrage_memorandum",
    difficulty: "normal",
    prompt_hint: "BGB-Kaufrecht: Mangel, Gewährleistung, Rücktritt",
    expected_laws_hint: ["BGB"],
    expected_paragraphs_hint: ["434", "437"],
    criteria_template: "standard_10",
  },
  {
    jurisdiction: "DE",
    legal_area: "criminal",
    workflow: "rechtsfrage_memorandum",
    difficulty: "normal",
    prompt_hint: "StGB: Tatbestandsprüfung, Vorsatz, Rechtfertigung",
    expected_laws_hint: ["StGB"],
    expected_paragraphs_hint: [],
    criteria_template: "standard_10",
  },
  {
    jurisdiction: "AT",
    legal_area: "litigation",
    workflow: "gerichtsakt_fristen",
    difficulty: "normal",
    prompt_hint: "ZPO: Fristberechnung, Berufung, Klagebeantwortung",
    expected_laws_hint: ["ZPO"],
    expected_paragraphs_hint: [],
    criteria_template: "fristen_10",
  },
  {
    jurisdiction: "AT",
    legal_area: "litigation",
    workflow: "schriftsatz_entwurf",
    difficulty: "normal",
    prompt_hint: "ZPO: Klagebeantwortung, Schriftsatzentwurf",
    expected_laws_hint: ["ZPO"],
    expected_paragraphs_hint: [],
    criteria_template: "schriftsatz_10",
  },
  {
    jurisdiction: "CH",
    legal_area: "litigation",
    workflow: "rechtsfrage_memorandum",
    difficulty: "normal",
    prompt_hint: "OR: Vertragsrecht, Schadenersatz, Gewährleistung",
    expected_laws_hint: ["OR"],
    expected_paragraphs_hint: [],
    criteria_template: "standard_10",
  },
  {
    jurisdiction: "CH",
    legal_area: "criminal",
    workflow: "rechtsfrage_memorandum",
    difficulty: "normal",
    prompt_hint: "StGB: Tatbestandsprüfung nach Schweizer Strafgesetzbuch",
    expected_laws_hint: ["StGB"],
    expected_paragraphs_hint: [],
    criteria_template: "standard_10",
  },
];

export function generateTaskId(
  jurisdiction: Jurisdiction,
  legalArea: LegalArea,
  existingIds: Set<string>
): string {
  const prefix = `gold-${jurisdiction.toLowerCase()}-${legalArea === "criminal" ? "crim" : "lit"}-`;
  let num = 1;
  while (existingIds.has(`${prefix}${String(num).padStart(3, "0")}`)) {
    num++;
  }
  return `${prefix}${String(num).padStart(3, "0")}`;
}
