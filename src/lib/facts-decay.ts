/**
 * Facts Decay — Zeitliche Abschwächung von Fakten-Konfidenz.
 *
 * P0-BRAIN-012: Retention-/Legal-Hold-aware Decay.
 *
 * Architektur:
 *   - Decay reduziert Konfidenz älterer Fakten (Information Value Decay)
 *   - Legal Hold friert Decay ein (keine Konfidenz-Reduktion)
 *   - Vergessene Fakten haben Konfidenz 0
 *   - Decay ist konfigurierbar pro Entity-Klasse
 *   - Jede Decay-Aktion ist auditierbar
 */

import type { EntityClass } from "@/lib/data-classification";

// ── Types ─────────────────────────────────────────────────────────────

export interface DecayableFact {
  id: string;
  slug: string;
  content: string;
  entity_class: EntityClass;
  created_at: string;
  confidence: number;
  legal_hold: boolean;
  forgotten: boolean;
  last_decay_at?: string;
}

export interface DecayResult {
  fact_id: string;
  old_confidence: number;
  new_confidence: number;
  decay_rate: number;
  applied: boolean;
  reason: string;
}

export interface DecayConfig {
  /** Half-life in days (confidence halves every N days) */
  half_life_days: number;
  /** Minimum confidence floor (never decays below this) */
  min_confidence: number;
  /** Maximum confidence cap */
  max_confidence: number;
}

export const DECAY_CONFIGS: Record<EntityClass, DecayConfig> = {
  brain_page: { half_life_days: 365, min_confidence: 0.1, max_confidence: 1.0 },
  relational_table: { half_life_days: 730, min_confidence: 0.2, max_confidence: 1.0 },
  file_object: { half_life_days: 730, min_confidence: 0.15, max_confidence: 1.0 },
  event_audit: { half_life_days: 1095, min_confidence: 0.3, max_confidence: 1.0 },
  ai_run: { half_life_days: 90, min_confidence: 0.0, max_confidence: 1.0 },
};

// ── Decay Logic ───────────────────────────────────────────────────────

export function computeDecayedConfidence(fact: DecayableFact, now: Date = new Date()): number {
  // Forgotten facts have 0 confidence
  if (fact.forgotten) return 0;

  // Legal hold freezes decay
  if (fact.legal_hold) return fact.confidence;

  const config = DECAY_CONFIGS[fact.entity_class];
  const ageMs = now.getTime() - new Date(fact.created_at).getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);

  if (ageDays <= 0) return Math.min(config.max_confidence, fact.confidence);

  // Exponential decay: confidence * 0.5^(age / half_life)
  const decayFactor = Math.pow(0.5, ageDays / config.half_life_days);
  const decayed = fact.confidence * decayFactor;

  // Clamp to [min_confidence, max_confidence]
  return Math.max(config.min_confidence, Math.min(config.max_confidence, decayed));
}

export function applyDecay(fact: DecayableFact, now: Date = new Date()): DecayResult {
  const _config = DECAY_CONFIGS[fact.entity_class];
  const oldConfidence = fact.confidence;

  if (fact.forgotten) {
    return {
      fact_id: fact.id,
      old_confidence: oldConfidence,
      new_confidence: 0,
      decay_rate: 1.0,
      applied: false,
      reason: "forgotten",
    };
  }

  if (fact.legal_hold) {
    return {
      fact_id: fact.id,
      old_confidence: oldConfidence,
      new_confidence: oldConfidence,
      decay_rate: 0,
      applied: false,
      reason: "legal_hold_active",
    };
  }

  const newConfidence = computeDecayedConfidence(fact, now);
  const decayRate = oldConfidence > 0 ? (oldConfidence - newConfidence) / oldConfidence : 0;

  return {
    fact_id: fact.id,
    old_confidence: oldConfidence,
    new_confidence: newConfidence,
    decay_rate: decayRate,
    applied: newConfidence !== oldConfidence,
    reason: newConfidence !== oldConfidence ? "decay_applied" : "no_change",
  };
}

export function batchDecay(
  facts: DecayableFact[],
  now: Date = new Date()
): { results: DecayResult[]; updated: DecayableFact[] } {
  const results: DecayResult[] = [];
  const updated: DecayableFact[] = [];

  for (const fact of facts) {
    const result = applyDecay(fact, now);
    results.push(result);

    if (result.applied) {
      updated.push({
        ...fact,
        confidence: result.new_confidence,
        last_decay_at: now.toISOString(),
      });
    } else {
      updated.push(fact);
    }
  }

  return { results, updated };
}

export function getDecayEligibility(
  fact: DecayableFact,
  now: Date = new Date()
): { eligible: boolean; reason: string; current_confidence: number } {
  if (fact.forgotten) {
    return { eligible: false, reason: "forgotten", current_confidence: 0 };
  }

  if (fact.legal_hold) {
    return { eligible: false, reason: "legal_hold_active", current_confidence: fact.confidence };
  }

  const decayed = computeDecayedConfidence(fact, now);
  if (decayed === fact.confidence) {
    return { eligible: false, reason: "no_decay_needed", current_confidence: fact.confidence };
  }

  return { eligible: true, reason: "decay_eligible", current_confidence: decayed };
}

export function getDecayStats(
  facts: DecayableFact[],
  now: Date = new Date()
): {
  total: number;
  decayed: number;
  frozen: number;
  forgotten: number;
  avg_confidence: number;
  avg_decayed_confidence: number;
} {
  let decayed = 0;
  let frozen = 0;
  let forgotten = 0;
  let confidenceSum = 0;
  let decayedSum = 0;

  for (const fact of facts) {
    confidenceSum += fact.confidence;

    if (fact.forgotten) {
      forgotten++;
      continue;
    }

    if (fact.legal_hold) {
      frozen++;
      decayedSum += fact.confidence;
      continue;
    }

    const decayedConfidence = computeDecayedConfidence(fact, now);
    decayedSum += decayedConfidence;
    if (decayedConfidence < fact.confidence) decayed++;
  }

  return {
    total: facts.length,
    decayed,
    frozen,
    forgotten,
    avg_confidence: facts.length > 0 ? confidenceSum / facts.length : 0,
    avg_decayed_confidence: facts.length > 0 ? decayedSum / facts.length : 0,
  };
}
