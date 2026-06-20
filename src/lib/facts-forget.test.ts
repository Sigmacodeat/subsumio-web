// @vitest-environment node

import { describe, test, expect } from "vitest";
import {
  canForget,
  forget,
  restore,
  applyForget,
  applyRestore,
  getForgetEligibility,
  type ForgettableFact,
} from "@/lib/facts-forget";
import type { EntityClass } from "@/lib/data-classification";

// ── Fixtures ──────────────────────────────────────────────────────────

function makeFact(overrides: Partial<ForgettableFact> = {}): ForgettableFact {
  return {
    id: "fact-1",
    slug: "cases/2026-001/facts/1",
    content: "Mandant war am 15.01.2026 in der Kanzlei.",
    entity_class: "brain_page" as EntityClass,
    created_at: "2024-01-01T00:00:00Z",
    forgotten: false,
    legal_hold: false,
    retention_expired: true,
    ...overrides,
  };
}

const NOW = new Date("2026-06-20T12:00:00Z");
const ACTOR = "user-1";
const REASON = "DSGVO Art. 17 Löschungsbegehren";

// ── canForget ─────────────────────────────────────────────────────────

describe("canForget", () => {
  test("returns true for expired retention, no legal hold, not forgotten", () => {
    expect(canForget(makeFact(), NOW)).toBe(true);
  });

  test("returns false when legal hold is active", () => {
    expect(canForget(makeFact({ legal_hold: true }), NOW)).toBe(false);
  });

  test("returns false when already forgotten", () => {
    expect(canForget(makeFact({ forgotten: true }), NOW)).toBe(false);
  });

  test("returns false when retention not expired (recent fact)", () => {
    expect(canForget(makeFact({ created_at: "2026-06-01T00:00:00Z", retention_expired: false }), NOW)).toBe(false);
  });
});

// ── forget ────────────────────────────────────────────────────────────

describe("forget", () => {
  test("successfully forgets eligible fact", () => {
    const result = forget(makeFact(), ACTOR, REASON, NOW);
    expect(result.success).toBe(true);
    expect(result.action).toBe("forget");
    expect(result.fact_id).toBe("fact-1");
    expect(result.audit_entry.action).toBe("forget");
    expect(result.audit_entry.actor).toBe(ACTOR);
    expect(result.audit_entry.reason).toBe(REASON);
    expect(result.audit_entry.legal_hold_active).toBe(false);
    expect(result.audit_entry.reversible).toBe(true);
  });

  test("blocks forget when legal hold is active", () => {
    const result = forget(makeFact({ legal_hold: true }), ACTOR, REASON, NOW);
    expect(result.success).toBe(false);
    expect(result.action).toBe("forget_blocked");
    expect(result.reason).toBe("legal_hold_active");
    expect(result.audit_entry.action).toBe("forget_blocked");
    expect(result.audit_entry.legal_hold_active).toBe(true);
    expect(result.audit_entry.reversible).toBe(false);
  });

  test("blocks forget when already forgotten", () => {
    const result = forget(makeFact({ forgotten: true }), ACTOR, REASON, NOW);
    expect(result.success).toBe(false);
    expect(result.action).toBe("forget_blocked");
    expect(result.reason).toBe("already_forgotten");
  });

  test("blocks forget when retention not expired", () => {
    const result = forget(makeFact({ created_at: "2026-06-01T00:00:00Z", retention_expired: false }), ACTOR, REASON, NOW);
    expect(result.success).toBe(false);
    expect(result.action).toBe("forget_blocked");
    expect(result.reason).toBe("retention_not_expired");
  });

  test("audit entry has unique id", () => {
    const r1 = forget(makeFact(), ACTOR, REASON, NOW);
    const r2 = forget(makeFact({ id: "fact-2" }), ACTOR, REASON, NOW);
    expect(r1.audit_entry.id).not.toBe(r2.audit_entry.id);
  });

  test("audit entry has timestamp", () => {
    const result = forget(makeFact(), ACTOR, REASON, NOW);
    expect(result.audit_entry.timestamp).toBe(NOW.toISOString());
  });
});

// ── restore ───────────────────────────────────────────────────────────

describe("restore", () => {
  test("restores a forgotten fact", () => {
    const fact = makeFact({ forgotten: true, forgotten_at: "2026-05-01T00:00:00Z" });
    const result = restore(fact, ACTOR, NOW);
    expect(result.success).toBe(true);
    expect(result.action).toBe("restore");
    expect(result.audit_entry.action).toBe("restore");
    expect(result.audit_entry.actor).toBe(ACTOR);
  });

  test("restore audit entry has timestamp", () => {
    const result = restore(makeFact({ forgotten: true }), ACTOR, NOW);
    expect(result.audit_entry.timestamp).toBe(NOW.toISOString());
  });

  test("restore preserves legal_hold in audit", () => {
    const result = restore(makeFact({ forgotten: true, legal_hold: true }), ACTOR, NOW);
    expect(result.audit_entry.legal_hold_active).toBe(true);
  });
});

// ── applyForget / applyRestore ────────────────────────────────────────

describe("applyForget", () => {
  test("applies forget to fact", () => {
    const fact = makeFact();
    const result = forget(fact, ACTOR, REASON, NOW);
    const applied = applyForget(fact, result);
    expect(applied.forgotten).toBe(true);
    expect(applied.forgotten_at).toBe(NOW.toISOString());
    expect(applied.forgotten_reason).toBe(REASON);
    expect(applied.forgotten_by).toBe(ACTOR);
  });

  test("does not modify fact when forget was blocked", () => {
    const fact = makeFact({ legal_hold: true });
    const result = forget(fact, ACTOR, REASON, NOW);
    const applied = applyForget(fact, result);
    expect(applied.forgotten).toBe(false);
    expect(applied.forgotten_at).toBeUndefined();
  });
});

describe("applyRestore", () => {
  test("clears forgotten fields", () => {
    const fact = makeFact({ forgotten: true, forgotten_at: "2026-05-01T00:00:00Z", forgotten_by: ACTOR, forgotten_reason: REASON });
    const restored = applyRestore(fact);
    expect(restored.forgotten).toBe(false);
    expect(restored.forgotten_at).toBeUndefined();
    expect(restored.forgotten_reason).toBeUndefined();
    expect(restored.forgotten_by).toBeUndefined();
  });

  test("preserves other fields", () => {
    const fact = makeFact({ forgotten: true, content: "Test", legal_hold: true });
    const restored = applyRestore(fact);
    expect(restored.content).toBe("Test");
    expect(restored.legal_hold).toBe(true);
  });
});

// ── getForgetEligibility ──────────────────────────────────────────────

describe("getForgetEligibility", () => {
  test("eligible when retention expired and no legal hold", () => {
    const eligibility = getForgetEligibility(makeFact(), NOW);
    expect(eligibility.eligible).toBe(true);
    expect(eligibility.reason).toBe("retention_expired");
  });

  test("not eligible when legal hold active", () => {
    const eligibility = getForgetEligibility(makeFact({ legal_hold: true }), NOW);
    expect(eligibility.eligible).toBe(false);
    expect(eligibility.reason).toBe("legal_hold_active");
    expect(eligibility.retention_action).toBe("keep");
  });

  test("not eligible when already forgotten", () => {
    const eligibility = getForgetEligibility(makeFact({ forgotten: true }), NOW);
    expect(eligibility.eligible).toBe(false);
    expect(eligibility.reason).toBe("already_forgotten");
  });

  test("not eligible when retention not expired", () => {
    const eligibility = getForgetEligibility(makeFact({ created_at: "2026-06-01T00:00:00Z", retention_expired: false }), NOW);
    expect(eligibility.eligible).toBe(false);
    expect(eligibility.reason).toBe("retention_not_expired");
  });

  test("retention_expiry is calculated", () => {
    const eligibility = getForgetEligibility(makeFact(), NOW);
    expect(eligibility.retention_expiry).toBeDefined();
  });
});

// ── Legal Hold Override ───────────────────────────────────────────────

describe("Legal Hold Override", () => {
  test("legal hold blocks forget even if retention expired", () => {
    const fact = makeFact({ legal_hold: true, retention_expired: true });
    expect(canForget(fact, NOW)).toBe(false);
    const result = forget(fact, ACTOR, REASON, NOW);
    expect(result.success).toBe(false);
    expect(result.reason).toBe("legal_hold_active");
  });

  test("legal hold blocks forget for all entity classes", () => {
    const classes: EntityClass[] = ["brain_page", "relational_table", "file_object", "event_audit", "ai_run"];
    for (const ec of classes) {
      const fact = makeFact({ entity_class: ec, legal_hold: true });
      expect(canForget(fact, NOW)).toBe(false);
    }
  });

  test("fact can be forgotten after legal hold is lifted", () => {
    const factWithHold = makeFact({ legal_hold: true });
    expect(canForget(factWithHold, NOW)).toBe(false);

    const factWithoutHold = makeFact({ legal_hold: false });
    expect(canForget(factWithoutHold, NOW)).toBe(true);
  });
});

// ── Reversibility ─────────────────────────────────────────────────────

describe("Reversibility", () => {
  test("forget is reversible via restore", () => {
    const fact = makeFact();
    const forgetResult = forget(fact, ACTOR, REASON, NOW);
    expect(forgetResult.audit_entry.reversible).toBe(true);

    const forgottenFact = applyForget(fact, forgetResult);
    expect(forgottenFact.forgotten).toBe(true);

    const restoreResult = restore(forgottenFact, ACTOR, NOW);
    expect(restoreResult.success).toBe(true);

    const restoredFact = applyRestore(forgottenFact);
    expect(restoredFact.forgotten).toBe(false);
  });

  test("blocked forget is not reversible", () => {
    const fact = makeFact({ legal_hold: true });
    const result = forget(fact, ACTOR, REASON, NOW);
    expect(result.audit_entry.reversible).toBe(false);
  });

  test("restore preserves fact content", () => {
    const fact = makeFact({ content: "Important fact" });
    const forgetResult = forget(fact, ACTOR, REASON, NOW);
    const forgottenFact = applyForget(fact, forgetResult);
    const restoredFact = applyRestore(forgottenFact);
    expect(restoredFact.content).toBe("Important fact");
  });
});

// ── Edge Cases ────────────────────────────────────────────────────────

describe("Edge Cases", () => {
  test("forget with empty reason still works", () => {
    const result = forget(makeFact(), ACTOR, "", NOW);
    expect(result.success).toBe(true);
  });

  test("forget with different actors", () => {
    const r1 = forget(makeFact(), "user-a", REASON, NOW);
    const r2 = forget(makeFact({ id: "fact-2" }), "user-b", REASON, NOW);
    expect(r1.audit_entry.actor).toBe("user-a");
    expect(r2.audit_entry.actor).toBe("user-b");
  });

  test("all entity classes are supported", () => {
    const classes: EntityClass[] = ["brain_page", "relational_table", "file_object", "event_audit", "ai_run"];
    for (const ec of classes) {
      const fact = makeFact({ entity_class: ec });
      const result = forget(fact, ACTOR, REASON, NOW);
      expect(result.success).toBe(true);
    }
  });
});
