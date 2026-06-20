/**
 * Facts Retention & Decay Tests — P0-BRAIN-012
 *
 * Verifiziert:
 *   1. forgetFact — Legal Hold blockiert, Retention blockiert, PII anonymisiert, Soft-Delete
 *   2. decayFact — Legal Hold friert Decay ein, Auto-Forget bei hohem Decay
 *   3. restoreFact — Wiederherstellung von forgotten/anonymized
 *   4. Legal Hold Management — apply/release
 *   5. Audit Log — alle Aktionen auditierbar
 *   6. Helpers — isRetentionExpired, parseISODurationToMs, anonymizeContent
 *   7. facts-decay.ts — computeDecayedConfidence, applyDecay, batchDecay, getDecayStats
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  forgetFact,
  decayFact,
  decayBatch,
  restoreFact,
  applyLegalHold,
  releaseLegalHold,
  computeDecayLevel,
  isRetentionExpired,
  parseISODurationToMs,
  anonymizeContent,
  createFactRecord,
  FactAuditLog,
  DEFAULT_CONFIG,
  type FactRecord,
  type ForgetDecayConfig,
} from "@/lib/facts-retention";
import {
  computeDecayedConfidence,
  applyDecay,
  batchDecay,
  getDecayEligibility,
  getDecayStats,
  DECAY_CONFIGS,
  type DecayableFact,
} from "@/lib/facts-decay";

// ── 1. forgetFact ─────────────────────────────────────────────────────

describe("forgetFact", () => {
  it("soft-deletes an active fact without PII", () => {
    const fact = createFactRecord({ has_pii: false });
    const auditLog = new FactAuditLog();
    const result = forgetFact(fact, { fact_id: fact.id, reason: "user_request", requested_by: "user-1" }, DEFAULT_CONFIG, auditLog);
    expect(result.success).toBe(true);
    expect(result.action).toBe("forgotten");
    expect(fact.status).toBe("forgotten");
    expect(fact.forgotten_at).toBeTruthy();
    expect(auditLog.count()).toBe(1);
  });

  it("anonymizes PII facts instead of deleting", () => {
    const fact = createFactRecord({ has_pii: true, content: "Contact: max@example.com, Tel: 0301234567" });
    const result = forgetFact(fact, { fact_id: fact.id, reason: "gdpr_article_17", requested_by: "user-1" });
    expect(result.success).toBe(true);
    expect(result.action).toBe("anonymized");
    expect(fact.status).toBe("anonymized");
    expect(fact.content).not.toContain("max@example.com");
    expect(fact.anonymized_at).toBeTruthy();
  });

  it("blocks forget when legal_hold is active", () => {
    const fact = createFactRecord({ legal_hold: true });
    const result = forgetFact(fact, { fact_id: fact.id, reason: "user_request", requested_by: "user-1" });
    expect(result.success).toBe(false);
    expect(result.action).toBe("blocked_legal_hold");
    expect(fact.status).toBe("active");
  });

  it("blocks forget when retention policy is active", () => {
    const fact = createFactRecord({
      created_at: new Date().toISOString(),
      retention: { retention: "P10Y", action: "keep", legal_basis: "§ 147 AO" },
    });
    const result = forgetFact(fact, { fact_id: fact.id, reason: "user_request", requested_by: "user-1" });
    expect(result.success).toBe(false);
    expect(result.action).toBe("blocked_retention");
  });

  it("allows forget with force=true even if retention active", () => {
    const fact = createFactRecord({
      retention: { retention: "P10Y", action: "keep", legal_basis: "§ 147 AO" },
    });
    const result = forgetFact(fact, { fact_id: fact.id, reason: "manual", requested_by: "admin", force: true });
    expect(result.success).toBe(true);
    expect(result.action).toBe("forgotten");
  });

  it("allows forget when retention has expired", () => {
    const fact = createFactRecord({
      created_at: "2020-01-01T00:00:00Z",
      retention: { retention: "P1Y", action: "delete", legal_basis: "GDPR Art. 17" },
    });
    const result = forgetFact(fact, { fact_id: fact.id, reason: "retention_expired", requested_by: "system" });
    expect(result.success).toBe(true);
  });

  it("legal_hold blocks even with force=true", () => {
    const fact = createFactRecord({ legal_hold: true });
    const result = forgetFact(fact, { fact_id: fact.id, reason: "manual", requested_by: "admin", force: true });
    expect(result.success).toBe(false);
    expect(result.action).toBe("blocked_legal_hold");
  });

  it("audits every forget action", () => {
    const fact = createFactRecord();
    const auditLog = new FactAuditLog();
    forgetFact(fact, { fact_id: fact.id, reason: "user_request", requested_by: "user-1" }, DEFAULT_CONFIG, auditLog);
    const entries = auditLog.getEntries(fact.id);
    expect(entries).toHaveLength(1);
    expect(entries[0].action).toBe("forget");
    expect(entries[0].actor).toBe("user-1");
    expect(entries[0].reversible).toBe(true);
  });

  it("audits blocked legal_hold attempt", () => {
    const fact = createFactRecord({ legal_hold: true });
    const auditLog = new FactAuditLog();
    forgetFact(fact, { fact_id: fact.id, reason: "user_request", requested_by: "user-1" }, DEFAULT_CONFIG, auditLog);
    const entries = auditLog.getEntries(fact.id);
    expect(entries).toHaveLength(1);
    expect(entries[0].details?.blocked_by).toBe("legal_hold");
  });
});

// ── 2. decayFact ──────────────────────────────────────────────────────

describe("decayFact", () => {
  it("increases decay level for old facts", () => {
    const oldFact = createFactRecord({
      last_accessed_at: "2024-01-01T00:00:00Z",
    });
    const now = new Date("2024-04-01T00:00:00Z"); // 91 days later
    const result = decayFact(oldFact, DEFAULT_CONFIG, undefined, now);
    expect(result.decayed).toBe(true);
    expect(result.new_level).toBeGreaterThan(result.previous_level);
  });

  it("does not decay facts under legal hold", () => {
    const fact = createFactRecord({
      legal_hold: true,
      last_accessed_at: "2020-01-01T00:00:00Z",
    });
    const now = new Date("2024-01-01T00:00:00Z");
    const result = decayFact(fact, DEFAULT_CONFIG, undefined, now);
    expect(result.decayed).toBe(false);
    expect(result.reason).toContain("legal_hold");
  });

  it("does not decay already forgotten facts", () => {
    const fact = createFactRecord({
      status: "forgotten",
      last_accessed_at: "2020-01-01T00:00:00Z",
    });
    const result = decayFact(fact, DEFAULT_CONFIG, undefined, new Date("2024-01-01T00:00:00Z"));
    expect(result.decayed).toBe(false);
  });

  it("auto-forgets when decay exceeds threshold", () => {
    const fact = createFactRecord({
      last_accessed_at: "2023-01-01T00:00:00Z",
    });
    const now = new Date("2024-01-01T00:00:00Z"); // > 1 year
    const result = decayFact(fact, DEFAULT_CONFIG, undefined, now);
    expect(fact.status).toBe("forgotten");
    expect(result.reason).toContain("auto-forgotten");
  });

  it("fresh facts have low decay", () => {
    const fact = createFactRecord({
      last_accessed_at: new Date().toISOString(),
    });
    const result = decayFact(fact);
    expect(result.new_level).toBeLessThan(0.1);
    expect(result.decayed).toBe(false);
  });
});

// ── 3. decayBatch ─────────────────────────────────────────────────────

describe("decayBatch", () => {
  it("processes multiple facts", () => {
    const facts = [
      createFactRecord({ last_accessed_at: new Date().toISOString() }),
      createFactRecord({ last_accessed_at: "2020-01-01T00:00:00Z" }),
      createFactRecord({ legal_hold: true, last_accessed_at: "2020-01-01T00:00:00Z" }),
    ];
    const results = decayBatch(facts);
    expect(results).toHaveLength(3);
    expect(results[0].decayed).toBe(false); // fresh
    expect(results[1].decayed).toBe(true); // old
    expect(results[2].decayed).toBe(false); // legal hold
  });
});

// ── 4. restoreFact ────────────────────────────────────────────────────

describe("restoreFact", () => {
  it("restores a forgotten fact", () => {
    const fact = createFactRecord({ status: "forgotten", forgotten_at: "2024-01-01T00:00:00Z" });
    const result = restoreFact(fact, "admin-1");
    expect(result.success).toBe(true);
    expect(result.new_status).toBe("active");
    expect(fact.status).toBe("active");
    expect(fact.forgotten_at).toBeNull();
  });

  it("restores an anonymized fact with original content", () => {
    const fact = createFactRecord({ status: "anonymized", content: "[EMAIL_REDACTED]" });
    const result = restoreFact(fact, "admin-1", "original content");
    expect(result.success).toBe(true);
    expect(fact.content).toBe("original content");
  });

  it("does not restore an already active fact", () => {
    const fact = createFactRecord({ status: "active" });
    const result = restoreFact(fact, "user-1");
    expect(result.success).toBe(false);
  });

  it("does not restore a legal_hold fact", () => {
    const fact = createFactRecord({ status: "legal_hold", legal_hold: true });
    const result = restoreFact(fact, "user-1");
    expect(result.success).toBe(false);
  });

  it("resets decay_level on restore", () => {
    const fact = createFactRecord({ status: "forgotten", decay_level: 0.8 });
    restoreFact(fact, "admin-1");
    expect(fact.decay_level).toBe(0);
  });

  it("updates last_accessed_at on restore", () => {
    const fact = createFactRecord({ status: "forgotten", last_accessed_at: "2020-01-01T00:00:00Z" });
    restoreFact(fact, "admin-1");
    expect(new Date(fact.last_accessed_at).getTime()).toBeGreaterThan(new Date("2020-01-01T00:00:00Z").getTime());
  });
});

// ── 5. Legal Hold Management ──────────────────────────────────────────

describe("Legal Hold Management", () => {
  it("applyLegalHold sets legal_hold and status", () => {
    const fact = createFactRecord();
    const auditLog = new FactAuditLog();
    applyLegalHold(fact, "admin-1", "pending litigation", auditLog);
    expect(fact.legal_hold).toBe(true);
    expect(fact.status).toBe("legal_hold");
    expect(auditLog.getEntries(fact.id)).toHaveLength(1);
    expect(auditLog.getEntries(fact.id)[0].action).toBe("legal_hold_applied");
  });

  it("releaseLegalHold clears legal_hold and restores active status", () => {
    const fact = createFactRecord({ legal_hold: true, status: "legal_hold" });
    const auditLog = new FactAuditLog();
    releaseLegalHold(fact, "admin-1", "case resolved", auditLog);
    expect(fact.legal_hold).toBe(false);
    expect(fact.status).toBe("active");
    expect(auditLog.getEntries(fact.id)[0].action).toBe("legal_hold_released");
  });

  it("legal hold prevents decay", () => {
    const fact = createFactRecord({ legal_hold: true, last_accessed_at: "2020-01-01T00:00:00Z" });
    const { level } = computeDecayLevel(fact, new Date("2024-01-01T00:00:00Z"));
    expect(level).toBe(0); // frozen at original level
  });

  it("legal hold prevents forget even with force", () => {
    const fact = createFactRecord({ legal_hold: true });
    const result = forgetFact(fact, { fact_id: fact.id, reason: "manual", requested_by: "admin", force: true });
    expect(result.success).toBe(false);
    expect(result.action).toBe("blocked_legal_hold");
  });
});

// ── 6. Audit Log ──────────────────────────────────────────────────────

describe("FactAuditLog", () => {
  it("logs entries with id and timestamp", () => {
    const log = new FactAuditLog();
    const entry = log.log({ action: "forget", fact_id: "f1", actor: "user", reason: "test", reversible: true });
    expect(entry.id).toBeTruthy();
    expect(entry.timestamp).toBeTruthy();
  });

  it("filters entries by fact_id", () => {
    const log = new FactAuditLog();
    log.log({ action: "forget", fact_id: "f1", actor: "u", reason: "r", reversible: true });
    log.log({ action: "decay", fact_id: "f2", actor: "u", reason: "r", reversible: true });
    expect(log.getEntries("f1")).toHaveLength(1);
    expect(log.getEntries("f2")).toHaveLength(1);
    expect(log.getEntries()).toHaveLength(2);
  });

  it("clears all entries", () => {
    const log = new FactAuditLog();
    log.log({ action: "forget", fact_id: "f1", actor: "u", reason: "r", reversible: true });
    log.clear();
    expect(log.count()).toBe(0);
  });
});

// ── 7. Helpers ────────────────────────────────────────────────────────

describe("isRetentionExpired", () => {
  it("returns true when no retention policy", () => {
    const fact = createFactRecord();
    expect(isRetentionExpired(fact)).toBe(true);
  });

  it("returns false when retention not expired", () => {
    const fact = createFactRecord({
      created_at: new Date().toISOString(),
      retention: { retention: "P10Y", action: "keep", legal_basis: "law" },
    });
    expect(isRetentionExpired(fact)).toBe(false);
  });

  it("returns true when retention has expired", () => {
    const fact = createFactRecord({
      created_at: "2020-01-01T00:00:00Z",
      retention: { retention: "P1Y", action: "delete", legal_basis: "law" },
    });
    expect(isRetentionExpired(fact)).toBe(true);
  });
});

describe("parseISODurationToMs", () => {
  it("parses P1Y (1 year)", () => {
    expect(parseISODurationToMs("P1Y")).toBe(365 * 24 * 60 * 60 * 1000);
  });

  it("parses P6M (6 months)", () => {
    expect(parseISODurationToMs("P6M")).toBe(6 * 30 * 24 * 60 * 60 * 1000);
  });

  it("parses P30D (30 days)", () => {
    expect(parseISODurationToMs("P30D")).toBe(30 * 24 * 60 * 60 * 1000);
  });

  it("parses PT24H (24 hours)", () => {
    expect(parseISODurationToMs("PT24H")).toBe(24 * 60 * 60 * 1000);
  });

  it("returns 0 for invalid format", () => {
    expect(parseISODurationToMs("invalid")).toBe(0);
  });
});

describe("anonymizeContent", () => {
  it("redacts email addresses", () => {
    const result = anonymizeContent("Contact: max@example.com for details");
    expect(result).toContain("[EMAIL_REDACTED]");
    expect(result).not.toContain("max@example.com");
  });

  it("redacts phone numbers", () => {
    const result = anonymizeContent("Call 030 1234 5678");
    expect(result).toContain("[PHONE_REDACTED]");
  });

  it("redacts dates", () => {
    const result = anonymizeContent("Born on 15.03.1990");
    expect(result).toContain("[DATE_REDACTED]");
  });

  it("redacts full names", () => {
    const result = anonymizeContent("Meeting with Max Mustermann");
    expect(result).toContain("[NAME_REDACTED]");
  });
});

// ── 8. facts-decay.ts ─────────────────────────────────────────────────

describe("facts-decay: computeDecayedConfidence", () => {
  it("returns 0 for forgotten facts", () => {
    const fact: DecayableFact = {
      id: "f1", slug: "cases/test", content: "test", entity_class: "brain_page",
      created_at: new Date().toISOString(), confidence: 0.9, legal_hold: false, forgotten: true,
    };
    expect(computeDecayedConfidence(fact)).toBe(0);
  });

  it("returns original confidence for legal hold facts", () => {
    const fact: DecayableFact = {
      id: "f1", slug: "cases/test", content: "test", entity_class: "brain_page",
      created_at: "2020-01-01T00:00:00Z", confidence: 0.9, legal_hold: true, forgotten: false,
    };
    expect(computeDecayedConfidence(fact)).toBe(0.9);
  });

  it("reduces confidence for old facts", () => {
    const fact: DecayableFact = {
      id: "f1", slug: "cases/test", content: "test", entity_class: "brain_page",
      created_at: "2020-01-01T00:00:00Z", confidence: 1.0, legal_hold: false, forgotten: false,
    };
    const decayed = computeDecayedConfidence(fact, new Date("2024-01-01T00:00:00Z"));
    expect(decayed).toBeLessThan(1.0);
    expect(decayed).toBeGreaterThanOrEqual(DECAY_CONFIGS.brain_page.min_confidence);
  });

  it("respects min_confidence floor", () => {
    const fact: DecayableFact = {
      id: "f1", slug: "cases/test", content: "test", entity_class: "ai_run",
      created_at: "2020-01-01T00:00:00Z", confidence: 1.0, legal_hold: false, forgotten: false,
    };
    const decayed = computeDecayedConfidence(fact, new Date("2024-01-01T00:00:00Z"));
    expect(decayed).toBeGreaterThanOrEqual(DECAY_CONFIGS.ai_run.min_confidence);
  });
});

describe("facts-decay: applyDecay", () => {
  it("returns reason=forgotten for forgotten facts", () => {
    const fact: DecayableFact = {
      id: "f1", slug: "cases/test", content: "test", entity_class: "brain_page",
      created_at: new Date().toISOString(), confidence: 0.9, legal_hold: false, forgotten: true,
    };
    const result = applyDecay(fact);
    expect(result.reason).toBe("forgotten");
    expect(result.new_confidence).toBe(0);
  });

  it("returns reason=legal_hold_active for legal hold facts", () => {
    const fact: DecayableFact = {
      id: "f1", slug: "cases/test", content: "test", entity_class: "brain_page",
      created_at: new Date().toISOString(), confidence: 0.9, legal_hold: true, forgotten: false,
    };
    const result = applyDecay(fact);
    expect(result.reason).toBe("legal_hold_active");
    expect(result.applied).toBe(false);
  });

  it("applies decay for old facts", () => {
    const fact: DecayableFact = {
      id: "f1", slug: "cases/test", content: "test", entity_class: "brain_page",
      created_at: "2020-01-01T00:00:00Z", confidence: 1.0, legal_hold: false, forgotten: false,
    };
    const result = applyDecay(fact, new Date("2024-01-01T00:00:00Z"));
    expect(result.applied).toBe(true);
    expect(result.new_confidence).toBeLessThan(result.old_confidence);
  });
});

describe("facts-decay: batchDecay", () => {
  it("processes multiple facts and updates confidence", () => {
    const facts: DecayableFact[] = [
      { id: "f1", slug: "c", content: "t", entity_class: "brain_page", created_at: "2020-01-01T00:00:00Z", confidence: 1.0, legal_hold: false, forgotten: false },
      { id: "f2", slug: "c", content: "t", entity_class: "brain_page", created_at: new Date().toISOString(), confidence: 1.0, legal_hold: false, forgotten: false },
    ];
    const { results, updated } = batchDecay(facts, new Date("2024-01-01T00:00:00Z"));
    expect(results).toHaveLength(2);
    expect(updated[0].confidence).toBeLessThan(1.0);
    expect(updated[1].confidence).toBe(1.0); // fresh, no decay
  });
});

describe("facts-decay: getDecayEligibility", () => {
  it("returns eligible=false for forgotten", () => {
    const fact: DecayableFact = {
      id: "f1", slug: "c", content: "t", entity_class: "brain_page", created_at: new Date().toISOString(),
      confidence: 0.9, legal_hold: false, forgotten: true,
    };
    expect(getDecayEligibility(fact).eligible).toBe(false);
  });

  it("returns eligible=false for legal hold", () => {
    const fact: DecayableFact = {
      id: "f1", slug: "c", content: "t", entity_class: "brain_page", created_at: new Date().toISOString(),
      confidence: 0.9, legal_hold: true, forgotten: false,
    };
    expect(getDecayEligibility(fact).eligible).toBe(false);
  });

  it("returns eligible=true for old facts", () => {
    const fact: DecayableFact = {
      id: "f1", slug: "c", content: "t", entity_class: "brain_page", created_at: "2020-01-01T00:00:00Z",
      confidence: 1.0, legal_hold: false, forgotten: false,
    };
    expect(getDecayEligibility(fact, new Date("2024-01-01T00:00:00Z")).eligible).toBe(true);
  });
});

describe("facts-decay: getDecayStats", () => {
  it("computes stats correctly", () => {
    const facts: DecayableFact[] = [
      { id: "f1", slug: "c", content: "t", entity_class: "brain_page", created_at: "2020-01-01T00:00:00Z", confidence: 1.0, legal_hold: false, forgotten: false },
      { id: "f2", slug: "c", content: "t", entity_class: "brain_page", created_at: new Date().toISOString(), confidence: 0.8, legal_hold: true, forgotten: false },
      { id: "f3", slug: "c", content: "t", entity_class: "brain_page", created_at: new Date().toISOString(), confidence: 0.5, legal_hold: false, forgotten: true },
    ];
    const stats = getDecayStats(facts, new Date("2024-01-01T00:00:00Z"));
    expect(stats.total).toBe(3);
    expect(stats.decayed).toBe(1);
    expect(stats.frozen).toBe(1);
    expect(stats.forgotten).toBe(1);
  });

  it("returns zeros for empty array", () => {
    const stats = getDecayStats([]);
    expect(stats.total).toBe(0);
    expect(stats.avg_confidence).toBe(0);
  });
});

// ── 9. Edge Cases ─────────────────────────────────────────────────────

describe("Edge Cases", () => {
  it("forgetFact with disabled audit does not log", () => {
    const fact = createFactRecord();
    const auditLog = new FactAuditLog();
    const config: ForgetDecayConfig = { ...DEFAULT_CONFIG, audit_enabled: false };
    forgetFact(fact, { fact_id: fact.id, reason: "manual", requested_by: "u" }, config, auditLog);
    expect(auditLog.count()).toBe(0);
  });

  it("forgetFact with anonymize_pii=false deletes PII fact", () => {
    const fact = createFactRecord({ has_pii: true });
    const config: ForgetDecayConfig = { ...DEFAULT_CONFIG, anonymize_pii: false };
    const result = forgetFact(fact, { fact_id: fact.id, reason: "manual", requested_by: "u" }, config);
    expect(result.action).toBe("forgotten");
    expect(fact.status).toBe("forgotten");
  });

  it("computeDecayLevel returns 0 for fresh fact", () => {
    const fact = createFactRecord({ last_accessed_at: new Date().toISOString() });
    const { level } = computeDecayLevel(fact);
    expect(level).toBeCloseTo(0, 1);
  });

  it("computeDecayLevel returns 1 for very old fact", () => {
    const fact = createFactRecord({ last_accessed_at: "2020-01-01T00:00:00Z" });
    const { level } = computeDecayLevel(fact, new Date("2024-01-01T00:00:00Z"));
    expect(level).toBeCloseTo(1, 0);
  });
});
