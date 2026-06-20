import { describe, it, expect } from "vitest";
import {
  isLegalHoldActive,
  canForget,
  forgetFact,
  restoreFact,
  nextDecayedConfidence,
  daysSinceLastAccess,
  shouldDecay,
  decayFact,
  batchForget,
  batchDecay,
  createAuditEntry,
  DECAY_THRESHOLDS,
  type FactEntry,
} from "@/lib/facts-forget-decay";

// ── Fixtures ──────────────────────────────────────────────────────────

const NOW = new Date("2026-06-20T12:00:00Z");
const OLD_DATE = "2025-01-01T00:00:00Z";
const RECENT_DATE = "2026-06-19T00:00:00Z";

function makeFact(overrides: Partial<FactEntry> = {}): FactEntry {
  return {
    id: "fact-1",
    slug: "cases/test",
    statement: "Test fact",
    source: "case_frontmatter",
    confidence: "high",
    created_at: OLD_DATE,
    entity_class: "ai_run", // P90D retention → expired by NOW
    ...overrides,
  };
}

const FACT_LEGAL_HOLD = makeFact({ id: "fact-lh", legal_hold: true });
const FACT_NO_HOLD = makeFact({ id: "fact-nohold", legal_hold: false });
const FACT_RECENT = makeFact({
  id: "fact-recent",
  created_at: RECENT_DATE,
  last_accessed_at: RECENT_DATE,
  entity_class: "brain_page", // indefinite retention → never expires
});

// ── isLegalHoldActive ─────────────────────────────────────────────────

describe("isLegalHoldActive", () => {
  it("returns true when legal_hold is true", () => {
    expect(isLegalHoldActive(FACT_LEGAL_HOLD)).toBe(true);
  });

  it("returns false when legal_hold is false", () => {
    expect(isLegalHoldActive(FACT_NO_HOLD)).toBe(false);
  });

  it("returns false when legal_hold is undefined", () => {
    expect(isLegalHoldActive(makeFact({ legal_hold: undefined }))).toBe(false);
  });
});

// ── canForget ─────────────────────────────────────────────────────────

describe("canForget", () => {
  it("blocks forget when legal hold is active", () => {
    const result = canForget(FACT_LEGAL_HOLD, NOW);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("legal_hold_active");
  });

  it("blocks forget when retention has not expired", () => {
    const result = canForget(FACT_RECENT, NOW);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("retention_not_expired");
  });

  it("allows forget when retention has expired and no legal hold", () => {
    const result = canForget(FACT_NO_HOLD, NOW);
    expect(result.allowed).toBe(true);
    expect(result.reason).toBe("retention_expired");
  });

  it("blocks forget when retention action is keep", () => {
    const fact = makeFact({ entity_class: "brain_page" }); // indefinite, keep
    // brain_page has indefinite retention → never expires
    const result = canForget(fact, NOW);
    expect(result.allowed).toBe(false);
  });

  it("legal hold overrides expired retention", () => {
    const fact = makeFact({ legal_hold: true, entity_class: "ai_run" });
    const result = canForget(fact, NOW);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("legal_hold_active");
  });
});

// ── forgetFact ────────────────────────────────────────────────────────

describe("forgetFact", () => {
  it("forgets fact when allowed", () => {
    const result = forgetFact(FACT_NO_HOLD, "user-1", NOW);
    expect(result.action).toBe("forgotten");
    expect(result.audited).toBe(true);
    expect(result.reversible).toBe(true);
  });

  it("skips forget when legal hold is active", () => {
    const result = forgetFact(FACT_LEGAL_HOLD, "user-1", NOW);
    expect(result.action).toBe("skipped_legal_hold");
    expect(result.reversible).toBe(true);
  });

  it("skips forget when retention not expired", () => {
    const result = forgetFact(FACT_RECENT, "user-1", NOW);
    expect(result.action).toBe("skipped_not_expired");
  });

  it("records timestamp", () => {
    const result = forgetFact(FACT_NO_HOLD, "user-1", NOW);
    expect(result.timestamp).toBe(NOW.toISOString());
  });
});

// ── restoreFact ───────────────────────────────────────────────────────

describe("restoreFact", () => {
  it("restores a forgotten fact", () => {
    const result = restoreFact(FACT_NO_HOLD, "user-1", NOW);
    expect(result.restored).toBe(true);
    expect(result.fact_id).toBe(FACT_NO_HOLD.id);
  });

  it("records timestamp", () => {
    const result = restoreFact(FACT_NO_HOLD, "user-1", NOW);
    expect(result.timestamp).toBe(NOW.toISOString());
  });
});

// ── nextDecayedConfidence ─────────────────────────────────────────────

describe("nextDecayedConfidence", () => {
  it("high → medium", () => {
    expect(nextDecayedConfidence("high")).toBe("medium");
  });

  it("medium → low", () => {
    expect(nextDecayedConfidence("medium")).toBe("low");
  });

  it("low → null (no further decay)", () => {
    expect(nextDecayedConfidence("low")).toBeNull();
  });
});

// ── daysSinceLastAccess ───────────────────────────────────────────────

describe("daysSinceLastAccess", () => {
  it("calculates days since last_accessed_at", () => {
    const fact = makeFact({ last_accessed_at: "2026-06-10T00:00:00Z" });
    expect(daysSinceLastAccess(fact, NOW)).toBe(10);
  });

  it("falls back to created_at when no last_accessed_at", () => {
    const fact = makeFact({ created_at: "2026-06-10T00:00:00Z", last_accessed_at: undefined });
    expect(daysSinceLastAccess(fact, NOW)).toBe(10);
  });

  it("returns 0 for same-day access", () => {
    const fact = makeFact({ last_accessed_at: NOW.toISOString() });
    expect(daysSinceLastAccess(fact, NOW)).toBe(0);
  });
});

// ── shouldDecay ───────────────────────────────────────────────────────

describe("shouldDecay", () => {
  it("blocks decay when legal hold is active", () => {
    const result = shouldDecay(FACT_LEGAL_HOLD, NOW);
    expect(result.decay).toBe(false);
    expect(result.reason).toBe("legal_hold_active");
  });

  it("decays high → medium after 90 days", () => {
    const fact = makeFact({
      confidence: "high",
      last_accessed_at: "2026-03-01T00:00:00Z", // > 90 days ago
    });
    const result = shouldDecay(fact, NOW);
    expect(result.decay).toBe(true);
    expect(result.newConfidence).toBe("medium");
  });

  it("does not decay high before 90 days", () => {
    const fact = makeFact({
      confidence: "high",
      last_accessed_at: "2026-05-01T00:00:00Z", // < 90 days ago
    });
    const result = shouldDecay(fact, NOW);
    expect(result.decay).toBe(false);
  });

  it("decays medium → low after 180 days", () => {
    const fact = makeFact({
      confidence: "medium",
      last_accessed_at: "2025-12-01T00:00:00Z", // > 180 days ago
    });
    const result = shouldDecay(fact, NOW);
    expect(result.decay).toBe(true);
    expect(result.newConfidence).toBe("low");
  });

  it("does not decay low (already at lowest)", () => {
    const fact = makeFact({
      confidence: "low",
      last_accessed_at: RECENT_DATE,
    });
    const result = shouldDecay(fact, NOW);
    expect(result.decay).toBe(false);
    expect(result.reason).toBe("already_at_low");
  });

  it("marks as forget candidate after 365 days at low", () => {
    const fact = makeFact({
      confidence: "low",
      last_accessed_at: "2025-01-01T00:00:00Z", // > 365 days
    });
    const result = shouldDecay(fact, NOW);
    expect(result.decay).toBe(false);
    expect(result.reason).toBe("forget_candidate");
  });

  it("legal hold blocks decay even if threshold reached", () => {
    const fact = makeFact({
      confidence: "high",
      legal_hold: true,
      last_accessed_at: OLD_DATE,
    });
    const result = shouldDecay(fact, NOW);
    expect(result.decay).toBe(false);
    expect(result.reason).toBe("legal_hold_active");
  });
});

// ── decayFact ─────────────────────────────────────────────────────────

describe("decayFact", () => {
  it("decays fact when threshold reached", () => {
    const fact = makeFact({
      confidence: "high",
      last_accessed_at: "2026-01-01T00:00:00Z", // > 90 days
    });
    const result = decayFact(fact, NOW);
    expect(result.decayed).toBe(true);
    expect(result.previous_confidence).toBe("high");
    expect(result.new_confidence).toBe("medium");
  });

  it("does not decay when threshold not reached", () => {
    const fact = makeFact({
      confidence: "high",
      last_accessed_at: RECENT_DATE,
    });
    const result = decayFact(fact, NOW);
    expect(result.decayed).toBe(false);
    expect(result.new_confidence).toBe("high");
  });

  it("does not decay when legal hold active", () => {
    const fact = makeFact({
      confidence: "high",
      legal_hold: true,
      last_accessed_at: OLD_DATE,
    });
    const result = decayFact(fact, NOW);
    expect(result.decayed).toBe(false);
    expect(result.reason).toBe("legal_hold_active");
  });

  it("records timestamp", () => {
    const fact = makeFact({
      confidence: "high",
      last_accessed_at: OLD_DATE,
    });
    const result = decayFact(fact, NOW);
    expect(result.timestamp).toBe(NOW.toISOString());
  });
});

// ── batchForget ───────────────────────────────────────────────────────

describe("batchForget", () => {
  it("processes multiple facts", () => {
    const facts = [
      makeFact({ id: "f1", entity_class: "ai_run" }), // expired
      makeFact({ id: "f2", legal_hold: true, entity_class: "ai_run" }), // legal hold
      makeFact({ id: "f3", entity_class: "brain_page" }), // indefinite
    ];
    const result = batchForget(facts, "user-1", NOW);
    expect(result.total).toBe(3);
    expect(result.forgotten).toHaveLength(1);
    expect(result.forgotten[0]).toBe("f1");
    expect(result.legal_hold_blocked).toHaveLength(1);
    expect(result.legal_hold_blocked[0]).toBe("f2");
    expect(result.skipped).toHaveLength(1);
    expect(result.audited).toBe(true);
  });

  it("empty array → zero results", () => {
    const result = batchForget([], "user-1", NOW);
    expect(result.total).toBe(0);
    expect(result.forgotten).toHaveLength(0);
  });
});

// ── batchDecay ────────────────────────────────────────────────────────

describe("batchDecay", () => {
  it("decays eligible facts", () => {
    const facts = [
      makeFact({ id: "f1", confidence: "high", last_accessed_at: "2026-01-01T00:00:00Z" }),
      makeFact({ id: "f2", confidence: "high", last_accessed_at: RECENT_DATE }),
      makeFact({ id: "f3", confidence: "high", legal_hold: true, last_accessed_at: OLD_DATE }),
    ];
    const result = batchDecay(facts, NOW);
    expect(result.total).toBe(3);
    expect(result.decayed).toHaveLength(1);
    expect(result.decayed[0].fact_id).toBe("f1");
    expect(result.decayed[0].previous).toBe("high");
    expect(result.decayed[0].new).toBe("medium");
    expect(result.legal_hold_blocked).toHaveLength(1);
    expect(result.skipped).toHaveLength(1);
  });

  it("empty array → zero results", () => {
    const result = batchDecay([], NOW);
    expect(result.total).toBe(0);
  });
});

// ── createAuditEntry ──────────────────────────────────────────────────

describe("createAuditEntry", () => {
  it("creates audit entry for forget action", () => {
    const entry = createAuditEntry(FACT_NO_HOLD, "forget", "user-1", NOW);
    expect(entry.fact_id).toBe(FACT_NO_HOLD.id);
    expect(entry.action).toBe("forget");
    expect(entry.actor).toBe("user-1");
    expect(entry.reversible).toBe(true);
    expect(entry.previous_state).toEqual(FACT_NO_HOLD);
  });

  it("creates audit entry for restore action", () => {
    const entry = createAuditEntry(FACT_NO_HOLD, "restore", "user-1", NOW);
    expect(entry.action).toBe("restore");
    expect(entry.reversible).toBe(true);
  });

  it("creates audit entry for decay action", () => {
    const entry = createAuditEntry(FACT_NO_HOLD, "decay", "system", NOW, "days_120");
    expect(entry.action).toBe("decay");
    expect(entry.reason).toBe("days_120");
  });

  it("creates audit entry for legal_hold_block", () => {
    const entry = createAuditEntry(FACT_LEGAL_HOLD, "legal_hold_block", "user-1", NOW);
    expect(entry.action).toBe("legal_hold_block");
    expect(entry.reversible).toBe(false);
  });

  it("has unique id", () => {
    const entry1 = createAuditEntry(FACT_NO_HOLD, "forget", "user-1", NOW);
    const entry2 = createAuditEntry(FACT_NO_HOLD, "forget", "user-1", new Date("2026-06-20T13:00:00Z"));
    expect(entry1.id).not.toBe(entry2.id);
  });
});

// ── DECAY_THRESHOLDS ──────────────────────────────────────────────────

describe("DECAY_THRESHOLDS", () => {
  it("has 3 thresholds", () => {
    expect(Object.keys(DECAY_THRESHOLDS)).toHaveLength(3);
  });

  it("high_to_medium is 90 days", () => {
    expect(DECAY_THRESHOLDS.high_to_medium).toBe(90);
  });

  it("medium_to_low is 180 days", () => {
    expect(DECAY_THRESHOLDS.medium_to_low).toBe(180);
  });

  it("low_to_forget is 365 days", () => {
    expect(DECAY_THRESHOLDS.low_to_forget).toBe(365);
  });
});

// ── Legal Hold Override ───────────────────────────────────────────────

describe("Legal Hold Override", () => {
  it("legal hold overrides forget even when retention expired", () => {
    const fact = makeFact({ legal_hold: true, entity_class: "ai_run" });
    expect(canForget(fact, NOW).allowed).toBe(false);
  });

  it("legal hold overrides decay even when threshold reached", () => {
    const fact = makeFact({
      legal_hold: true,
      confidence: "high",
      last_accessed_at: OLD_DATE,
    });
    expect(shouldDecay(fact, NOW).decay).toBe(false);
  });

  it("removing legal hold allows forget", () => {
    const fact = makeFact({ legal_hold: false, entity_class: "ai_run" });
    expect(canForget(fact, NOW).allowed).toBe(true);
  });

  it("removing legal hold allows decay", () => {
    const fact = makeFact({
      legal_hold: false,
      confidence: "high",
      last_accessed_at: OLD_DATE,
    });
    expect(shouldDecay(fact, NOW).decay).toBe(true);
  });
});
