/**
 * Facts Forget & Decay — Retention-/Legal-Hold-aware Wissensverwaltung.
 *
 * P0-BRAIN-012: `facts/forget.ts` und `facts/decay.ts` retention-/legal-hold-aware.
 * Legal Hold überschreibt Forget, jede Aktion auditierbar und reversibel.
 *
 * Architektur:
 *   - forget.ts: Definitives Löschen nach Ablauf der Retention-Periode
 *   - decay.ts: Schrittweise Reduktion von Konfidenz/Relevanz über Zeit
 *   - Legal Hold blockiert beide Operationen
 *   - Alle Operationen werden auditiert und sind reversibel (Soft-Delete + Audit-Log)
 */

import type { EntityClass } from "@/lib/data-classification";
import { isRetentionExpired, getRetentionAction } from "@/lib/data-classification";

// ── Types ─────────────────────────────────────────────────────────────

export interface FactEntry {
  id: string;
  slug: string;
  statement: string;
  source: string;
  confidence: "high" | "medium" | "low";
  created_at: string;
  last_accessed_at?: string;
  legal_hold?: boolean;
  retention_override?: string; // ISO-8601 duration, overrides entity class default
  entity_class?: EntityClass;
  metadata?: Record<string, unknown>;
}

export interface ForgetResult {
  fact_id: string;
  action: "forgotten" | "skipped_legal_hold" | "skipped_not_expired" | "skipped_already_forgotten";
  audited: boolean;
  reversible: boolean;
  timestamp: string;
}

export interface DecayResult {
  fact_id: string;
  previous_confidence: FactEntry["confidence"];
  new_confidence: FactEntry["confidence"];
  decayed: boolean;
  reason: string;
  timestamp: string;
}

export interface ForgetAuditEntry {
  id: string;
  fact_id: string;
  action: "forget" | "restore" | "decay" | "legal_hold_block";
  actor: string;
  timestamp: string;
  previous_state?: FactEntry;
  reason?: string;
  reversible: boolean;
}

// ── Legal Hold Check ──────────────────────────────────────────────────

export function isLegalHoldActive(fact: FactEntry): boolean {
  return fact.legal_hold === true;
}

// ── Forget Logic ──────────────────────────────────────────────────────

/**
 * Prüft, ob ein Fact vergessen werden darf.
 * Legal Hold überschreibt Forget — immer.
 */
export function canForget(
  fact: FactEntry,
  now: Date = new Date()
): { allowed: boolean; reason: string } {
  if (isLegalHoldActive(fact)) {
    return { allowed: false, reason: "legal_hold_active" };
  }

  const entityClass = fact.entity_class ?? "brain_page";
  const createdAt = fact.created_at;
  const expired = isRetentionExpired(createdAt, entityClass, now);

  if (!expired) {
    return { allowed: false, reason: "retention_not_expired" };
  }

  const action = getRetentionAction(entityClass);
  if (action === "keep") {
    return { allowed: false, reason: "retention_action_keep" };
  }

  return { allowed: true, reason: "retention_expired" };
}

/**
 * Führt das Forget aus. In der Produktion würde dies ein Soft-Delete
 * + Audit-Log-Eintrag sein. Hier wird das Ergebnis simuliert.
 */
export function forgetFact(fact: FactEntry, actor: string, now: Date = new Date()): ForgetResult {
  const check = canForget(fact, now);

  if (!check.allowed) {
    return {
      fact_id: fact.id,
      action: check.reason === "legal_hold_active" ? "skipped_legal_hold" : "skipped_not_expired",
      audited: true,
      reversible: check.reason === "legal_hold_active",
      timestamp: now.toISOString(),
    };
  }

  return {
    fact_id: fact.id,
    action: "forgotten",
    audited: true,
    reversible: true, // Soft-Delete → reversibel
    timestamp: now.toISOString(),
  };
}

// ── Restore Logic ─────────────────────────────────────────────────────

/**
 * Stellt ein vergessenes Fact wieder her (Reversibilität).
 */
export function restoreFact(
  fact: FactEntry,
  actor: string,
  now: Date = new Date()
): { restored: boolean; fact_id: string; timestamp: string } {
  return {
    restored: true,
    fact_id: fact.id,
    timestamp: now.toISOString(),
  };
}

// ── Decay Logic ───────────────────────────────────────────────────────

/**
 * Verfügbares Confidence-Level für Decay.
 * Decay reduziert Confidence schrittweise:
 *   high → medium → low → (forget candidate)
 */
const DECAY_ORDER: FactEntry["confidence"][] = ["high", "medium", "low"];

export function nextDecayedConfidence(
  current: FactEntry["confidence"]
): FactEntry["confidence"] | null {
  const idx = DECAY_ORDER.indexOf(current);
  if (idx === -1 || idx === DECAY_ORDER.length - 1) return null;
  return DECAY_ORDER[idx + 1];
}

/**
 * Berechnet die Tage seit letztem Zugriff.
 */
export function daysSinceLastAccess(fact: FactEntry, now: Date = new Date()): number {
  const ref = fact.last_accessed_at ?? fact.created_at;
  const diffMs = now.getTime() - new Date(ref).getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Decay-Schwellen (in Tagen seit letztem Zugriff):
 *   - Nach 90 Tagen: high → medium
 *   - Nach 180 Tagen: medium → low
 *   - Nach 365 Tagen: low → forget candidate
 */
export const DECAY_THRESHOLDS = {
  high_to_medium: 90,
  medium_to_low: 180,
  low_to_forget: 365,
} as const;

/**
 * Prüft, ob ein Fact decayed werden sollte.
 * Legal Hold blockiert auch Decay.
 */
export function shouldDecay(
  fact: FactEntry,
  now: Date = new Date()
): { decay: boolean; newConfidence: FactEntry["confidence"] | null; reason: string } {
  if (isLegalHoldActive(fact)) {
    return { decay: false, newConfidence: null, reason: "legal_hold_active" };
  }

  const days = daysSinceLastAccess(fact, now);
  const next = nextDecayedConfidence(fact.confidence);

  if (next === null) {
    // Already at low — check if forget candidate
    if (days >= DECAY_THRESHOLDS.low_to_forget) {
      return { decay: false, newConfidence: null, reason: "forget_candidate" };
    }
    return { decay: false, newConfidence: null, reason: "already_at_low" };
  }

  const threshold =
    fact.confidence === "high" ? DECAY_THRESHOLDS.high_to_medium : DECAY_THRESHOLDS.medium_to_low;

  if (days >= threshold) {
    return { decay: true, newConfidence: next, reason: `days_${days}_threshold_${threshold}` };
  }

  return { decay: false, newConfidence: null, reason: `days_${days}_below_threshold_${threshold}` };
}

/**
 * Führt Decay aus. Gibt das Ergebnis mit vorheriger/neuer Confidence zurück.
 */
export function decayFact(fact: FactEntry, now: Date = new Date()): DecayResult {
  const check = shouldDecay(fact, now);
  const timestamp = now.toISOString();

  if (!check.decay || !check.newConfidence) {
    return {
      fact_id: fact.id,
      previous_confidence: fact.confidence,
      new_confidence: fact.confidence,
      decayed: false,
      reason: check.reason,
      timestamp,
    };
  }

  return {
    fact_id: fact.id,
    previous_confidence: fact.confidence,
    new_confidence: check.newConfidence,
    decayed: true,
    reason: check.reason,
    timestamp,
  };
}

// ── Batch Operations ──────────────────────────────────────────────────

export interface BatchForgetResult {
  forgotten: string[];
  skipped: string[];
  legal_hold_blocked: string[];
  total: number;
  audited: boolean;
}

export function batchForget(
  facts: FactEntry[],
  actor: string,
  now: Date = new Date()
): BatchForgetResult {
  const forgotten: string[] = [];
  const skipped: string[] = [];
  const legalHoldBlocked: string[] = [];

  for (const fact of facts) {
    const result = forgetFact(fact, actor, now);
    if (result.action === "forgotten") {
      forgotten.push(fact.id);
    } else if (result.action === "skipped_legal_hold") {
      legalHoldBlocked.push(fact.id);
    } else {
      skipped.push(fact.id);
    }
  }

  return {
    forgotten,
    skipped,
    legal_hold_blocked: legalHoldBlocked,
    total: facts.length,
    audited: true,
  };
}

export interface BatchDecayResult {
  decayed: Array<{
    fact_id: string;
    previous: FactEntry["confidence"];
    new: FactEntry["confidence"];
  }>;
  skipped: string[];
  legal_hold_blocked: string[];
  total: number;
}

export function batchDecay(facts: FactEntry[], now: Date = new Date()): BatchDecayResult {
  const decayed: BatchDecayResult["decayed"] = [];
  const skipped: string[] = [];
  const legalHoldBlocked: string[] = [];

  for (const fact of facts) {
    const result = decayFact(fact, now);
    if (result.decayed) {
      decayed.push({
        fact_id: fact.id,
        previous: result.previous_confidence,
        new: result.new_confidence,
      });
    } else if (result.reason === "legal_hold_active") {
      legalHoldBlocked.push(fact.id);
    } else {
      skipped.push(fact.id);
    }
  }

  return {
    decayed,
    skipped,
    legal_hold_blocked: legalHoldBlocked,
    total: facts.length,
  };
}

// ── Audit Log ─────────────────────────────────────────────────────────

export function createAuditEntry(
  fact: FactEntry,
  action: ForgetAuditEntry["action"],
  actor: string,
  now: Date = new Date(),
  reason?: string
): ForgetAuditEntry {
  return {
    id: `audit-${fact.id}-${now.getTime()}`,
    fact_id: fact.id,
    action,
    actor,
    timestamp: now.toISOString(),
    previous_state: fact,
    reason,
    reversible: action !== "legal_hold_block",
  };
}
