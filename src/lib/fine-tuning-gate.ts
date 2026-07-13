/**
 * EPIC 9 — T9.4 Fine-Tuning Gate
 * ===============================
 *
 * Fine-tuning is only permitted when ALL of the following are satisfied:
 *   1. Clear baseline comparison exists (model vetting report passed)
 *   2. Sufficient confirmed data (minimum N confirmed triage entries)
 *   3. Unchanged holdout set (SHA-256 hash matches last recorded hash)
 *
 * Component priority for fine-tuning (start small):
 *   1. Reranker (retrieval ranking)
 *   2. Classifier (intent/complexity routing)
 *   3. Citation Parser (§-extraction from legal text)
 *   4. Rubric Judge (LLM-as-judge for eval criteria)
 *
 * Gate states: locked → reviewable → approved | rejected
 */

import type { ModelVettingReport } from "@/lib/model-vetting";

// ── Types ─────────────────────────────────────────────────────────────

export type FineTunableComponent = "reranker" | "classifier" | "citation_parser" | "rubric_judge";

export type GateState = "locked" | "reviewable" | "approved" | "rejected";

export interface FineTuningGateRequest {
  id: string;
  /** Component to fine-tune */
  component: FineTunableComponent;
  /** Model ID to fine-tune */
  model_id: string;
  /** Baseline vetting report ID */
  baseline_vetting_report_id: string;
  /** Number of confirmed triage entries available */
  confirmed_data_count: number;
  /** Number of regression fixtures mined */
  mined_fixture_count: number;
  /** SHA-256 hash of the holdout set being used */
  holdout_hash: string;
  /** Last recorded holdout hash (for integrity check) */
  last_recorded_holdout_hash: string;
  /** Training hyperparameters */
  hyperparameters: {
    learning_rate: number;
    batch_size: number;
    epochs: number;
    warmup_steps: number;
    weight_decay: number;
  };
  /** Description of what the fine-tuning aims to improve */
  objective: string;
  /** Requester ID */
  requester_id: string;
  /** When the request was created */
  created_at: string;
  /** Current gate state */
  gate_state: GateState;
  /** Gate evaluation result */
  evaluation?: GateEvaluation;
  /** Reviewer ID (who approved/rejected) */
  reviewer_id?: string;
  /** Review timestamp */
  reviewed_at?: string;
  /** Review notes */
  review_notes?: string;
}

export interface GateEvaluation {
  /** Whether baseline comparison exists and passed */
  has_baseline: boolean;
  /** Whether sufficient confirmed data exists */
  has_sufficient_data: boolean;
  /** Whether holdout set is unchanged */
  holdout_unchanged: boolean;
  /** Whether component is in priority list */
  component_in_priority: boolean;
  /** Whether hyperparameters are within safe bounds */
  hyperparameters_safe: boolean;
  /** Overall gate decision */
  gate_passed: boolean;
  /** List of blocking reasons (if any) */
  blocking_reasons: string[];
  /** List of warnings (non-blocking) */
  warnings: string[];
  /** When the evaluation was performed */
  evaluated_at: string;
}

// ── Configuration ─────────────────────────────────────────────────────

export interface FineTuningGateConfig {
  /** Minimum confirmed triage entries required */
  min_confirmed_data: number;
  /** Minimum mined fixtures required */
  min_mined_fixtures: number;
  /** Component priority order (lower = higher priority) */
  component_priority: FineTunableComponent[];
  /** Safe hyperparameter bounds */
  safe_hyperparameter_bounds: {
    learning_rate: { min: number; max: number };
    batch_size: { min: number; max: number };
    epochs: { min: number; max: number };
    warmup_steps: { min: number; max: number };
    weight_decay: { min: number; max: number };
  };
}

export const DEFAULT_GATE_CONFIG: FineTuningGateConfig = {
  min_confirmed_data: 20,
  min_mined_fixtures: 10,
  component_priority: ["reranker", "classifier", "citation_parser", "rubric_judge"],
  safe_hyperparameter_bounds: {
    learning_rate: { min: 1e-6, max: 1e-3 },
    batch_size: { min: 4, max: 128 },
    epochs: { min: 1, max: 10 },
    warmup_steps: { min: 0, max: 1000 },
    weight_decay: { min: 0, max: 0.1 },
  },
};

// ── Labels (German) ───────────────────────────────────────────────────

export const COMPONENT_LABELS_DE: Record<FineTunableComponent, string> = {
  reranker: "Re-Ranker",
  classifier: "Klassifikator",
  citation_parser: "Zitats-Parser",
  rubric_judge: "Rubric-Judge",
};

export const GATE_STATE_LABELS_DE: Record<GateState, string> = {
  locked: "Gesperrt",
  reviewable: "Prüfbar",
  approved: "Genehmigt",
  rejected: "Abgelehnt",
};

// ── In-Memory Store ───────────────────────────────────────────────────

const requests: FineTuningGateRequest[] = [];
let requestIdCounter = 0;

function generateRequestId(): string {
  requestIdCounter++;
  return `ft-gate-${Date.now()}-${requestIdCounter.toString().padStart(4, "0")}`;
}

// ── Holdout Hash Registry ─────────────────────────────────────────────

const holdoutHashRegistry: Map<string, string> = new Map();

/**
 * Register a holdout hash for a given test set.
 * This is the "known good" hash that must not change.
 */
export function registerHoldoutHash(testSetId: string, hash: string): void {
  holdoutHashRegistry.set(testSetId, hash);
}

/**
 * Get the last recorded holdout hash for a test set.
 */
export function getRegisteredHoldoutHash(testSetId: string): string | undefined {
  return holdoutHashRegistry.get(testSetId);
}

/**
 * Verify that a holdout hash matches the registered hash.
 */
export function verifyHoldoutIntegrity(testSetId: string, currentHash: string): boolean {
  const registered = holdoutHashRegistry.get(testSetId);
  if (!registered) return false;
  return registered === currentHash;
}

// ── Gate Evaluation ───────────────────────────────────────────────────

/**
 * Evaluate a fine-tuning gate request against all criteria.
 */
export function evaluateGate(
  request: Omit<FineTuningGateRequest, "id" | "created_at" | "gate_state" | "evaluation">,
  config: FineTuningGateConfig = DEFAULT_GATE_CONFIG,
  vettingReport?: ModelVettingReport
): GateEvaluation {
  const blockingReasons: string[] = [];
  const warnings: string[] = [];

  // 1. Baseline comparison check
  const hasBaseline = vettingReport !== undefined && vettingReport.overall_passed;
  if (!hasBaseline) {
    if (!vettingReport) {
      blockingReasons.push("No baseline vetting report provided");
    } else if (!vettingReport.overall_passed) {
      blockingReasons.push(`Baseline vetting report did not pass (state: ${vettingReport.state})`);
    }
  }

  // 2. Sufficient confirmed data check
  const hasSufficientData =
    request.confirmed_data_count >= config.min_confirmed_data &&
    request.mined_fixture_count >= config.min_mined_fixtures;
  if (!hasSufficientData) {
    if (request.confirmed_data_count < config.min_confirmed_data) {
      blockingReasons.push(
        `Insufficient confirmed data: ${request.confirmed_data_count} (min: ${config.min_confirmed_data})`
      );
    }
    if (request.mined_fixture_count < config.min_mined_fixtures) {
      blockingReasons.push(
        `Insufficient mined fixtures: ${request.mined_fixture_count} (min: ${config.min_mined_fixtures})`
      );
    }
  }

  // 3. Holdout integrity check
  const holdoutUnchanged = request.holdout_hash === request.last_recorded_holdout_hash;
  if (!holdoutUnchanged) {
    blockingReasons.push(
      "Holdout set has changed — hash mismatch. Holdout must remain unchanged for fine-tuning gate."
    );
  }

  // 4. Component priority check
  const componentInPriority = config.component_priority.includes(request.component);
  if (!componentInPriority) {
    blockingReasons.push(`Component "${request.component}" is not in the priority list`);
  }

  // 5. Hyperparameter safety check
  const hp = request.hyperparameters;
  const bounds = config.safe_hyperparameter_bounds;
  const hpChecks: Array<{ name: string; value: number; min: number; max: number }> = [
    {
      name: "learning_rate",
      value: hp.learning_rate,
      min: bounds.learning_rate.min,
      max: bounds.learning_rate.max,
    },
    {
      name: "batch_size",
      value: hp.batch_size,
      min: bounds.batch_size.min,
      max: bounds.batch_size.max,
    },
    { name: "epochs", value: hp.epochs, min: bounds.epochs.min, max: bounds.epochs.max },
    {
      name: "warmup_steps",
      value: hp.warmup_steps,
      min: bounds.warmup_steps.min,
      max: bounds.warmup_steps.max,
    },
    {
      name: "weight_decay",
      value: hp.weight_decay,
      min: bounds.weight_decay.min,
      max: bounds.weight_decay.max,
    },
  ];

  let hyperparametersSafe = true;
  for (const check of hpChecks) {
    if (check.value < check.min || check.value > check.max) {
      hyperparametersSafe = false;
      blockingReasons.push(
        `Hyperparameter ${check.name} = ${check.value} is out of safe bounds [${check.min}, ${check.max}]`
      );
    }
  }

  // Warnings (non-blocking)
  if (request.component === "rubric_judge" && hp.epochs > 5) {
    warnings.push("Fine-tuning rubric judge for >5 epochs may cause judge drift");
  }
  if (hp.learning_rate > 1e-4) {
    warnings.push("Learning rate >1e-4 is aggressive — monitor for catastrophic forgetting");
  }
  if (request.confirmed_data_count < config.min_confirmed_data * 2) {
    warnings.push(
      `Confirmed data (${request.confirmed_data_count}) is barely above minimum (${config.min_confirmed_data}) — consider collecting more`
    );
  }

  const gatePassed =
    hasBaseline &&
    hasSufficientData &&
    holdoutUnchanged &&
    componentInPriority &&
    hyperparametersSafe;

  return {
    has_baseline: hasBaseline,
    has_sufficient_data: hasSufficientData,
    holdout_unchanged: holdoutUnchanged,
    component_in_priority: componentInPriority,
    hyperparameters_safe: hyperparametersSafe,
    gate_passed: gatePassed,
    blocking_reasons: blockingReasons,
    warnings,
    evaluated_at: new Date().toISOString(),
  };
}

// ── Request Management ────────────────────────────────────────────────

/**
 * Create a fine-tuning gate request.
 * The request starts in "locked" state until evaluated.
 */
export function createGateRequest(
  input: Omit<FineTuningGateRequest, "id" | "created_at" | "gate_state" | "evaluation">,
  config: FineTuningGateConfig = DEFAULT_GATE_CONFIG,
  vettingReport?: ModelVettingReport
): FineTuningGateRequest {
  const evaluation = evaluateGate(input, config, vettingReport);

  const request: FineTuningGateRequest = {
    ...input,
    id: generateRequestId(),
    created_at: new Date().toISOString(),
    gate_state: evaluation.gate_passed ? "reviewable" : "locked",
    evaluation,
  };

  requests.push(request);
  return request;
}

/**
 * Approve a reviewable gate request.
 * Only "reviewable" requests can be approved.
 */
export function approveGate(
  requestId: string,
  reviewerId: string,
  notes?: string
): FineTuningGateRequest {
  const request = requests.find((r) => r.id === requestId);
  if (!request) {
    throw new Error(`Gate request not found: ${requestId}`);
  }
  if (request.gate_state !== "reviewable") {
    throw new Error(`Cannot approve request in state: ${request.gate_state}`);
  }

  request.gate_state = "approved";
  request.reviewer_id = reviewerId;
  request.reviewed_at = new Date().toISOString();
  request.review_notes = notes;
  return request;
}

/**
 * Reject a gate request.
 * Both "locked" and "reviewable" requests can be rejected.
 */
export function rejectGate(
  requestId: string,
  reviewerId: string,
  notes?: string
): FineTuningGateRequest {
  const request = requests.find((r) => r.id === requestId);
  if (!request) {
    throw new Error(`Gate request not found: ${requestId}`);
  }
  if (request.gate_state === "approved" || request.gate_state === "rejected") {
    throw new Error(`Cannot reject request in state: ${request.gate_state}`);
  }

  request.gate_state = "rejected";
  request.reviewer_id = reviewerId;
  request.reviewed_at = new Date().toISOString();
  request.review_notes = notes;
  return request;
}

/**
 * Re-evaluate a gate request (e.g., after fixing blocking issues).
 */
export function reevaluateGate(
  requestId: string,
  updates: Partial<
    Pick<
      FineTuningGateRequest,
      | "confirmed_data_count"
      | "mined_fixture_count"
      | "holdout_hash"
      | "last_recorded_holdout_hash"
      | "hyperparameters"
    >
  >,
  config: FineTuningGateConfig = DEFAULT_GATE_CONFIG,
  vettingReport?: ModelVettingReport
): FineTuningGateRequest {
  const request = requests.find((r) => r.id === requestId);
  if (!request) {
    throw new Error(`Gate request not found: ${requestId}`);
  }
  if (request.gate_state === "approved") {
    throw new Error("Cannot re-evaluate an approved request");
  }

  Object.assign(request, updates);

  const evaluation = evaluateGate(request, config, vettingReport);
  request.evaluation = evaluation;
  request.gate_state = evaluation.gate_passed ? "reviewable" : "locked";

  return request;
}

// ── Query Functions ───────────────────────────────────────────────────

export function getGateRequest(id: string): FineTuningGateRequest | undefined {
  return requests.find((r) => r.id === id);
}

export function getAllGateRequests(): FineTuningGateRequest[] {
  return [...requests].sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export function getGateRequestsByComponent(
  component: FineTunableComponent
): FineTuningGateRequest[] {
  return requests.filter((r) => r.component === component);
}

export function getGateRequestsByState(state: GateState): FineTuningGateRequest[] {
  return requests.filter((r) => r.gate_state === state);
}

// ── Stats ─────────────────────────────────────────────────────────────

export interface GateStats {
  total_requests: number;
  by_state: Record<GateState, number>;
  by_component: Record<FineTunableComponent, number>;
  approval_rate: number;
  rejection_rate: number;
  locked_count: number;
}

export function getGateStats(): GateStats {
  const byState: Record<GateState, number> = {
    locked: 0,
    reviewable: 0,
    approved: 0,
    rejected: 0,
  };
  const byComponent: Record<FineTunableComponent, number> = {
    reranker: 0,
    classifier: 0,
    citation_parser: 0,
    rubric_judge: 0,
  };

  for (const req of requests) {
    byState[req.gate_state]++;
    byComponent[req.component]++;
  }

  const reviewed = byState.approved + byState.rejected;

  return {
    total_requests: requests.length,
    by_state: byState,
    by_component: byComponent,
    approval_rate: reviewed > 0 ? byState.approved / reviewed : 0,
    rejection_rate: reviewed > 0 ? byState.rejected / reviewed : 0,
    locked_count: byState.locked,
  };
}

// ── Reset (for testing) ───────────────────────────────────────────────

export function _resetGateStore(): void {
  requests.length = 0;
  requestIdCounter = 0;
  holdoutHashRegistry.clear();
}
