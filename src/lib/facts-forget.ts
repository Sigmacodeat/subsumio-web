/**
 * Facts Forget — Retention-/Legal-Hold-aware Forgetting von Fakten.
 *
 * P0-BRAIN-012: Legal Hold überschreibt Forget, jede Aktion auditierbar
 * und reversibel.
 *
 * Architektur:
 *   - forget() prüft Legal Hold → wenn aktiv, wird Forget verweigert
 *   - Jede Forget-Aktion wird im Audit-Log gespeichert (aktionierbar)
 *   - Forget ist reversibel: restore() stellt gelöschte Fakten wieder her
 *   - Soft-Delete: Fakten werden als `forgotten: true` markiert, nicht physisch gelöscht
 */

import type { EntityClass } from "@/lib/data-classification";
import {
  isRetentionExpired,
  getRetentionAction,
  calculateRetentionExpiry,
} from "@/lib/data-classification";

// ── Types ─────────────────────────────────────────────────────────────

export interface ForgettableFact {
  id: string;
  slug: string;
  content: string;
  entity_class: EntityClass;
  created_at: string;
  forgotten: boolean;
  forgotten_at?: string;
  forgotten_reason?: string;
  forgotten_by?: string;
  legal_hold: boolean;
  retention_expired: boolean;
}

export interface ForgetAuditEntry {
  id: string;
  fact_id: string;
  action: "forget" | "restore" | "forget_blocked";
  timestamp: string;
  actor: string;
  reason?: string;
  legal_hold_active: boolean;
  reversible: boolean;
}

export interface ForgetResult {
  success: boolean;
  fact_id: string;
  action: "forget" | "forget_blocked";
  reason: string;
  audit_entry: ForgetAuditEntry;
}

export interface RestoreResult {
  success: boolean;
  fact_id: string;
  action: "restore";
  audit_entry: ForgetAuditEntry;
}

// ── Forget Logic ──────────────────────────────────────────────────────

export function canForget(fact: ForgettableFact, now: Date = new Date()): boolean {
  if (fact.legal_hold) return false;
  if (fact.forgotten) return false;
  // Use the fact's retention_expired field if set, otherwise compute from dates
  if (fact.retention_expired !== undefined) return fact.retention_expired;
  return isRetentionExpired(fact.created_at, fact.entity_class, now);
}

export function forget(
  fact: ForgettableFact,
  actor: string,
  reason: string,
  now: Date = new Date(),
): ForgetResult {
  const auditId = `audit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const timestamp = now.toISOString();

  // Legal Hold blocks forget
  if (fact.legal_hold) {
    return {
      success: false,
      fact_id: fact.id,
      action: "forget_blocked",
      reason: "legal_hold_active",
      audit_entry: {
        id: auditId,
        fact_id: fact.id,
        action: "forget_blocked",
        timestamp,
        actor,
        reason,
        legal_hold_active: true,
        reversible: false,
      },
    };
  }

  // Already forgotten
  if (fact.forgotten) {
    return {
      success: false,
      fact_id: fact.id,
      action: "forget_blocked",
      reason: "already_forgotten",
      audit_entry: {
        id: auditId,
        fact_id: fact.id,
        action: "forget_blocked",
        timestamp,
        actor,
        reason,
        legal_hold_active: false,
        reversible: false,
      },
    };
  }

  // Retention not expired
  const expired = fact.retention_expired !== undefined
    ? fact.retention_expired
    : isRetentionExpired(fact.created_at, fact.entity_class, now);
  if (!expired) {
    return {
      success: false,
      fact_id: fact.id,
      action: "forget_blocked",
      reason: "retention_not_expired",
      audit_entry: {
        id: auditId,
        fact_id: fact.id,
        action: "forget_blocked",
        timestamp,
        actor,
        reason,
        legal_hold_active: false,
        reversible: false,
      },
    };
  }

  return {
    success: true,
    fact_id: fact.id,
    action: "forget",
    reason,
    audit_entry: {
      id: auditId,
      fact_id: fact.id,
      action: "forget",
      timestamp,
      actor,
      reason,
      legal_hold_active: false,
      reversible: true,
    },
  };
}

export function restore(
  fact: ForgettableFact,
  actor: string,
  now: Date = new Date(),
): RestoreResult {
  const auditId = `audit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const timestamp = now.toISOString();

  return {
    success: true,
    fact_id: fact.id,
    action: "restore",
    audit_entry: {
      id: auditId,
      fact_id: fact.id,
      action: "restore",
      timestamp,
      actor,
      legal_hold_active: fact.legal_hold,
      reversible: true,
    },
  };
}

export function applyForget(fact: ForgettableFact, result: ForgetResult): ForgettableFact {
  if (!result.success) return fact;
  return {
    ...fact,
    forgotten: true,
    forgotten_at: result.audit_entry.timestamp,
    forgotten_reason: result.reason,
    forgotten_by: result.audit_entry.actor,
  };
}

export function applyRestore(fact: ForgettableFact): ForgettableFact {
  return {
    ...fact,
    forgotten: false,
    forgotten_at: undefined,
    forgotten_reason: undefined,
    forgotten_by: undefined,
  };
}

export function getForgetEligibility(
  fact: ForgettableFact,
  now: Date = new Date(),
): {
  eligible: boolean;
  reason: string;
  retention_expiry: Date | null;
  retention_action: string;
} {
  if (fact.legal_hold) {
    return {
      eligible: false,
      reason: "legal_hold_active",
      retention_expiry: calculateRetentionExpiry(fact.created_at, fact.entity_class),
      retention_action: "keep",
    };
  }

  if (fact.forgotten) {
    return {
      eligible: false,
      reason: "already_forgotten",
      retention_expiry: calculateRetentionExpiry(fact.created_at, fact.entity_class),
      retention_action: getRetentionAction(fact.entity_class),
    };
  }

  const expired = fact.retention_expired !== undefined
    ? fact.retention_expired
    : isRetentionExpired(fact.created_at, fact.entity_class, now);
  return {
    eligible: expired,
    reason: expired ? "retention_expired" : "retention_not_expired",
    retention_expiry: calculateRetentionExpiry(fact.created_at, fact.entity_class),
    retention_action: getRetentionAction(fact.entity_class),
  };
}
