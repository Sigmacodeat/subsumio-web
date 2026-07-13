/**
 * LAB-DACH v3 — Task Schema, Types & Validator
 *
 * Core types for the DACH Legal Agent Benchmark:
 *   - Task: A legal problem the agent must solve
 *   - Criterion: An atomic pass/fail check (automated or LLM-judged)
 *   - Deliverable: Expected output artifact
 *   - RubricResult: Per-criterion evaluation result
 *   - RunReceipt: Full provenance for a single task run
 *
 * Validation rules (from plan):
 *   - min 8 criteria per task
 *   - min 1 automated criterion
 *   - min 3 llm_judge criteria
 *   - min 2 critical criteria (or 2 required+high severity)
 *   - Gold tasks: as_of_date, official_sources, reference_output, reviewer
 */

import type { Jurisdiction } from "../../core/legal/corpus-receipt.ts";
export type { Jurisdiction };
import type { VerificationState } from "../../core/verification/states.ts";

// ── Workflow Types ────────────────────────────────────────────────────

export type WorkflowType =
  | "rechtsfrage_memorandum" // Workflow 1: Rechtsfrage → Kurzmemorandum
  | "gerichtsakt_fristen" // Workflow 2: Gerichtsakt → Fristen/Risiken
  | "schriftsatz_entwurf"; // Workflow 3: Schriftsatzentwurf

export type DifficultyLevel = "beginner" | "normal" | "power_user";

export type LegalArea =
  | "litigation"
  | "corporate_m_and_a"
  | "employment"
  | "real_estate"
  | "tax"
  | "criminal"
  | "family"
  | "inheritance";

export type SplitType = "dev" | "test" | "holdout";

// ── Criterion Types ───────────────────────────────────────────────────

export type CheckType = "automated" | "llm_judge";

/**
 * Judge verdict status — unified across all agent candidates.
 * The judge never learns which agent model produced the output.
 *
 * - pass: Criterion is clearly satisfied
 * - fail: Criterion is clearly NOT satisfied
 * - uncertain: Judge cannot determine with confidence (borderline)
 * - not_judgeable: Output is too short/empty/garbled to evaluate
 * - judge_error: Judge LLM call failed or response was unparseable (fail-closed)
 */
export type JudgeStatus = "pass" | "fail" | "uncertain" | "not_judgeable" | "judge_error";

/**
 * Severity level for a criterion — the impact if this criterion fails.
 * Modeled separately from `required` (which controls pass/fail logic)
 * and `critical` (legacy boolean, equivalent to required + high severity).
 */
export type CriterionSeverity = "low" | "medium" | "high" | "critical";

/**
 * Automated check identifiers — each maps to a deterministic checker
 * in automated-checks.ts.
 */
export type AutomatedCheckId =
  | "citation_grounded_v2"
  | "law_valid"
  | "substantiated_uncertainty"
  | "language_german"
  | "min_citations"
  | "jurisdiction_correct"
  | "source_provenance";

export interface Criterion {
  /** Unique ID within the task (e.g. "crit-001") */
  id: string;
  /** Human-readable description of what is checked */
  description: string;
  /** Type of check: automated (deterministic) or llm_judge (semantic) */
  check_type: CheckType;
  /** Whether this is a critical criterion (failure = overall fail). Legacy boolean. */
  critical: boolean;
  /** Whether this criterion MUST pass for the task to pass (stricter than critical) */
  required?: boolean;
  /** Severity level if this criterion fails (default: derived from critical) */
  severity?: CriterionSeverity;
  /** For automated checks: which checker to run */
  automated_check?: AutomatedCheckId;
  /** For llm_judge: the rubric question the judge must answer */
  judge_question?: string;
  /** For llm_judge: expected answer or pattern (optional guidance) */
  expected_answer?: string;
  /** Weight for scoring (default 1.0) */
  weight?: number;
  /** Optional: parameters for automated checks (e.g. min citation count) */
  params?: Record<string, unknown>;
}

/**
 * Resolve the effective severity of a criterion.
 * If `severity` is explicitly set, use it. Otherwise derive from `critical`.
 */
export function getCriterionSeverity(c: Criterion): CriterionSeverity {
  if (c.severity) return c.severity;
  return c.critical ? "high" : "medium";
}

/**
 * Check if a criterion is required (must pass for task to pass).
 * `required` takes precedence; falls back to `critical`.
 */
export function isCriterionRequired(c: Criterion): boolean {
  return c.required ?? c.critical;
}

// ── Deliverable Types ─────────────────────────────────────────────────

export type DeliverableType =
  | "memo" // Kurzmemorandum (Workflow 1)
  | "fristen_report" // Fristen/Risiken-Bericht (Workflow 2)
  | "schriftsatz" // Schriftsatzentwurf (Workflow 3)
  | "analysis" // Rechtliche Analyse
  | "summary"; // Zusammenfassung

export interface Deliverable {
  /** Type of deliverable */
  type: DeliverableType;
  /** Expected filename (e.g. "memo.md") */
  filename: string;
  /** Description of what should be in this deliverable */
  description: string;
  /** Minimum length in characters (optional) */
  min_length?: number;
  /** Maximum length in characters (optional) */
  max_length?: number;
  /** Required sections (optional, for structured documents) */
  required_sections?: string[];
}

// ── Task Definition ───────────────────────────────────────────────────

export interface Task {
  /** Unique task ID (e.g. "lab-dach-de-001") */
  id: string;
  /** Task title */
  title: string;
  /** Jurisdiction: DE or AT (CH not yet supported) */
  jurisdiction: Jurisdiction;
  /** Legal area */
  legal_area: LegalArea;
  /** Workflow type */
  workflow: WorkflowType;
  /** Difficulty level */
  difficulty: DifficultyLevel;
  /** Split: dev, test, or holdout */
  split: SplitType;
  /** Task prompt — the legal problem the agent must solve */
  prompt: string;
  /** Case facts / scenario (optional, for document-based tasks) */
  case_facts?: string;
  /** Input documents (paths relative to task directory) */
  input_documents?: string[];
  /** Expected deliverables */
  deliverables: Deliverable[];
  /** Evaluation criteria (min 8, min 1 automated, min 3 llm_judge, min 2 critical) */
  criteria: Criterion[];
  /** Expected laws that should be cited (for automated checking) */
  expected_laws?: string[];
  /** Expected § numbers that should be cited (for automated checking) */
  expected_paragraphs?: string[];
  /** Minimum number of citations required */
  min_citations?: number;
  /** Time limit in seconds (default 300 = 5 min) */
  time_limit_seconds?: number;
  /** Model to use for this task (optional override) */
  model_override?: string;
  /** Judge model to use (optional override) */
  judge_model_override?: string;
  /** Created by (jurist name) */
  created_by?: string;
  /** Creation date */
  created_at?: string;
  /** Last modified date */
  updated_at?: string;
  /** Review status */
  review_status?: "draft" | "reviewed" | "approved";
  /** Reviewer (for approved tasks) */
  reviewed_by?: string;

  // ── Goldtask Metadata ────────────────────────────────────────────────

  /** ISO date as of which the legal content is assessed (e.g. "2026-07-13") */
  as_of_date?: string;
  /** Official sources for the legal content (gesetze-im-internet.de, RIS, etc.) */
  official_sources?: OfficialSource[];
  /** Reference output written by a legal expert (gold answer) */
  reference_output?: string;
  /** Reviewer metadata (name, role, date) */
  reviewer?: ReviewerInfo;
  /** Retrieval qrels for this task (relevant + hard negative sources) */
  qrels?: TaskQrels;
}

// ── Goldtask Support Types ─────────────────────────────────────────────

export interface OfficialSource {
  /** Official URL (gesetze-im-internet.de, RIS, fedlex, EUR-Lex) */
  url: string;
  /** Human-readable description (e.g. "BGB § 437") */
  description: string;
  /** ISO date when this source was last verified */
  verified_at?: string;
}

export interface ReviewerInfo {
  /** Full name of the reviewer */
  name: string;
  /** Professional role (e.g. "Rechtsanwalt", "Richter", "Jurist") */
  role: string;
  /** ISO timestamp of the review */
  reviewed_at: string;
}

export interface TaskQrels {
  /** Relevant source slugs (positive qrels) with relevance grade 0-3 */
  relevant: QrelEntry[];
  /** Hard negative source slugs (topically similar but wrong) */
  hard_negatives: QrelEntry[];
}

export interface QrelEntry {
  /** Source slug (e.g. "law/de/bgb/§-437") */
  slug: string;
  /** Relevance grade: 3=perfect, 2=highly relevant, 1=peripherally relevant, 0=not relevant */
  grade: number;
  /** Why this source is relevant or a hard negative */
  reason?: string;
}

// ── Evaluation Result Types ───────────────────────────────────────────

export interface CriterionResult {
  /** Criterion ID */
  criterion_id: string;
  /** Whether the criterion passed (derived from judge_status: pass → true, all else → false) */
  passed: boolean;
  /** Detailed explanation of the result */
  details: string;
  /** Whether this was a critical criterion */
  critical: boolean;
  /** Score (0-1, default 1.0 for pass, 0.0 for fail) */
  score: number;
  /** For automated checks: which checker was run */
  automated_check?: AutomatedCheckId;
  /** For llm_judge: the judge's raw response */
  judge_raw_response?: string;
  /** Confidence (0-1, for llm_judge) */
  confidence?: number;
  /** For llm_judge: unified verdict status (pass/fail/uncertain/not_judgeable/judge_error) */
  judge_status?: JudgeStatus;
  /** For llm_judge: evidence quotes from output/context supporting the verdict */
  evidence_quotes?: string[];
  /** For llm_judge: which judge model produced this result */
  judge_model?: string;
  /** For llm_judge: whether primary and secondary judges agreed */
  judge_agreement?: boolean;
}

export interface RubricResult {
  /** Task ID */
  task_id: string;
  /** Per-criterion results */
  criteria: CriterionResult[];
  /** Overall pass (all critical criteria passed) */
  all_pass: boolean;
  /** Strict all-pass: ALL criteria (critical AND non-critical) passed */
  strict_all_pass: boolean;
  /** Critical all-pass: all critical criteria passed (same as all_pass for backward compat) */
  critical_all_pass: boolean;
  /** Criterion pass rate (0-1) */
  criterion_pass_rate: number;
  /** Number of critical criteria passed */
  critical_passed: number;
  /** Total critical criteria */
  critical_total: number;
  /** Number of criteria passed */
  criteria_passed: number;
  /** Total criteria */
  criteria_total: number;
  /** Weighted score (0-1) */
  weighted_score: number;
  /** Verification state from Phase 0A */
  verification_state?: VerificationState;
  /** Count of criteria with each judge status (for llm_judge criteria only) */
  judge_status_counts?: Record<JudgeStatus, number>;
}

// ── Run Receipt ───────────────────────────────────────────────────────

export interface RunReceipt {
  /** Run ID (unique per execution) */
  run_id: string;
  /** Task ID */
  task_id: string;
  /** Model used */
  model_id: string;
  /** Provider (e.g. "openrouter", "anthropic") */
  provider: string;
  /** Model snapshot/hash (for reproducibility) */
  model_snapshot?: string;
  /** Thinking config used */
  thinking_config?: Record<string, unknown>;
  /** Prompt hash (SHA-256 of the system + user prompt) */
  prompt_hash: string;
  /** Corpus hash (SHA-256 of all corpus files used) */
  corpus_hash?: string;
  /** Output hash (SHA-256 of the final deliverable) */
  output_hash?: string;
  /** Tool versions used */
  tool_versions: Record<string, string>;
  /** Token counts */
  token_counts: {
    input: number;
    cache_hit?: number;
    cache_miss?: number;
    output: number;
  };
  /** Latency in milliseconds */
  latency_ms: number;
  /** Cost in USD */
  cost_usd: number;
  /** Timestamp when the run started */
  started_at: string;
  /** Timestamp when the run completed */
  completed_at: string;
  /** Verification state */
  verification_state?: VerificationState;
  /** Any warnings during the run */
  warnings?: string[];
}

// ── Run Configuration ─────────────────────────────────────────────────

export interface RunConfig {
  /** Run ID */
  run_id: string;
  /** Benchmark version */
  benchmark_version: string;
  /** Model being evaluated */
  model_id: string;
  /** Provider */
  provider: string;
  /** Judge model */
  judge_model_id: string;
  /** Judge provider */
  judge_provider: string;
  /** Tasks included in this run */
  task_ids: string[];
  /** Split being evaluated */
  split: SplitType;
  /** Timestamp */
  started_at: string;
  /** Configuration hash */
  config_hash: string;
  /** Environment info */
  environment: {
    node_version: string;
    bun_version: string;
    os: string;
    engine_version?: string;
  };
}

// ── Validation ────────────────────────────────────────────────────────

export interface TaskValidationError {
  field: string;
  message: string;
}

/**
 * Validate a task definition against the LAB-DACH requirements.
 *
 * Rules:
 *   - min 8 criteria
 *   - min 1 automated criterion
 *   - min 3 llm_judge criteria
 *   - min 2 critical criteria
 *   - Each criterion has a unique id
 *   - Automated criteria have an automated_check
 *   - LLM judge criteria have a judge_question
 *   - At least one deliverable
 *   - Task has a prompt
 *   - Jurisdiction is DE, AT, CH, or EU
 */
export function validateTask(task: Task): TaskValidationError[] {
  const errors: TaskValidationError[] = [];

  // Basic fields
  if (!task.id || task.id.trim() === "") {
    errors.push({ field: "id", message: "task id must not be empty" });
  }
  if (!task.title || task.title.trim() === "") {
    errors.push({ field: "title", message: "task title must not be empty" });
  }
  if (!task.prompt || task.prompt.trim() === "") {
    errors.push({ field: "prompt", message: "task prompt must not be empty" });
  }
  if (!task.jurisdiction || !["DE", "AT", "CH", "EU"].includes(task.jurisdiction)) {
    errors.push({ field: "jurisdiction", message: "jurisdiction must be DE, AT, CH, or EU" });
  }
  // CH is now supported in LAB-DACH v3 (T10.2)

  // Deliverables
  if (!task.deliverables || task.deliverables.length === 0) {
    errors.push({ field: "deliverables", message: "at least one deliverable is required" });
  }

  // Criteria count
  if (!task.criteria || task.criteria.length < 8) {
    errors.push({
      field: "criteria",
      message: `at least 8 criteria required, got ${task.criteria?.length ?? 0}`,
    });
  }

  if (task.criteria && task.criteria.length >= 8) {
    const automated = task.criteria.filter((c) => c.check_type === "automated");
    const llmJudge = task.criteria.filter((c) => c.check_type === "llm_judge");
    const critical = task.criteria.filter((c) => c.critical);

    if (automated.length < 1) {
      errors.push({
        field: "criteria",
        message: "at least 1 automated criterion required",
      });
    }
    if (llmJudge.length < 3) {
      errors.push({
        field: "criteria",
        message: `at least 3 llm_judge criteria required, got ${llmJudge.length}`,
      });
    }
    if (critical.length < 2) {
      errors.push({
        field: "criteria",
        message: `at least 2 critical criteria required, got ${critical.length}`,
      });
    }

    // Check criterion IDs are unique
    const ids = task.criteria.map((c) => c.id);
    const uniqueIds = new Set(ids);
    if (uniqueIds.size !== ids.length) {
      errors.push({
        field: "criteria",
        message: "criterion IDs must be unique",
      });
    }

    // Check automated criteria have automated_check
    for (const c of task.criteria) {
      if (c.check_type === "automated" && !c.automated_check) {
        errors.push({
          field: `criteria[${c.id}]`,
          message: "automated criterion must have an automated_check",
        });
      }
      if (c.check_type === "llm_judge" && !c.judge_question) {
        errors.push({
          field: `criteria[${c.id}]`,
          message: "llm_judge criterion must have a judge_question",
        });
      }
    }
  }

  return errors;
}

/**
 * Validate a Goldtask — a Task with additional required metadata.
 *
 * Goldtask-specific rules (in addition to validateTask):
 *   - as_of_date is required and must be a valid ISO date
 *   - official_sources is required with at least 1 entry
 *   - reference_output is required (non-empty)
 *   - reviewer is required with name, role, reviewed_at
 *   - review_status must be "approved"
 */
export function validateGoldTask(task: Task): TaskValidationError[] {
  const errors = validateTask(task);

  if (!task.as_of_date) {
    errors.push({ field: "as_of_date", message: "gold task requires as_of_date" });
  } else if (isNaN(Date.parse(task.as_of_date))) {
    errors.push({ field: "as_of_date", message: "as_of_date must be a valid ISO date" });
  }

  if (!task.official_sources || task.official_sources.length === 0) {
    errors.push({
      field: "official_sources",
      message: "gold task requires at least 1 official source",
    });
  } else {
    for (const src of task.official_sources) {
      if (!src.url || !src.description) {
        errors.push({
          field: "official_sources",
          message: "each official source must have url and description",
        });
      }
    }
  }

  if (!task.reference_output || task.reference_output.trim().length < 100) {
    errors.push({
      field: "reference_output",
      message: "gold task requires a reference output of at least 100 characters",
    });
  }

  if (!task.reviewer) {
    errors.push({ field: "reviewer", message: "gold task requires reviewer metadata" });
  } else {
    if (!task.reviewer.name || !task.reviewer.role || !task.reviewer.reviewed_at) {
      errors.push({
        field: "reviewer",
        message: "reviewer must have name, role, and reviewed_at",
      });
    }
  }

  if (task.review_status !== "approved") {
    errors.push({
      field: "review_status",
      message: "gold task must have review_status 'approved'",
    });
  }

  return errors;
}

/**
 * Check if a Goldtask is valid (no validation errors).
 */
export function isValidGoldTask(task: Task): boolean {
  return validateGoldTask(task).length === 0;
}

/**
 * Check if a task is valid (no validation errors).
 */
export function isValidTask(task: Task): boolean {
  return validateTask(task).length === 0;
}

// ── Guardrail Challenge Set ───────────────────────────────────────────

/**
 * Manipulation type for a challenge entry — how the reference output was
 * corrupted to test whether the guardrail catches it.
 */
export type ManipulationType =
  | "wrong_jurisdiction" // AT law cited in DE case or vice versa
  | "fabricated_paragraph" // Non-existent § number
  | "ungrounded_citation" // § cited but not supported by context
  | "wrong_law" // Wrong law applied (e.g. StGB instead of BGB)
  | "wrong_conclusion" // Correct law but wrong legal conclusion
  | "language_contamination" // English mixed into German output
  | "removed_uncertainty" // Confident answer where uncertainty is warranted
  | "fabricated_law" // Non-existent law abbreviation
  | "misattributed_quote" // Correct § but wrong content attributed
  | "outdated_law"; // Repealed/superseded law referenced

/**
 * Expected severity of the guardrail flag for a challenge entry.
 */
export type ExpectedFlagSeverity = "low" | "medium" | "high" | "critical";

/**
 * A single manipulated answer in the Guardrail Challenge Set.
 * The guardrail MUST flag this answer as problematic.
 * If the guardrail passes it, that's a false negative.
 */
export interface ChallengeEntry {
  /** Unique challenge entry ID (e.g. "challenge-001") */
  id: string;
  /** Source gold task ID this entry is derived from */
  source_task_id: string;
  /** Jurisdiction of the source task */
  jurisdiction: Jurisdiction;
  /** Type of manipulation applied */
  manipulation_type: ManipulationType;
  /** The manipulated answer text (corrupted reference output) */
  manipulated_output: string;
  /** What the guardrail should flag (expected detection) */
  expected_guardrail_flag: string;
  /** Expected severity of the flag */
  expected_flag_severity: ExpectedFlagSeverity;
  /** Human-readable description of the manipulation */
  description: string;
}

/**
 * Validate a challenge entry — ensures all required fields are present
 * and the manipulated output differs from empty.
 */
export function validateChallengeEntry(entry: ChallengeEntry): TaskValidationError[] {
  const errors: TaskValidationError[] = [];
  if (!entry.id || entry.id.trim() === "") {
    errors.push({ field: "id", message: "challenge entry id must not be empty" });
  }
  if (!entry.source_task_id || entry.source_task_id.trim() === "") {
    errors.push({ field: "source_task_id", message: "source_task_id must not be empty" });
  }
  if (!entry.manipulated_output || entry.manipulated_output.trim().length < 20) {
    errors.push({
      field: "manipulated_output",
      message: "manipulated output must be at least 20 characters",
    });
  }
  if (!entry.expected_guardrail_flag || entry.expected_guardrail_flag.trim() === "") {
    errors.push({
      field: "expected_guardrail_flag",
      message: "expected_guardrail_flag must not be empty",
    });
  }
  if (!entry.description || entry.description.trim() === "") {
    errors.push({ field: "description", message: "description must not be empty" });
  }
  return errors;
}

// ── Automated Check Registry ──────────────────────────────────────────

export const AUTOMATED_CHECK_REGISTRY: Record<
  AutomatedCheckId,
  {
    description: string;
    default_critical: boolean;
    default_severity: CriterionSeverity;
  }
> = {
  citation_grounded_v2: {
    description: "All § citations are grounded in the provided context (Guardrail v2)",
    default_critical: true,
    default_severity: "critical",
  },
  law_valid: {
    description: "All referenced law abbreviations are valid for the jurisdiction",
    default_critical: true,
    default_severity: "critical",
  },
  substantiated_uncertainty: {
    description: "No unsubstantiated uncertainty (vague hedging without legal reasoning)",
    default_critical: false,
    default_severity: "medium",
  },
  language_german: {
    description: "Output is written in German",
    default_critical: false,
    default_severity: "medium",
  },
  min_citations: {
    description: "Output cites at least N legal sources (configurable via params.min)",
    default_critical: true,
    default_severity: "high",
  },
  jurisdiction_correct: {
    description: "Output does not cite laws from wrong jurisdiction (no cross-law contamination)",
    default_critical: true,
    default_severity: "critical",
  },
  source_provenance: {
    description: "Cited laws have valid corpus receipts with source_url",
    default_critical: false,
    default_severity: "low",
  },
};
