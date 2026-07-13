/**
 * Tests for EPIC 8 — T8.4 Queue Reliability
 */
import { describe, it, expect, beforeEach } from "vitest";
import { classifyError, maxRetriesForClass, type RetryClass } from "./retry-class.ts";
import {
  enqueueDeadLetter,
  listDeadLetters,
  getDeadLetterByJobId,
  getDeadLetterStats,
  removeDeadLetter,
  getDLQSize,
  _resetDLQ,
} from "./dlq.ts";
import {
  validateMandatorySubmission,
  shouldFailParentForChild,
  canCancelMandatoryJob,
} from "./mandatory-validator.ts";

// ── Retry Classification Tests ─────────────────────────────────────────

describe("Retry Classification", () => {
  describe("classifyError", () => {
    it("classifies connection errors as transient", () => {
      const result = classifyError(new Error("Connection refused"));
      expect(result.class).toBe("transient");
      expect(result.retryable).toBe(true);
      expect(result.backoffMultiplier).toBe(1);
    });

    it("classifies timeouts as transient", () => {
      const result = classifyError(new Error("statement_timeout"));
      expect(result.class).toBe("transient");
      expect(result.retryable).toBe(true);
    });

    it("classifies rate limits as transient", () => {
      const result = classifyError(new Error("rate limit exceeded (429)"));
      expect(result.class).toBe("transient");
      expect(result.retryable).toBe(true);
    });

    it("classifies circuit breaker as infrastructure", () => {
      const result = classifyError(new Error("ECIRCUITBREAKER"));
      expect(result.class).toBe("infrastructure");
      expect(result.retryable).toBe(true);
      expect(result.backoffMultiplier).toBe(2);
    });

    it("classifies pooler exhaustion as infrastructure", () => {
      const result = classifyError(new Error("EMAXCONNSESSION: too many clients"));
      expect(result.class).toBe("infrastructure");
      expect(result.retryable).toBe(true);
      expect(result.backoffMultiplier).toBe(2);
    });

    it("classifies PgBouncer errors as infrastructure", () => {
      const result = classifyError(new Error("PgBouncer connection closed"));
      expect(result.class).toBe("infrastructure");
      expect(result.retryable).toBe(true);
    });

    it("classifies UnrecoverableError as permanent", () => {
      const err = new Error("handler failed");
      err.name = "UnrecoverableError";
      const result = classifyError(err);
      expect(result.class).toBe("permanent");
      expect(result.retryable).toBe(false);
      expect(result.backoffMultiplier).toBe(0);
    });

    it("classifies validation errors as permanent", () => {
      const result = classifyError(new Error("validation failed: missing field"));
      expect(result.class).toBe("permanent");
      expect(result.retryable).toBe(false);
    });

    it("classifies unique constraint violations as permanent", () => {
      const err = { code: "23505", message: "duplicate key" };
      const result = classifyError(err);
      expect(result.class).toBe("permanent");
      expect(result.retryable).toBe(false);
    });

    it("classifies foreign key violations as permanent", () => {
      const err = { code: "23503", message: "foreign key constraint" };
      const result = classifyError(err);
      expect(result.class).toBe("permanent");
      expect(result.retryable).toBe(false);
    });

    it("classifies unknown errors as transient (safe default)", () => {
      const result = classifyError(new Error("something weird happened"));
      expect(result.class).toBe("transient");
      expect(result.retryable).toBe(true);
    });

    it("classifies SQLSTATE 57014 as transient", () => {
      const err = { code: "57014", message: "canceling statement" };
      const result = classifyError(err);
      expect(result.class).toBe("transient");
      expect(result.retryable).toBe(true);
    });
  });

  describe("maxRetriesForClass", () => {
    it("returns 0 for permanent errors", () => {
      expect(maxRetriesForClass("permanent", 3)).toBe(0);
    });

    it("returns base attempts for transient errors", () => {
      expect(maxRetriesForClass("transient", 3)).toBe(3);
    });

    it("returns doubled attempts for infrastructure errors", () => {
      expect(maxRetriesForClass("infrastructure", 3)).toBe(6);
    });
  });
});

// ── Dead Letter Queue Tests ────────────────────────────────────────────

describe("Dead Letter Queue", () => {
  beforeEach(() => {
    _resetDLQ();
  });

  it("enqueues a dead letter entry", () => {
    const entry = enqueueDeadLetter({
      original_job_id: 42,
      job_name: "sync",
      queue: "default",
      reason: "max_attempts_exceeded",
      error_text: "Connection refused",
      attempts_made: 3,
      stalled_counter: 0,
      retry_class: "transient",
      original_created_at: "2026-07-13T10:00:00Z",
    });
    expect(entry.id).toBeDefined();
    expect(entry.original_job_id).toBe(42);
    expect(entry.reason).toBe("max_attempts_exceeded");
    expect(entry.retry_class).toBe("transient");
  });

  it("lists dead letters with filters", () => {
    enqueueDeadLetter({
      original_job_id: 1,
      job_name: "sync",
      queue: "default",
      reason: "max_attempts_exceeded",
      error_text: "err",
      attempts_made: 3,
      stalled_counter: 0,
      retry_class: "transient",
      original_created_at: "2026-07-13T10:00:00Z",
    });
    enqueueDeadLetter({
      original_job_id: 2,
      job_name: "embed",
      queue: "background",
      reason: "timeout_exceeded",
      error_text: "timeout",
      attempts_made: 1,
      stalled_counter: 5,
      retry_class: "infrastructure",
      original_created_at: "2026-07-13T11:00:00Z",
    });

    const all = listDeadLetters();
    expect(all).toHaveLength(2);

    const filtered = listDeadLetters({ queue: "background" });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].job_name).toBe("embed");

    const byReason = listDeadLetters({ reason: "timeout_exceeded" });
    expect(byReason).toHaveLength(1);
  });

  it("gets dead letter by original job id", () => {
    enqueueDeadLetter({
      original_job_id: 99,
      job_name: "sync",
      queue: "default",
      reason: "permanent_error",
      error_text: "validation failed",
      attempts_made: 1,
      stalled_counter: 0,
      retry_class: "permanent",
      original_created_at: "2026-07-13T10:00:00Z",
    });
    const entry = getDeadLetterByJobId(99);
    expect(entry).toBeDefined();
    expect(entry?.error_text).toBe("validation failed");
  });

  it("computes stats", () => {
    enqueueDeadLetter({
      original_job_id: 1,
      job_name: "sync",
      queue: "default",
      reason: "max_attempts_exceeded",
      error_text: "err",
      attempts_made: 3,
      stalled_counter: 0,
      retry_class: "transient",
      was_mandatory: true,
      original_created_at: "2026-07-13T10:00:00Z",
    });
    enqueueDeadLetter({
      original_job_id: 2,
      job_name: "sync",
      queue: "default",
      reason: "timeout_exceeded",
      error_text: "timeout",
      attempts_made: 1,
      stalled_counter: 0,
      retry_class: "transient",
      original_created_at: "2026-07-13T11:00:00Z",
    });

    const stats = getDeadLetterStats();
    expect(stats.total).toBe(2);
    expect(stats.by_reason.max_attempts_exceeded).toBe(1);
    expect(stats.by_reason.timeout_exceeded).toBe(1);
    expect(stats.by_queue.default).toBe(2);
    expect(stats.mandatory_count).toBe(1);
  });

  it("removes dead letter entries", () => {
    const entry = enqueueDeadLetter({
      original_job_id: 1,
      job_name: "sync",
      queue: "default",
      reason: "max_attempts_exceeded",
      error_text: "err",
      attempts_made: 3,
      stalled_counter: 0,
      retry_class: "transient",
      original_created_at: "2026-07-13T10:00:00Z",
    });
    expect(getDLQSize()).toBe(1);
    expect(removeDeadLetter(entry.id)).toBe(true);
    expect(getDLQSize()).toBe(0);
    expect(removeDeadLetter("nonexistent")).toBe(false);
  });
});

// ── Mandatory Validator Tests ──────────────────────────────────────────

describe("Mandatory Validator", () => {
  describe("validateMandatorySubmission", () => {
    it("validates non-mandatory job (no restrictions)", () => {
      const result = validateMandatorySubmission({
        mandatory: false,
        on_child_fail: "ignore",
        parent_job_id: 1,
      });
      expect(result.valid).toBe(true);
    });

    it("validates mandatory job with fail_parent policy", () => {
      const result = validateMandatorySubmission({
        mandatory: true,
        on_child_fail: "fail_parent",
        parent_job_id: 1,
      });
      expect(result.valid).toBe(true);
    });

    it("rejects mandatory job without parent_job_id", () => {
      const result = validateMandatorySubmission({
        mandatory: true,
        on_child_fail: "fail_parent",
      });
      expect(result.valid).toBe(false);
      expect(result.error).toContain("parent_job_id");
    });

    it("rejects mandatory job with on_child_fail=ignore", () => {
      const result = validateMandatorySubmission({
        mandatory: true,
        on_child_fail: "ignore",
        parent_job_id: 1,
      });
      expect(result.valid).toBe(false);
      expect(result.error).toContain("fail_parent");
    });

    it("rejects mandatory job with on_child_fail=continue", () => {
      const result = validateMandatorySubmission({
        mandatory: true,
        on_child_fail: "continue",
        parent_job_id: 1,
      });
      expect(result.valid).toBe(false);
      expect(result.error).toContain("fail_parent");
    });

    it("rejects mandatory job with on_child_fail=remove_dep", () => {
      const result = validateMandatorySubmission({
        mandatory: true,
        on_child_fail: "remove_dep",
        parent_job_id: 1,
      });
      expect(result.valid).toBe(false);
      expect(result.error).toContain("fail_parent");
    });
  });

  describe("shouldFailParentForChild", () => {
    it("does not fail parent when child completes", () => {
      const result = shouldFailParentForChild(true, "completed", "fail_parent");
      expect(result.shouldFail).toBe(false);
    });

    it("fails parent when mandatory child fails", () => {
      const result = shouldFailParentForChild(true, "failed", "ignore");
      expect(result.shouldFail).toBe(true);
      expect(result.reason).toContain("Mandatory");
    });

    it("fails parent when mandatory child times out", () => {
      const result = shouldFailParentForChild(true, "timeout", "continue");
      expect(result.shouldFail).toBe(true);
    });

    it("fails parent when mandatory child is dead", () => {
      const result = shouldFailParentForChild(true, "dead", "remove_dep");
      expect(result.shouldFail).toBe(true);
    });

    it("respects on_child_fail=fail_parent for non-mandatory", () => {
      const result = shouldFailParentForChild(false, "failed", "fail_parent");
      expect(result.shouldFail).toBe(true);
    });

    it("respects on_child_fail=ignore for non-mandatory", () => {
      const result = shouldFailParentForChild(false, "failed", "ignore");
      expect(result.shouldFail).toBe(false);
    });

    it("respects on_child_fail=continue for non-mandatory", () => {
      const result = shouldFailParentForChild(false, "failed", "continue");
      expect(result.shouldFail).toBe(false);
    });

    it("respects on_child_fail=remove_dep for non-mandatory", () => {
      const result = shouldFailParentForChild(false, "failed", "remove_dep");
      expect(result.shouldFail).toBe(false);
    });
  });

  describe("canCancelMandatoryJob", () => {
    it("prevents independent cancellation of mandatory job", () => {
      const result = canCancelMandatoryJob(true, false);
      expect(result.canCancel).toBe(false);
      expect(result.reason).toContain("cannot be cancelled independently");
    });

    it("allows cancellation when parent is cancelling", () => {
      const result = canCancelMandatoryJob(true, true);
      expect(result.canCancel).toBe(true);
    });

    it("allows cancellation of non-mandatory job", () => {
      const result = canCancelMandatoryJob(false, false);
      expect(result.canCancel).toBe(true);
    });
  });
});
