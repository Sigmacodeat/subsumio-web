/**
 * Brain Loop / Minions — Autonomer Brain-Loop mit Audit,
 * Human-Oversight-Gate und Spend-Cap.
 *
 * P0-SKILL-002
 */

// ── Types ─────────────────────────────────────────────────────────────

export type LoopStatus = "idle" | "running" | "paused" | "stopped" | "error" | "awaiting_approval";
export type LoopAction = "sync" | "extract" | "embed" | "consolidate" | "synthesize" | "patterns" | "cleanup";
export type OversightLevel = "none" | "light" | "strict" | "manual";

export interface BrainLoopConfig {
  brain_id: string;
  enabled: boolean;
  oversight_level: OversightLevel;
  spend_cap_usd: number;
  spend_cap_period: "daily" | "weekly" | "monthly";
  max_iterations: number;
  cooldown_seconds: number;
  auto_actions: LoopAction[];
  manual_approval_actions: LoopAction[];
  notification_webhook?: string;
}

export interface BrainLoopState {
  brain_id: string;
  status: LoopStatus;
  current_iteration: number;
  current_action: LoopAction | null;
  started_at: string | null;
  last_run_at: string | null;
  last_error: string | null;
  pending_approval: PendingApproval | null;
  spend_tracker: SpendTracker;
  audit_log: LoopAuditEntry[];
}

export interface PendingApproval {
  action: LoopAction;
  iteration: number;
  requested_at: string;
  reason: string;
  estimated_cost_usd: number;
  data_preview: string;
}

export interface SpendTracker {
  period: string;
  spent_usd: number;
  cap_usd: number;
  remaining_usd: number;
  transactions: SpendTransaction[];
}

export interface SpendTransaction {
  id: string;
  timestamp: string;
  action: LoopAction;
  cost_usd: number;
  model_id: string;
  tokens_in: number;
  tokens_out: number;
  approved_by: string;
}

export interface LoopAuditEntry {
  timestamp: string;
  action: LoopAction;
  event: "started" | "completed" | "failed" | "paused" | "resumed" | "approval_requested" | "approval_granted" | "approval_denied" | "spend_cap_exceeded" | "spend_cap_warning";
  actor: string;
  details: string;
  cost_usd?: number;
}

// ── Default Config ────────────────────────────────────────────────────

export const DEFAULT_LOOP_CONFIG: BrainLoopConfig = {
  brain_id: "",
  enabled: false,
  oversight_level: "light",
  spend_cap_usd: 10,
  spend_cap_period: "daily",
  max_iterations: 50,
  cooldown_seconds: 300,
  auto_actions: ["sync", "extract", "embed"],
  manual_approval_actions: ["consolidate", "synthesize", "patterns"],
  notification_webhook: undefined,
};

export const PROTECTED_ACTIONS: LoopAction[] = ["consolidate", "synthesize", "patterns"];

// ── Spend Cap ─────────────────────────────────────────────────────────

export function createSpendTracker(capUsd: number, period: string): SpendTracker {
  return {
    period,
    spent_usd: 0,
    cap_usd: capUsd,
    remaining_usd: capUsd,
    transactions: [],
  };
}

export function recordSpend(
  tracker: SpendTracker,
  transaction: Omit<SpendTransaction, "id" | "timestamp">,
): { tracker: SpendTracker; exceeded: boolean; warning: boolean } {
  const tx: SpendTransaction = {
    ...transaction,
    id: `tx-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
  };

  const newSpent = tracker.spent_usd + tx.cost_usd;
  const newRemaining = tracker.cap_usd - newSpent;
  const exceeded = newSpent > tracker.cap_usd;
  const warning = newRemaining < tracker.cap_usd * 0.2 && !exceeded;

  return {
    tracker: {
      ...tracker,
      spent_usd: newSpent,
      remaining_usd: newRemaining,
      transactions: [...tracker.transactions, tx],
    },
    exceeded,
    warning,
  };
}

export function canSpend(tracker: SpendTracker, estimatedCost: number): boolean {
  return tracker.spent_usd + estimatedCost <= tracker.cap_usd;
}

export function resetSpendTracker(tracker: SpendTracker, newPeriod: string): SpendTracker {
  return createSpendTracker(tracker.cap_usd, newPeriod);
}

// ── Loop State Management ─────────────────────────────────────────────

export function createLoopState(brainId: string, config: BrainLoopConfig): BrainLoopState {
  return {
    brain_id: brainId,
    status: "idle",
    current_iteration: 0,
    current_action: null,
    started_at: null,
    last_run_at: null,
    last_error: null,
    pending_approval: null,
    spend_tracker: createSpendTracker(config.spend_cap_usd, config.spend_cap_period),
    audit_log: [],
  };
}

export function startLoop(state: BrainLoopState, actor: string): BrainLoopState {
  return addAuditEntry(
    {
      ...state,
      status: "running",
      started_at: new Date().toISOString(),
      current_iteration: 1,
      last_error: null,
    },
    {
      timestamp: new Date().toISOString(),
      action: state.current_action ?? "sync",
      event: "started",
      actor,
      details: `Loop started for brain ${state.brain_id}`,
    },
  );
}

export function pauseLoop(state: BrainLoopState, actor: string, reason: string): BrainLoopState {
  return addAuditEntry(
    {
      ...state,
      status: "paused",
    },
    {
      timestamp: new Date().toISOString(),
      action: state.current_action ?? "sync",
      event: "paused",
      actor,
      details: reason,
    },
  );
}

export function resumeLoop(state: BrainLoopState, actor: string): BrainLoopState {
  return addAuditEntry(
    {
      ...state,
      status: "running",
    },
    {
      timestamp: new Date().toISOString(),
      action: state.current_action ?? "sync",
      event: "resumed",
      actor,
      details: "Loop resumed",
    },
  );
}

export function stopLoop(state: BrainLoopState, actor: string, reason: string): BrainLoopState {
  return addAuditEntry(
    {
      ...state,
      status: "stopped",
      current_action: null,
    },
    {
      timestamp: new Date().toISOString(),
      action: state.current_action ?? "sync",
      event: "completed",
      actor,
      details: `Loop stopped: ${reason}`,
    },
  );
}

export function completeIteration(
  state: BrainLoopState,
  action: LoopAction,
  actor: string,
  costUsd: number,
): { state: BrainLoopState; exceeded: boolean; warning: boolean } {
  const { tracker, exceeded, warning } = recordSpend(state.spend_tracker, {
    action,
    cost_usd: costUsd,
    model_id: "default",
    tokens_in: 0,
    tokens_out: 0,
    approved_by: actor,
  });

  let newState: BrainLoopState = {
    ...state,
    current_iteration: state.current_iteration + 1,
    last_run_at: new Date().toISOString(),
    current_action: null,
    spend_tracker: tracker,
  };

  newState = addAuditEntry(newState, {
    timestamp: new Date().toISOString(),
    action,
    event: "completed",
    actor,
    details: `Iteration ${state.current_iteration} completed`,
    cost_usd: costUsd,
  });

  if (exceeded) {
    newState = addAuditEntry(newState, {
      timestamp: new Date().toISOString(),
      action,
      event: "spend_cap_exceeded",
      actor: "system",
      details: `Spend cap exceeded: $${tracker.spent_usd.toFixed(2)} / $${tracker.cap_usd.toFixed(2)}`,
    });
    newState = { ...newState, status: "stopped" };
  } else if (warning) {
    newState = addAuditEntry(newState, {
      timestamp: new Date().toISOString(),
      action,
      event: "spend_cap_warning",
      actor: "system",
      details: `Spend cap warning: $${tracker.remaining_usd.toFixed(2)} remaining`,
    });
  }

  return { state: newState, exceeded, warning };
}

export function failIteration(
  state: BrainLoopState,
  action: LoopAction,
  error: string,
  actor: string,
): BrainLoopState {
  return addAuditEntry(
    {
      ...state,
      status: "error",
      last_error: error,
      current_action: null,
    },
    {
      timestamp: new Date().toISOString(),
      action,
      event: "failed",
      actor,
      details: error,
    },
  );
}

// ── Human Oversight Gate ──────────────────────────────────────────────

export function requiresApproval(
  config: BrainLoopConfig,
  action: LoopAction,
): boolean {
  if (config.oversight_level === "manual") return true;
  if (config.oversight_level === "strict") return !config.auto_actions.includes(action);
  if (config.oversight_level === "light") return config.manual_approval_actions.includes(action);
  return false;
}

export function requestApproval(
  state: BrainLoopState,
  config: BrainLoopConfig,
  action: LoopAction,
  reason: string,
  estimatedCost: number,
): BrainLoopState {
  const approval: PendingApproval = {
    action,
    iteration: state.current_iteration,
    requested_at: new Date().toISOString(),
    reason,
    estimated_cost_usd: estimatedCost,
    data_preview: `Action: ${action}, Brain: ${state.brain_id}`,
  };

  return addAuditEntry(
    {
      ...state,
      status: "awaiting_approval",
      pending_approval: approval,
    },
    {
      timestamp: new Date().toISOString(),
      action,
      event: "approval_requested",
      actor: "system",
      details: `Approval requested for ${action}: ${reason}`,
    },
  );
}

export function grantApproval(
  state: BrainLoopState,
  actor: string,
): BrainLoopState {
  if (!state.pending_approval) return state;

  return addAuditEntry(
    {
      ...state,
      status: "running",
      pending_approval: null,
    },
    {
      timestamp: new Date().toISOString(),
      action: state.pending_approval.action,
      event: "approval_granted",
      actor,
      details: `Approval granted for ${state.pending_approval.action}`,
    },
  );
}

export function denyApproval(
  state: BrainLoopState,
  actor: string,
  reason: string,
): BrainLoopState {
  if (!state.pending_approval) return state;

  return addAuditEntry(
    {
      ...state,
      status: "paused",
      pending_approval: null,
    },
    {
      timestamp: new Date().toISOString(),
      action: state.pending_approval.action,
      event: "approval_denied",
      actor,
      details: `Approval denied: ${reason}`,
    },
  );
}

// ── Audit Log ─────────────────────────────────────────────────────────

function addAuditEntry(state: BrainLoopState, entry: LoopAuditEntry): BrainLoopState {
  return {
    ...state,
    audit_log: [...state.audit_log, entry].slice(-200),
  };
}

export function getAuditLog(state: BrainLoopState, limit?: number): LoopAuditEntry[] {
  const log = state.audit_log;
  return limit ? log.slice(-limit) : log;
}

export function getAuditLogByAction(state: BrainLoopState, action: LoopAction): LoopAuditEntry[] {
  return state.audit_log.filter((e) => e.action === action);
}

// ── Spend Cap Check ───────────────────────────────────────────────────

export function checkSpendCap(state: BrainLoopState, estimatedCost: number): {
  can_proceed: boolean;
  reason: string;
} {
  if (!canSpend(state.spend_tracker, estimatedCost)) {
    return {
      can_proceed: false,
      reason: `Spend cap would be exceeded: $${(state.spend_tracker.spent_usd + estimatedCost).toFixed(2)} > $${state.spend_tracker.cap_usd.toFixed(2)}`,
    };
  }
  return { can_proceed: true, reason: "Within spend cap" };
}
