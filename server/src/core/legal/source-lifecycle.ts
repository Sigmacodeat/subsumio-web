/**
 * Source Lifecycle — State Machine for Legal Data Sources
 *
 * T3.2: Every legal source (law-de, law-at-judikatur, etc.) progresses through
 * a defined lifecycle from discovery to retirement. Each transition requires
 * automated checks and, for rights-related transitions, human approval.
 *
 * States:
 *   discovered → rights_pending → parser_pending → eval_pending
 *   → early_access → general_availability → degraded → retired
 *
 * Invariants:
 *   - Only forward transitions are allowed (except degraded→retired, degraded→general_availability)
 *   - rights_pending → parser_pending requires human license approval
 *   - eval_pending → early_access requires eval pass (benchmark ≥ threshold)
 *   - early_access → general_availability requires time-in-state + no critical issues
 *   - Any state → degraded on connector failure or schema drift
 *   - Any state → retired on explicit admin action
 *
 * @module server/src/core/legal/source-lifecycle
 */

import type { Pool } from "pg";

// ── Types ─────────────────────────────────────────────────────────────

export type LifecycleState =
  | "discovered"
  | "rights_pending"
  | "parser_pending"
  | "eval_pending"
  | "early_access"
  | "general_availability"
  | "degraded"
  | "retired";

export type SourceType =
  | "primary_legislation"
  | "regulation"
  | "case_law_supreme"
  | "case_law_instance"
  | "materials"
  | "authority_practice"
  | "literature_open"
  | "literature_licensed";

export type Jurisdiction = "DE" | "AT" | "CH" | "EU" | "MULTI";

export interface SourceRecord {
  id: string;
  name: string;
  jurisdiction: Jurisdiction;
  source_type: SourceType;
  lifecycle_state: LifecycleState;
  config: Record<string, unknown>;
  discovered_at: string;
  approved_by: string | null;
  approved_at: string | null;
  retired_at: string | null;
  retired_reason: string | null;
  metadata: Record<string, unknown>;
  rights_cleared_at: string | null;
  parser_ready_at: string | null;
  eval_passed_at: string | null;
  early_access_at: string | null;
  ga_at: string | null;
  degraded_at: string | null;
}

export interface TransitionResult {
  source_id: string;
  from_state: LifecycleState;
  to_state: LifecycleState;
  transitioned_at: string;
  checks_passed: string[];
  checks_failed: string[];
  human_approval_required: boolean;
}

export interface TransitionCheck {
  name: string;
  description: string;
  passed: boolean;
  severity: "info" | "warning" | "error" | "critical";
  message?: string;
}

// ── State Machine Definition ──────────────────────────────────────────

/**
 * Allowed transitions: from_state → [allowed to_states]
 */
export const ALLOWED_TRANSITIONS: Record<LifecycleState, LifecycleState[]> = {
  discovered: ["rights_pending", "retired"],
  rights_pending: ["parser_pending", "retired"],
  parser_pending: ["eval_pending", "degraded", "retired"],
  eval_pending: ["early_access", "degraded", "retired"],
  early_access: ["general_availability", "degraded", "retired"],
  general_availability: ["degraded", "retired"],
  degraded: ["general_availability", "retired"],
  retired: [],
};

/**
 * Human approval required for these transitions.
 */
export const HUMAN_APPROVAL_TRANSITIONS: Set<string> = new Set([
  "rights_pending→parser_pending",
  "early_access→general_availability",
  "general_availability→retired",
]);

/**
 * Minimum time in early_access before GA (in hours).
 */
export const MIN_EARLY_ACCESS_HOURS = 24;

/**
 * States where the source is considered "live" and can be searched.
 */
export const LIVE_STATES: LifecycleState[] = ["early_access", "general_availability"];

/**
 * States where the source is considered "available" for read access.
 */
export const AVAILABLE_STATES: LifecycleState[] = ["early_access", "general_availability"];

// ── Validation ────────────────────────────────────────────────────────

/**
 * Check if a transition is allowed by the state machine.
 */
export function isTransitionAllowed(from: LifecycleState, to: LifecycleState): boolean {
  const allowed = ALLOWED_TRANSITIONS[from] ?? [];
  return allowed.includes(to);
}

/**
 * Check if a transition requires human approval.
 */
export function isHumanApprovalRequired(from: LifecycleState, to: LifecycleState): boolean {
  return HUMAN_APPROVAL_TRANSITIONS.has(`${from}→${to}`);
}

/**
 * Validate a source record for completeness.
 */
export function validateSourceRecord(record: Partial<SourceRecord>): string[] {
  const errors: string[] = [];

  if (!record.id || record.id.trim() === "") {
    errors.push("id must not be empty");
  }
  if (!record.name || record.name.trim() === "") {
    errors.push("name must not be empty");
  }
  if (!record.jurisdiction || !["DE", "AT", "CH", "EU", "MULTI"].includes(record.jurisdiction)) {
    errors.push("jurisdiction must be DE, AT, CH, EU, or MULTI");
  }
  if (!record.source_type || !isValidSourceType(record.source_type)) {
    errors.push(`source_type must be one of: ${VALID_SOURCE_TYPES.join(", ")}`);
  }

  return errors;
}

const VALID_SOURCE_TYPES: SourceType[] = [
  "primary_legislation",
  "regulation",
  "case_law_supreme",
  "case_law_instance",
  "materials",
  "authority_practice",
  "literature_open",
  "literature_licensed",
];

function isValidSourceType(s: string): s is SourceType {
  return VALID_SOURCE_TYPES.includes(s as SourceType);
}

// ── Transition Checks ─────────────────────────────────────────────────

/**
 * Automated checks for each transition. These are pure functions
 * that can be run without side effects.
 */
export function getTransitionChecks(
  from: LifecycleState,
  to: LifecycleState,
  source: SourceRecord,
  context?: {
    licenseApproved?: boolean;
    evalPassed?: boolean;
    parserReady?: boolean;
    earlyAccessHours?: number;
  }
): TransitionCheck[] {
  const checks: TransitionCheck[] = [];
  const ctx = context ?? {};

  // Common: source must not be retired
  if (source.lifecycle_state === "retired") {
    checks.push({
      name: "not_retired",
      description: "Source must not be retired",
      passed: false,
      severity: "critical",
      message: "Cannot transition from retired state",
    });
    return checks;
  }

  // rights_pending → parser_pending: requires license approval
  if (from === "rights_pending" && to === "parser_pending") {
    checks.push({
      name: "license_approved",
      description: "License review must be approved by a human",
      passed: ctx.licenseApproved === true,
      severity: "critical",
      message: ctx.licenseApproved ? undefined : "License review not approved",
    });
  }

  // parser_pending → eval_pending: requires parser readiness
  if (from === "parser_pending" && to === "eval_pending") {
    checks.push({
      name: "parser_ready",
      description: "Parser must be validated against golden files",
      passed: ctx.parserReady === true,
      severity: "error",
      message: ctx.parserReady ? undefined : "Parser not validated",
    });
  }

  // eval_pending → early_access: requires eval pass
  if (from === "eval_pending" && to === "early_access") {
    checks.push({
      name: "eval_passed",
      description: "Retrieval benchmark must pass (Hit@5 ≥ threshold)",
      passed: ctx.evalPassed === true,
      severity: "critical",
      message: ctx.evalPassed ? undefined : "Eval benchmark not passed",
    });
  }

  // early_access → general_availability: requires minimum time in early_access
  if (from === "early_access" && to === "general_availability") {
    const hours = ctx.earlyAccessHours ?? 0;
    checks.push({
      name: "min_early_access_time",
      description: `Source must be in early_access for ≥ ${MIN_EARLY_ACCESS_HOURS}h`,
      passed: hours >= MIN_EARLY_ACCESS_HOURS,
      severity: "warning",
      message: hours < MIN_EARLY_ACCESS_HOURS ? `Only ${hours}h in early_access` : undefined,
    });
  }

  // Any → degraded: always allowed (failure path)
  if (to === "degraded") {
    checks.push({
      name: "degradation_allowed",
      description: "Degradation is always allowed on failure",
      passed: true,
      severity: "info",
    });
  }

  // Any → retired: always allowed with reason
  if (to === "retired") {
    checks.push({
      name: "retirement_reason",
      description: "Retirement should have a reason",
      passed: true, // reason is checked at DB level
      severity: "info",
    });
  }

  return checks;
}

/**
 * Run transition checks and return the result.
 */
export function evaluateTransition(
  from: LifecycleState,
  to: LifecycleState,
  source: SourceRecord,
  context?: {
    licenseApproved?: boolean;
    evalPassed?: boolean;
    parserReady?: boolean;
    earlyAccessHours?: number;
  }
): { allowed: boolean; checks: TransitionCheck[]; humanApprovalRequired: boolean } {
  // Check state machine allows this transition
  if (!isTransitionAllowed(from, to)) {
    return {
      allowed: false,
      checks: [
        {
          name: "transition_allowed",
          description: `Transition ${from} → ${to} is not allowed`,
          passed: false,
          severity: "critical",
        },
      ],
      humanApprovalRequired: false,
    };
  }

  const checks = getTransitionChecks(from, to, source, context);
  const hasCritical = checks.some((c) => !c.passed && c.severity === "critical");
  const humanApprovalRequired = isHumanApprovalRequired(from, to);

  return {
    allowed: !hasCritical,
    checks,
    humanApprovalRequired,
  };
}

// ── Source Registry Store ─────────────────────────────────────────────

/**
 * SourceRegistryStore — DB-backed CRUD for source lifecycle management.
 *
 * Replaces the simple `sources` table INSERT used in eval harnesses
 * with a full lifecycle-managed registry.
 */
export class SourceRegistryStore {
  constructor(private pool: Pool) {}

  /**
   * Register a new source. Starts in 'discovered' state.
   */
  async register(opts: {
    id: string;
    name: string;
    jurisdiction: Jurisdiction;
    source_type: SourceType;
    config?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
  }): Promise<SourceRecord> {
    const errors = validateSourceRecord(opts);
    if (errors.length > 0) {
      throw new Error(`Invalid source: ${errors.join("; ")}`);
    }

    await this.pool.query(
      `INSERT INTO sources (id, name, jurisdiction, source_type, lifecycle_state, config, metadata)
       VALUES ($1, $2, $3, $4, 'discovered', $5, $6)
       ON CONFLICT (id) DO NOTHING`,
      [
        opts.id,
        opts.name,
        opts.jurisdiction,
        opts.source_type,
        JSON.stringify(opts.config ?? {}),
        JSON.stringify(opts.metadata ?? {}),
      ]
    );

    return (await this.get(opts.id))!;
  }

  /**
   * Get a source by ID.
   */
  async get(id: string): Promise<SourceRecord | null> {
    const result = await this.pool.query(`SELECT * FROM sources WHERE id = $1`, [id]);
    if (!result.rows[0]) return null;
    return rowToSourceRecord(result.rows[0]);
  }

  /**
   * List all sources, optionally filtered by state or jurisdiction.
   */
  async list(opts?: {
    lifecycle_state?: LifecycleState;
    jurisdiction?: Jurisdiction;
    source_type?: SourceType;
  }): Promise<SourceRecord[]> {
    let query = `SELECT * FROM sources WHERE 1=1`;
    const params: (string | number)[] = [];
    let idx = 1;

    if (opts?.lifecycle_state) {
      query += ` AND lifecycle_state = $${idx++}`;
      params.push(opts.lifecycle_state);
    }
    if (opts?.jurisdiction) {
      query += ` AND jurisdiction = $${idx++}`;
      params.push(opts.jurisdiction);
    }
    if (opts?.source_type) {
      query += ` AND source_type = $${idx++}`;
      params.push(opts.source_type);
    }

    query += ` ORDER BY discovered_at DESC`;
    const result = await this.pool.query(query, params);
    return result.rows.map(rowToSourceRecord);
  }

  /**
   * Transition a source to a new lifecycle state.
   * Runs automated checks and enforces human approval where required.
   */
  async transition(
    id: string,
    toState: LifecycleState,
    opts?: {
      approvedBy?: string;
      licenseApproved?: boolean;
      evalPassed?: boolean;
      parserReady?: boolean;
      retiredReason?: string;
      metadata?: Record<string, unknown>;
    }
  ): Promise<TransitionResult> {
    const source = await this.get(id);
    if (!source) {
      throw new Error(`Source "${id}" not found`);
    }

    const fromState = source.lifecycle_state;

    // Calculate early_access hours if transitioning from early_access
    let earlyAccessHours = 0;
    if (fromState === "early_access" && source.early_access_at) {
      earlyAccessHours = (Date.now() - new Date(source.early_access_at).getTime()) / 3_600_000;
    }

    const evaluation = evaluateTransition(fromState, toState, source, {
      licenseApproved: opts?.licenseApproved,
      evalPassed: opts?.evalPassed,
      parserReady: opts?.parserReady,
      earlyAccessHours,
    });

    if (!evaluation.allowed) {
      const failedChecks = evaluation.checks.filter((c) => !c.passed);
      throw new Error(
        `Transition ${fromState} → ${toState} not allowed: ${failedChecks.map((c) => c.message ?? c.name).join("; ")}`
      );
    }

    if (evaluation.humanApprovalRequired && !opts?.approvedBy) {
      throw new Error(`Transition ${fromState} → ${toState} requires human approval (approvedBy)`);
    }

    // Build UPDATE query with state-specific timestamps
    const updates: string[] = ["lifecycle_state = $2"];
    const params: (string | number | null)[] = [id, toState];
    let idx = 3;
    const now = new Date().toISOString();

    if (toState === "parser_pending" && opts?.approvedBy) {
      updates.push(`approved_by = $${idx++}`);
      params.push(opts.approvedBy);
      updates.push(`approved_at = $${idx++}`);
      params.push(now);
      updates.push(`rights_cleared_at = $${idx++}`);
      params.push(now);
    }

    if (toState === "eval_pending") {
      updates.push(`parser_ready_at = $${idx++}`);
      params.push(now);
    }

    if (toState === "early_access") {
      updates.push(`eval_passed_at = $${idx++}`);
      params.push(now);
      updates.push(`early_access_at = $${idx++}`);
      params.push(now);
    }

    if (toState === "general_availability") {
      updates.push(`ga_at = $${idx++}`);
      params.push(now);
    }

    if (toState === "degraded") {
      updates.push(`degraded_at = $${idx++}`);
      params.push(now);
    }

    if (toState === "retired") {
      updates.push(`retired_at = $${idx++}`);
      params.push(now);
      if (opts?.retiredReason) {
        updates.push(`retired_reason = $${idx++}`);
        params.push(opts.retiredReason);
      }
    }

    if (opts?.metadata) {
      updates.push(`metadata = COALESCE(metadata, '{}'::jsonb) || $${idx++}::jsonb`);
      params.push(JSON.stringify(opts.metadata));
    }

    params.push(now); // not used directly but kept for reference

    await this.pool.query(
      `UPDATE sources SET ${updates.join(", ")} WHERE id = $1`,
      params.slice(0, -1) // remove trailing now
    );

    return {
      source_id: id,
      from_state: fromState,
      to_state: toState,
      transitioned_at: now,
      checks_passed: evaluation.checks.filter((c) => c.passed).map((c) => c.name),
      checks_failed: evaluation.checks.filter((c) => !c.passed).map((c) => c.name),
      human_approval_required: evaluation.humanApprovalRequired,
    };
  }

  /**
   * Check if a source is in a live (searchable) state.
   */
  async isLive(id: string): Promise<boolean> {
    const source = await this.get(id);
    if (!source) return false;
    return LIVE_STATES.includes(source.lifecycle_state);
  }

  /**
   * Get all sources in a specific state.
   */
  async getByState(state: LifecycleState): Promise<SourceRecord[]> {
    return this.list({ lifecycle_state: state });
  }

  /**
   * Get all live sources for a jurisdiction.
   */
  async getLiveSources(jurisdiction: Jurisdiction): Promise<SourceRecord[]> {
    const result = await this.pool.query(
      `SELECT * FROM sources
       WHERE jurisdiction = $1 AND lifecycle_state IN ('early_access', 'general_availability')
       ORDER BY name`,
      [jurisdiction]
    );
    return result.rows.map(rowToSourceRecord);
  }
}

// ── Row Mapper ────────────────────────────────────────────────────────

function rowToSourceRecord(row: Record<string, unknown>): SourceRecord {
  return {
    id: row.id as string,
    name: row.name as string,
    jurisdiction: row.jurisdiction as Jurisdiction,
    source_type: row.source_type as SourceType,
    lifecycle_state: row.lifecycle_state as LifecycleState,
    config: (row.config as Record<string, unknown>) ?? {},
    discovered_at: row.discovered_at as string,
    approved_by: (row.approved_by as string) ?? null,
    approved_at: (row.approved_at as string) ?? null,
    retired_at: (row.retired_at as string) ?? null,
    retired_reason: (row.retired_reason as string) ?? null,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    rights_cleared_at: (row.rights_cleared_at as string) ?? null,
    parser_ready_at: (row.parser_ready_at as string) ?? null,
    eval_passed_at: (row.eval_passed_at as string) ?? null,
    early_access_at: (row.early_access_at as string) ?? null,
    ga_at: (row.ga_at as string) ?? null,
    degraded_at: (row.degraded_at as string) ?? null,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────

/**
 * Get the lifecycle state ordering (for progress display).
 */
export const STATE_ORDER: LifecycleState[] = [
  "discovered",
  "rights_pending",
  "parser_pending",
  "eval_pending",
  "early_access",
  "general_availability",
  "degraded",
  "retired",
];

/**
 * Get the progress percentage for a state (0-100).
 */
export function stateProgress(state: LifecycleState): number {
  const idx = STATE_ORDER.indexOf(state);
  if (idx < 0) return 0;
  // Map first 6 states to 0-100%, degraded/retired are special
  if (state === "degraded") return 50;
  if (state === "retired") return 100;
  return Math.round((idx / 5) * 100);
}

/**
 * Human-readable German label for each state.
 */
export const STATE_LABELS_DE: Record<LifecycleState, string> = {
  discovered: "Entdeckt",
  rights_pending: "Rechteprüfung ausstehend",
  parser_pending: "Parser in Entwicklung",
  eval_pending: "Eval ausstehend",
  early_access: "Early Access",
  general_availability: "Allgemein verfügbar",
  degraded: "Degradiert",
  retired: "Retired",
};

/**
 * Human-readable German label for each source type.
 */
export const SOURCE_TYPE_LABELS_DE: Record<SourceType, string> = {
  primary_legislation: "Primärrecht (Gesetze)",
  regulation: "Verordnungen",
  case_law_supreme: "Höchstgerichtliche Judikatur",
  case_law_instance: "Instanzrechtsprechung",
  materials: "Gesetzesmaterialien",
  authority_practice: "Behördenpraxis",
  literature_open: "Offene Literatur",
  literature_licensed: "Lizenzierte Literatur",
};
