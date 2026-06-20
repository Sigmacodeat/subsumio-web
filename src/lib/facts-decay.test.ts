// @vitest-environment node

import { describe, test, expect } from "vitest";
import {
  computeDecayedConfidence,
  applyDecay,
  batchDecay,
  getDecayEligibility,
  getDecayStats,
  DECAY_CONFIGS,
  type DecayableFact,
} from "@/lib/facts-decay";
import type { EntityClass } from "@/lib/data-classification";

// ── Fixtures ──────────────────────────────────────────────────────────

function makeFact(overrides: Partial<DecayableFact> = {}): DecayableFact {
  return {
    id: "fact-1",
    slug: "cases/2026-001/facts/1",
    content: "Mandant war am 15.01.2026 in der Kanzlei.",
    entity_class: "brain_page" as EntityClass,
    created_at: "2024-01-01T00:00:00Z",
    confidence: 1.0,
    legal_hold: false,
    forgotten: false,
    ...overrides,
  };
}

const NOW = new Date("2026-06-20T12:00:00Z");

// ── computeDecayedConfidence ──────────────────────────────────────────

describe("computeDecayedConfidence", () => {
  test("returns 0 for forgotten facts", () => {
    expect(computeDecayedConfidence(makeFact({ forgotten: true }), NOW)).toBe(0);
  });

  test("returns original confidence when legal hold is active", () => {
    const fact = makeFact({ confidence: 0.8, legal_hold: true });
    expect(computeDecayedConfidence(fact, NOW)).toBe(0.8);
  });

  test("decays confidence for old facts", () => {
    const fact = makeFact({ confidence: 1.0, created_at: "2024-01-01T00:00:00Z" });
    const decayed = computeDecayedConfidence(fact, NOW);
    expect(decayed).toBeLessThan(1.0);
    expect(decayed).toBeGreaterThan(0);
  });

  test("does not decay recent facts significantly", () => {
    const fact = makeFact({ confidence: 1.0, created_at: "2026-06-19T00:00:00Z" });
    const decayed = computeDecayedConfidence(fact, NOW);
    expect(decayed).toBeCloseTo(1.0, 1);
  });

  test("respects min_confidence floor", () => {
    const fact = makeFact({ confidence: 1.0, created_at: "2020-01-01T00:00:00Z" });
    const decayed = computeDecayedConfidence(fact, NOW);
    const config = DECAY_CONFIGS.brain_page;
    expect(decayed).toBeGreaterThanOrEqual(config.min_confidence);
  });

  test("does not exceed max_confidence", () => {
    const fact = makeFact({ confidence: 2.0, created_at: NOW.toISOString() });
    const decayed = computeDecayedConfidence(fact, NOW);
    expect(decayed).toBeLessThanOrEqual(DECAY_CONFIGS.brain_page.max_confidence);
  });

  test("fact created now has full confidence", () => {
    const fact = makeFact({ confidence: 0.9, created_at: NOW.toISOString() });
    expect(computeDecayedConfidence(fact, NOW)).toBe(0.9);
  });

  test("different entity classes have different decay rates", () => {
    const oldDate = "2024-01-01T00:00:00Z";
    const brainFact = makeFact({ entity_class: "brain_page", created_at: oldDate });
    const aiFact = makeFact({ entity_class: "ai_run", created_at: oldDate });
    const brainDecayed = computeDecayedConfidence(brainFact, NOW);
    const aiDecayed = computeDecayedConfidence(aiFact, NOW);
    // ai_run has 90-day half-life vs 365 for brain_page → decays faster
    expect(aiDecayed).toBeLessThan(brainDecayed);
  });
});

// ── applyDecay ────────────────────────────────────────────────────────

describe("applyDecay", () => {
  test("applies decay to eligible fact", () => {
    const fact = makeFact({ confidence: 1.0, created_at: "2024-01-01T00:00:00Z" });
    const result = applyDecay(fact, NOW);
    expect(result.applied).toBe(true);
    expect(result.new_confidence).toBeLessThan(1.0);
    expect(result.old_confidence).toBe(1.0);
    expect(result.decay_rate).toBeGreaterThan(0);
  });

  test("does not apply decay to forgotten fact", () => {
    const fact = makeFact({ forgotten: true });
    const result = applyDecay(fact, NOW);
    expect(result.applied).toBe(false);
    expect(result.reason).toBe("forgotten");
    expect(result.new_confidence).toBe(0);
  });

  test("does not apply decay to legal-hold fact", () => {
    const fact = makeFact({ confidence: 0.8, legal_hold: true });
    const result = applyDecay(fact, NOW);
    expect(result.applied).toBe(false);
    expect(result.reason).toBe("legal_hold_active");
    expect(result.new_confidence).toBe(0.8);
  });

  test("no change for recent facts", () => {
    const fact = makeFact({ confidence: 1.0, created_at: NOW.toISOString() });
    const result = applyDecay(fact, NOW);
    expect(result.applied).toBe(false);
    expect(result.reason).toBe("no_change");
  });

  test("decay_rate is 0 when no change", () => {
    const fact = makeFact({ confidence: 0.5, legal_hold: true });
    const result = applyDecay(fact, NOW);
    expect(result.decay_rate).toBe(0);
  });
});

// ── batchDecay ────────────────────────────────────────────────────────

describe("batchDecay", () => {
  test("processes multiple facts", () => {
    const facts = [
      makeFact({ id: "f1", confidence: 1.0, created_at: "2024-01-01T00:00:00Z" }),
      makeFact({ id: "f2", confidence: 0.8, created_at: NOW.toISOString() }),
      makeFact({ id: "f3", confidence: 0.9, legal_hold: true }),
    ];
    const { results, updated } = batchDecay(facts, NOW);
    expect(results).toHaveLength(3);
    expect(updated).toHaveLength(3);
  });

  test("updates confidence for decayed facts", () => {
    const facts = [
      makeFact({ id: "f1", confidence: 1.0, created_at: "2024-01-01T00:00:00Z" }),
    ];
    const { updated } = batchDecay(facts, NOW);
    expect(updated[0].confidence).toBeLessThan(1.0);
    expect(updated[0].last_decay_at).toBe(NOW.toISOString());
  });

  test("does not update non-decayed facts", () => {
    const facts = [
      makeFact({ id: "f1", confidence: 0.8, legal_hold: true }),
    ];
    const { updated } = batchDecay(facts, NOW);
    expect(updated[0].confidence).toBe(0.8);
    expect(updated[0].last_decay_at).toBeUndefined();
  });

  test("empty array → empty results", () => {
    const { results, updated } = batchDecay([], NOW);
    expect(results).toHaveLength(0);
    expect(updated).toHaveLength(0);
  });
});

// ── getDecayEligibility ───────────────────────────────────────────────

describe("getDecayEligibility", () => {
  test("eligible for old fact without legal hold", () => {
    const fact = makeFact({ confidence: 1.0, created_at: "2024-01-01T00:00:00Z" });
    const eligibility = getDecayEligibility(fact, NOW);
    expect(eligibility.eligible).toBe(true);
    expect(eligibility.reason).toBe("decay_eligible");
  });

  test("not eligible for forgotten fact", () => {
    const fact = makeFact({ forgotten: true });
    const eligibility = getDecayEligibility(fact, NOW);
    expect(eligibility.eligible).toBe(false);
    expect(eligibility.reason).toBe("forgotten");
  });

  test("not eligible for legal-hold fact", () => {
    const fact = makeFact({ legal_hold: true });
    const eligibility = getDecayEligibility(fact, NOW);
    expect(eligibility.eligible).toBe(false);
    expect(eligibility.reason).toBe("legal_hold_active");
  });

  test("not eligible when no decay needed", () => {
    const fact = makeFact({ confidence: 1.0, created_at: NOW.toISOString() });
    const eligibility = getDecayEligibility(fact, NOW);
    expect(eligibility.eligible).toBe(false);
    expect(eligibility.reason).toBe("no_decay_needed");
  });
});

// ── getDecayStats ─────────────────────────────────────────────────────

describe("getDecayStats", () => {
  test("computes stats for mixed facts", () => {
    const facts = [
      makeFact({ id: "f1", confidence: 1.0, created_at: "2024-01-01T00:00:00Z" }),
      makeFact({ id: "f2", confidence: 0.8, legal_hold: true }),
      makeFact({ id: "f3", confidence: 0.5, forgotten: true }),
      makeFact({ id: "f4", confidence: 0.9, created_at: NOW.toISOString() }),
    ];
    const stats = getDecayStats(facts, NOW);
    expect(stats.total).toBe(4);
    expect(stats.frozen).toBe(1);
    expect(stats.forgotten).toBe(1);
    expect(stats.avg_confidence).toBeCloseTo(0.8, 1); // (1.0+0.8+0.5+0.9)/4
  });

  test("empty array → zero stats", () => {
    const stats = getDecayStats([], NOW);
    expect(stats.total).toBe(0);
    expect(stats.avg_confidence).toBe(0);
    expect(stats.avg_decayed_confidence).toBe(0);
  });

  test("all legal hold → all frozen", () => {
    const facts = [
      makeFact({ id: "f1", confidence: 0.9, legal_hold: true }),
      makeFact({ id: "f2", confidence: 0.8, legal_hold: true }),
    ];
    const stats = getDecayStats(facts, NOW);
    expect(stats.frozen).toBe(2);
    expect(stats.decayed).toBe(0);
  });

  test("all forgotten → all forgotten", () => {
    const facts = [
      makeFact({ id: "f1", forgotten: true }),
      makeFact({ id: "f2", forgotten: true }),
    ];
    const stats = getDecayStats(facts, NOW);
    expect(stats.forgotten).toBe(2);
  });

  test("avg_decayed_confidence <= avg_confidence", () => {
    const facts = [
      makeFact({ id: "f1", confidence: 1.0, created_at: "2024-01-01T00:00:00Z" }),
      makeFact({ id: "f2", confidence: 1.0, created_at: "2024-01-01T00:00:00Z" }),
    ];
    const stats = getDecayStats(facts, NOW);
    expect(stats.avg_decayed_confidence).toBeLessThanOrEqual(stats.avg_confidence);
  });
});

// ── DECAY_CONFIGS ─────────────────────────────────────────────────────

describe("DECAY_CONFIGS", () => {
  test("all entity classes have configs", () => {
    const classes: EntityClass[] = ["brain_page", "relational_table", "file_object", "event_audit", "ai_run"];
    for (const ec of classes) {
      expect(DECAY_CONFIGS[ec]).toBeDefined();
      expect(DECAY_CONFIGS[ec].half_life_days).toBeGreaterThan(0);
      expect(DECAY_CONFIGS[ec].min_confidence).toBeGreaterThanOrEqual(0);
      expect(DECAY_CONFIGS[ec].max_confidence).toBeLessThanOrEqual(1.0);
    }
  });

  test("ai_run has shortest half-life (transient)", () => {
    expect(DECAY_CONFIGS.ai_run.half_life_days).toBeLessThan(DECAY_CONFIGS.brain_page.half_life_days);
  });

  test("event_audit has longest half-life (audit records persist)", () => {
    expect(DECAY_CONFIGS.event_audit.half_life_days).toBeGreaterThan(DECAY_CONFIGS.brain_page.half_life_days);
  });

  test("min_confidence <= max_confidence for all classes", () => {
    for (const config of Object.values(DECAY_CONFIGS)) {
      expect(config.min_confidence).toBeLessThanOrEqual(config.max_confidence);
    }
  });
});

// ── Legal Hold + Decay Interaction ────────────────────────────────────

describe("Legal Hold + Decay Interaction", () => {
  test("legal hold freezes decay completely", () => {
    const fact = makeFact({ confidence: 0.9, legal_hold: true, created_at: "2020-01-01T00:00:00Z" });
    const decayed = computeDecayedConfidence(fact, NOW);
    expect(decayed).toBe(0.9); // unchanged despite being very old
  });

  test("decay resumes after legal hold lifted", () => {
    const factWithHold = makeFact({ confidence: 0.9, legal_hold: true, created_at: "2020-01-01T00:00:00Z" });
    expect(computeDecayedConfidence(factWithHold, NOW)).toBe(0.9);

    const factWithoutHold = makeFact({ confidence: 0.9, legal_hold: false, created_at: "2020-01-01T00:00:00Z" });
    const decayed = computeDecayedConfidence(factWithoutHold, NOW);
    expect(decayed).toBeLessThan(0.9);
  });

  test("forgotten fact has 0 confidence regardless of legal hold", () => {
    const fact = makeFact({ forgotten: true, legal_hold: true, confidence: 0.9 });
    expect(computeDecayedConfidence(fact, NOW)).toBe(0);
  });
});
