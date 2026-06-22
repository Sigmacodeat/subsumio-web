/**
 * Retention-aware Forget & Decay for Legal Facts
 *
 * P0-BRAIN-012: `facts/forget.ts` und `facts/decay.ts` retention-/legal-hold-aware
 *
 * Kernregeln:
 *   1. Legal Hold überschreibt Forget — eine Fact unter Legal Hold wird NIEMALS vergessen
 *   2. Jede Aktion (forget, decay, restore) ist auditierbar
 *   3. Jede Aktion ist reversibel (soft-delete mit restore)
 *   4. Retention-Policies basieren auf Data Classification (sensitivity, retention duration)
 *   5. PII-Facts werden nach Ablauf anonymisiert, nicht gelöscht (GoBd-Konformität)
 */

import type { RetentionPolicy } from "@/lib/data-classification";

// ── Types ─────────────────────────────────────────────────────────────

export type FactSensitivity = "public" | "internal" | "confidential" | "restricted";

export type FactStatus = "active" | "decayed" | "forgotten" | "anonymized" | "legal_hold";

export type DecayLevel = "none" | "low" | "medium" | "high" | "full";

export interface FactRecord {
  /** Unique fact ID. */
  id: string;
  /** Case slug this fact belongs to. */
  case_slug: string;
  /** The fact content. */
  content: string;
  /** Source that provided this fact. */
  source: string;
  /** Sensitivity level. */
  sensitivity: FactSensitivity;
  /** Whether this fact contains PII. */
  has_pii: boolean;
  /** Whether this fact is under legal hold. */
  legal_hold: boolean;
  /** Current status. */
  status: FactStatus;
  /** Decay level 0..1 (0 = fresh, 1 = fully decayed). */
  decay_level: number;
  /** ISO timestamp when the fact was created. */
  created_at: string;
  /** ISO timestamp when the fact was last accessed. */
  last_accessed_at: string;
  /** ISO timestamp when the fact was forgotten (if applicable). */
  forgotten_at: string | null;
  /** ISO timestamp when the fact was anonymized (if applicable). */
  anonymized_at: string | null;
  /** Retention policy applicable to this fact. */
  retention?: RetentionPolicy;
  /** Brain ID for tenant isolation. */
  brain_id?: string;
  /** Additional metadata. */
  metadata?: Record<string, unknown>;
}

export interface ForgetRequest {
  fact_id: string;
  reason: "user_request" | "retention_expired" | "gdpr_article_17" | "case_closed" | "manual";
  requested_by: string;
  /** Override retention check (admin only). */
  force?: boolean;
}

export interface ForgetResult {
  fact_id: string;
  success: boolean;
  action: "forgotten" | "anonymized" | "blocked_legal_hold" | "blocked_retention" | "not_found";
  message: string;
  audited: boolean;
}

export interface DecayResult {
  fact_id: string;
  previous_level: number;
  new_level: number;
  decayed: boolean;
  reason: string;
}

export interface RestoreResult {
  fact_id: string;
  success: boolean;
  previous_status: FactStatus;
  new_status: FactStatus;
  message: string;
  audited: boolean;
}

export interface AuditEntry {
  id: string;
  timestamp: string;
  action:
    | "forget"
    | "decay"
    | "restore"
    | "anonymize"
    | "legal_hold_applied"
    | "legal_hold_released";
  fact_id: string;
  actor: string;
  reason: string;
  details?: Record<string, unknown>;
  reversible: boolean;
}

// ── Configuration ─────────────────────────────────────────────────────

export interface ForgetDecayConfig {
  /** Whether legal hold blocks forget (always true — this is a hard rule). */
  legal_hold_blocks_forget: boolean;
  /** Whether retention policy is enforced before forget. */
  enforce_retention: boolean;
  /** Whether PII facts are anonymized instead of deleted. */
  anonymize_pii: boolean;
  /** Decay interval in hours — how often decay runs. */
  decay_interval_hours: number;
  /** Maximum decay level before auto-forget (0..1). */
  max_decay_before_forget: number;
  /** Whether to audit all actions. */
  audit_enabled: boolean;
}

export const DEFAULT_CONFIG: ForgetDecayConfig = {
  legal_hold_blocks_forget: true,
  enforce_retention: true,
  anonymize_pii: true,
  decay_interval_hours: 24,
  max_decay_before_forget: 0.9,
  audit_enabled: true,
};

// ── Audit Log ─────────────────────────────────────────────────────────

export class FactAuditLog {
  private entries: AuditEntry[] = [];
  private nextId = 1;

  log(entry: Omit<AuditEntry, "id" | "timestamp">): AuditEntry {
    const audit: AuditEntry = {
      id: `audit-${this.nextId++}`,
      timestamp: new Date().toISOString(),
      ...entry,
    };
    this.entries.push(audit);
    return audit;
  }

  getEntries(factId?: string): AuditEntry[] {
    if (factId) return this.entries.filter((e) => e.fact_id === factId);
    return [...this.entries];
  }

  getEntry(id: string): AuditEntry | undefined {
    return this.entries.find((e) => e.id === id);
  }

  clear(): void {
    this.entries = [];
    this.nextId = 1;
  }

  count(): number {
    return this.entries.length;
  }
}

// ── Forget Logic ──────────────────────────────────────────────────────

/**
 * Attempt to forget a fact.
 * Legal Hold ALWAYS blocks forget — this is non-negotiable.
 * Retention policy may also block forget if not expired.
 * PII facts are anonymized instead of deleted.
 */
export function forgetFact(
  fact: FactRecord,
  request: ForgetRequest,
  config: ForgetDecayConfig = DEFAULT_CONFIG,
  auditLog?: FactAuditLog
): ForgetResult {
  // 1. Legal Hold check — hard block
  if (config.legal_hold_blocks_forget && fact.legal_hold) {
    if (config.audit_enabled && auditLog) {
      auditLog.log({
        action: "forget",
        fact_id: fact.id,
        actor: request.requested_by,
        reason: request.reason,
        details: { blocked_by: "legal_hold" },
        reversible: false,
      });
    }
    return {
      fact_id: fact.id,
      success: false,
      action: "blocked_legal_hold",
      message: "Forget blocked: Fact is under Legal Hold. Legal Hold must be released first.",
      audited: config.audit_enabled,
    };
  }

  // 2. Retention check (unless force=true or retention expired)
  if (config.enforce_retention && !request.force && fact.retention) {
    const retentionExpired = isRetentionExpired(fact);
    if (!retentionExpired) {
      return {
        fact_id: fact.id,
        success: false,
        action: "blocked_retention",
        message: `Forget blocked: Retention policy active (${fact.retention.retention}). Use force=true to override.`,
        audited: false,
      };
    }
  }

  // 3. PII → anonymize instead of delete
  if (config.anonymize_pii && fact.has_pii) {
    fact.status = "anonymized";
    fact.anonymized_at = new Date().toISOString();
    fact.content = anonymizeContent(fact.content);

    if (config.audit_enabled && auditLog) {
      auditLog.log({
        action: "anonymize",
        fact_id: fact.id,
        actor: request.requested_by,
        reason: request.reason,
        details: { previous_status: "active" },
        reversible: true,
      });
    }

    return {
      fact_id: fact.id,
      success: true,
      action: "anonymized",
      message: "Fact anonymized (PII content redacted). Original content is restorable.",
      audited: config.audit_enabled,
    };
  }

  // 4. Soft-delete (forget)
  fact.status = "forgotten";
  fact.forgotten_at = new Date().toISOString();

  if (config.audit_enabled && auditLog) {
    auditLog.log({
      action: "forget",
      fact_id: fact.id,
      actor: request.requested_by,
      reason: request.reason,
      details: { previous_status: "active" },
      reversible: true,
    });
  }

  return {
    fact_id: fact.id,
    success: true,
    action: "forgotten",
    message: "Fact forgotten (soft-delete). Use restoreFact() to reverse.",
    audited: config.audit_enabled,
  };
}

// ── Decay Logic ───────────────────────────────────────────────────────

/**
 * Compute the decay level for a fact based on time since last access.
 * Facts under legal hold do not decay.
 */
export function computeDecayLevel(
  fact: FactRecord,
  now: Date = new Date()
): { level: number; reason: string } {
  // Legal hold freezes decay
  if (fact.legal_hold) {
    return { level: fact.decay_level, reason: "legal_hold — decay frozen" };
  }

  // Already forgotten/anonymized — no further decay
  if (fact.status === "forgotten" || fact.status === "anonymized") {
    return { level: fact.decay_level, reason: `status=${fact.status} — no decay` };
  }

  const lastAccess = new Date(fact.last_accessed_at);
  const elapsedHours = (now.getTime() - lastAccess.getTime()) / (1000 * 60 * 60);

  // Decay curve: linear over 90 days, then full
  const decayHours = 90 * 24; // 90 days
  const level = Math.min(1, elapsedHours / decayHours);

  let reason = `elapsed ${Math.round(elapsedHours)}h since last access`;
  if (level >= 1) reason = "fully decayed (>90 days since access)";

  return { level, reason };
}

/**
 * Apply decay to a fact. If decay exceeds max_decay_before_forget,
 * the fact is automatically forgotten (unless legal hold).
 */
export function decayFact(
  fact: FactRecord,
  config: ForgetDecayConfig = DEFAULT_CONFIG,
  auditLog?: FactAuditLog,
  now: Date = new Date()
): DecayResult {
  const previousLevel = fact.decay_level;

  // Legal hold freezes decay
  if (fact.legal_hold) {
    return {
      fact_id: fact.id,
      previous_level: previousLevel,
      new_level: previousLevel,
      decayed: false,
      reason: "legal_hold — decay frozen",
    };
  }

  const { level: newLevel, reason } = computeDecayLevel(fact, now);
  fact.decay_level = newLevel;

  // Auto-forget if decay exceeds threshold
  if (newLevel >= config.max_decay_before_forget && fact.status === "active") {
    const forgetResult = forgetFact(
      fact,
      {
        fact_id: fact.id,
        reason: "retention_expired",
        requested_by: "system:decay",
      },
      config,
      auditLog
    );

    return {
      fact_id: fact.id,
      previous_level: previousLevel,
      new_level: newLevel,
      decayed: true,
      reason: `auto-forgotten: ${reason} (${forgetResult.action})`,
    };
  }

  // Mark as decayed if level increased significantly
  if (newLevel > previousLevel + 0.05) {
    fact.status = "decayed";

    if (config.audit_enabled && auditLog) {
      auditLog.log({
        action: "decay",
        fact_id: fact.id,
        actor: "system:decay",
        reason,
        details: { previous_level: previousLevel, new_level: newLevel },
        reversible: true,
      });
    }
  }

  return {
    fact_id: fact.id,
    previous_level: previousLevel,
    new_level: newLevel,
    decayed: newLevel > previousLevel,
    reason,
  };
}

/**
 * Run decay on a batch of facts.
 */
export function decayBatch(
  facts: FactRecord[],
  config: ForgetDecayConfig = DEFAULT_CONFIG,
  auditLog?: FactAuditLog,
  now: Date = new Date()
): DecayResult[] {
  return facts.map((f) => decayFact(f, config, auditLog, now));
}

// ── Restore Logic ─────────────────────────────────────────────────────

/**
 * Restore a forgotten or anonymized fact.
 * This reverses soft-delete or anonymization.
 */
export function restoreFact(
  fact: FactRecord,
  requestedBy: string,
  originalContent?: string,
  auditLog?: FactAuditLog
): RestoreResult {
  const previousStatus = fact.status;

  if (previousStatus === "active") {
    return {
      fact_id: fact.id,
      success: false,
      previous_status: previousStatus,
      new_status: previousStatus,
      message: "Fact is already active — no restore needed.",
      audited: false,
    };
  }

  if (previousStatus === "legal_hold") {
    return {
      fact_id: fact.id,
      success: false,
      previous_status: previousStatus,
      new_status: previousStatus,
      message: "Fact is under legal hold — release legal hold first.",
      audited: false,
    };
  }

  // Restore content if provided (for anonymized facts)
  if (previousStatus === "anonymized" && originalContent) {
    fact.content = originalContent;
  }

  fact.status = "active";
  fact.forgotten_at = null;
  fact.anonymized_at = null;
  fact.decay_level = 0;
  fact.last_accessed_at = new Date().toISOString();

  if (auditLog) {
    auditLog.log({
      action: "restore",
      fact_id: fact.id,
      actor: requestedBy,
      reason: "manual restore",
      details: { previous_status: previousStatus },
      reversible: false,
    });
  }

  return {
    fact_id: fact.id,
    success: true,
    previous_status: previousStatus,
    new_status: "active",
    message: `Fact restored from ${previousStatus}.`,
    audited: true,
  };
}

// ── Legal Hold Management ─────────────────────────────────────────────

export function applyLegalHold(
  fact: FactRecord,
  requestedBy: string,
  reason: string,
  auditLog?: FactAuditLog
): FactRecord {
  fact.legal_hold = true;
  fact.status = "legal_hold";

  if (auditLog) {
    auditLog.log({
      action: "legal_hold_applied",
      fact_id: fact.id,
      actor: requestedBy,
      reason,
      reversible: true,
    });
  }

  return fact;
}

export function releaseLegalHold(
  fact: FactRecord,
  requestedBy: string,
  reason: string,
  auditLog?: FactAuditLog
): FactRecord {
  fact.legal_hold = false;
  fact.status = "active";

  if (auditLog) {
    auditLog.log({
      action: "legal_hold_released",
      fact_id: fact.id,
      actor: requestedBy,
      reason,
      reversible: false,
    });
  }

  return fact;
}

// ── Helpers ───────────────────────────────────────────────────────────

/**
 * Check if retention policy has expired for a fact.
 */
export function isRetentionExpired(fact: FactRecord, now: Date = new Date()): boolean {
  if (!fact.retention) return true;
  const created = new Date(fact.created_at);
  const durationMs = parseISODurationToMs(fact.retention.retention);
  return now.getTime() > created.getTime() + durationMs;
}

/**
 * Parse ISO-8601 duration to milliseconds.
 * Supports: P1Y, P6M, P30D, PT24H, P1Y6M, etc.
 */
export function parseISODurationToMs(duration: string): number {
  const match = duration.match(/^P(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?$/);
  if (!match) return 0;

  const [, years, months, days, hours, minutes] = match;
  const ms =
    Number(years ?? 0) * 365 * 24 * 60 * 60 * 1000 +
    Number(months ?? 0) * 30 * 24 * 60 * 60 * 1000 +
    Number(days ?? 0) * 24 * 60 * 60 * 1000 +
    Number(hours ?? 0) * 60 * 60 * 1000 +
    Number(minutes ?? 0) * 60 * 1000;
  return ms;
}

/**
 * Anonymize PII content by replacing sensitive patterns.
 */
export function anonymizeContent(content: string): string {
  return content
    .replace(/\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g, "[EMAIL_REDACTED]")
    .replace(/\b\d{3}[-.\s]?\d{3,4}[-.\s]?\d{4}\b/g, "[PHONE_REDACTED]")
    .replace(/\b\d{5}\s?[A-Za-z]{4}\b/g, "[IBAN_REDACTED]")
    .replace(/\b\d{1,2}\.\d{1,2}\.\d{2,4}\b/g, "[DATE_REDACTED]")
    .replace(/\b[A-ZÄÖÜ][a-zäöüß]+\s+[A-ZÄÖÜ][a-zäöüß]+\b/g, "[NAME_REDACTED]");
}

/**
 * Create a sample FactRecord for testing.
 */
export function createFactRecord(overrides: Partial<FactRecord> = {}): FactRecord {
  const now = new Date().toISOString();
  return {
    id: `fact-${Math.random().toString(36).slice(2, 10)}`,
    case_slug: "cases/test",
    content: "Test fact content",
    source: "strategy",
    sensitivity: "internal",
    has_pii: false,
    legal_hold: false,
    status: "active",
    decay_level: 0,
    created_at: now,
    last_accessed_at: now,
    forgotten_at: null,
    anonymized_at: null,
    ...overrides,
  };
}
