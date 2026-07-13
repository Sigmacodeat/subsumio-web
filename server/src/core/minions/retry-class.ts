/**
 * EPIC 8 — T8.4 Queue Reliability: Retry Classification
 *
 * Formalizes error classification into three retry classes:
 *   - transient: Connection errors, timeouts, rate limits — retry with backoff
 *   - permanent: Logic errors, validation failures, unrecoverable — no retry
 *   - infrastructure: PgBouncer, pooler, circuit breaker — retry with longer backoff
 *
 * This module extends the existing retry-matcher.ts with a structured
 * classification that the queue and worker can use to decide retry strategy.
 */

export type RetryClass = "transient" | "permanent" | "infrastructure";

export interface RetryClassification {
  class: RetryClass;
  reason: string;
  retryable: boolean;
  /** Suggested backoff multiplier (1 = normal, 2 = double, 0 = no retry). */
  backoffMultiplier: number;
}

// Patterns for each retry class
const INFRASTRUCTURE_PATTERNS = [
  /ECIRCUITBREAKER/i,
  /EMAXCONNSESSION/i,
  /too many clients already/i,
  /max.*clients?.*in session mode/i,
  /remaining connection slots are reserved/i,
  /CONNECTION_ENDED/i,
  /pooler/i,
  /PgBouncer/i,
  /circuit.?breaker/i,
];

const TRANSIENT_PATTERNS = [
  /password authentication failed/i,
  /connection refused/i,
  /the database system is starting up/i,
  /Connection terminated unexpectedly/i,
  /ECONNRESET/i,
  /connection.*closed/i,
  /server closed the connection/i,
  /could not connect to server/i,
  /No database connection/i,
  /rate.?limit/i,
  /429/,
  /timeout/i,
  /ETIMEDOUT/i,
  /statement_timeout/i,
  /canceling statement due to statement timeout/i,
  /57014/, // SQLSTATE for statement_timeout
  /temporary failure/i,
  /service unavailable/i,
  /503/,
];

const PERMANENT_PATTERNS = [
  /UnrecoverableError/i,
  /validation.?failed/i,
  /invalid.?input/i,
  /schema.?mismatch/i,
  /permission denied/i,
  /not found/i,
  /does not exist/i,
  /unique constraint/i,
  /foreign key constraint/i,
  /23505/, // unique_violation
  /23503/, // foreign_key_violation
  /23502/, // not_null_violation
  /22P02/, // invalid_text_representation
  /42601/, // syntax_error
  /42P01/, // undefined_table
  /42703/, // undefined_column
];

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err) {
    return String((err as { message: unknown }).message);
  }
  return String(err ?? "");
}

function getErrorCode(err: unknown): string | undefined {
  if (err && typeof err === "object" && "code" in err) {
    const code = (err as { code: unknown }).code;
    return typeof code === "string" ? code : undefined;
  }
  return undefined;
}

/**
 * Classify an error into a retry class.
 *
 * The classification determines whether the queue should retry the job
 * and what backoff strategy to use:
 *   - transient → retry with normal backoff
 *   - infrastructure → retry with doubled backoff
 *   - permanent → no retry, dead-letter immediately
 */
export function classifyError(err: unknown): RetryClassification {
  const msg = getErrorMessage(err);
  const code = getErrorCode(err);

  // Check for explicit UnrecoverableError marker
  if (err instanceof Error && err.name === "UnrecoverableError") {
    return {
      class: "permanent",
      reason: "UnrecoverableError — handler explicitly marked this as non-retryable",
      retryable: false,
      backoffMultiplier: 0,
    };
  }

  // Check infrastructure patterns first (more specific than transient)
  for (const pattern of INFRASTRUCTURE_PATTERNS) {
    if (pattern.test(msg) || (code && pattern.test(code))) {
      return {
        class: "infrastructure",
        reason: `Infrastructure error matched: ${pattern.source}`,
        retryable: true,
        backoffMultiplier: 2,
      };
    }
  }

  // Check permanent patterns
  for (const pattern of PERMANENT_PATTERNS) {
    if (pattern.test(msg) || (code && pattern.test(code))) {
      return {
        class: "permanent",
        reason: `Permanent error matched: ${pattern.source}`,
        retryable: false,
        backoffMultiplier: 0,
      };
    }
  }

  // Check transient patterns
  for (const pattern of TRANSIENT_PATTERNS) {
    if (pattern.test(msg) || (code && pattern.test(code))) {
      return {
        class: "transient",
        reason: `Transient error matched: ${pattern.source}`,
        retryable: true,
        backoffMultiplier: 1,
      };
    }
  }

  // Default: unknown errors are treated as transient (safe retry)
  return {
    class: "transient",
    reason: "Unknown error — defaulting to transient (safe retry)",
    retryable: true,
    backoffMultiplier: 1,
  };
}

/**
 * Determine the max retry count for a job based on its retry class.
 * Permanent errors get 0 retries; infrastructure gets extra retries.
 */
export function maxRetriesForClass(retryClass: RetryClass, baseMaxAttempts: number): number {
  switch (retryClass) {
    case "permanent":
      return 0;
    case "infrastructure":
      return Math.max(baseMaxAttempts, baseMaxAttempts * 2);
    case "transient":
      return baseMaxAttempts;
  }
}
