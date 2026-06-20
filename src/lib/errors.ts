/**
 * Domain-specific error classes for Subsumio.
 *
 * Every error carries:
 *   - `code`: a stable, machine-readable string (e.g. "ENCRYPTION_KEY_MISSING")
 *   - `details`: optional structured context for logging / debugging
 *
 * Pattern: `throw new LegalDeadlineError("Invalid date", { code: "INVALID_DATE", details: { input } })`
 *
 * Never `throw new Error("string")` in business logic — use these classes instead.
 */

export interface ErrorDetails {
  [key: string]: unknown;
}

export class AppError extends Error {
  readonly code: string;
  readonly details?: ErrorDetails;
  readonly statusCode: number;

  constructor(
    message: string,
    opts: { code: string; details?: ErrorDetails; statusCode?: number; cause?: Error },
  ) {
    super(message, opts.cause ? { cause: opts.cause } : undefined);
    this.name = this.constructor.name;
    this.code = opts.code;
    this.details = opts.details;
    this.statusCode = opts.statusCode ?? 500;
  }

  toJSON(): { name: string; code: string; message: string; details?: ErrorDetails } {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      ...(this.details ? { details: this.details } : {}),
    };
  }
}

// ── Legal Domain ────────────────────────────────────────────────────────────

export class LegalDeadlineError extends AppError {
  constructor(message: string, opts: { code: string; details?: ErrorDetails; cause?: Error }) {
    super(message, { ...opts, statusCode: 400 });
  }
}

export class RvgCalculationError extends AppError {
  constructor(message: string, opts: { code: string; details?: ErrorDetails; cause?: Error }) {
    super(message, { ...opts, statusCode: 400 });
  }
}

// ── Auth & Security ──────────────────────────────────────────────────────────

export class AuthError extends AppError {
  constructor(message: string, opts: { code: string; details?: ErrorDetails; cause?: Error }) {
    super(message, { ...opts, statusCode: 401 });
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string, opts: { code: string; details?: ErrorDetails; cause?: Error }) {
    super(message, { ...opts, statusCode: 403 });
  }
}

export class EncryptionError extends AppError {
  constructor(message: string, opts: { code: string; details?: ErrorDetails; cause?: Error }) {
    super(message, { ...opts, statusCode: 500 });
  }
}

// ── Integrations ─────────────────────────────────────────────────────────────

export class DocusignError extends AppError {
  constructor(message: string, opts: { code: string; details?: ErrorDetails; cause?: Error }) {
    super(message, { ...opts, statusCode: 502 });
  }
}

export class JudgementsSearchError extends AppError {
  constructor(message: string, opts: { code: string; details?: ErrorDetails; cause?: Error }) {
    super(message, { ...opts, statusCode: 502 });
  }
}

// ── Validation ───────────────────────────────────────────────────────────────

export class ValidationError extends AppError {
  constructor(message: string, opts: { code: string; details?: ErrorDetails; cause?: Error }) {
    super(message, { ...opts, statusCode: 422 });
  }
}

// ── Quota & Billing ──────────────────────────────────────────────────────────

export class QuotaExceededError extends AppError {
  constructor(message: string, opts: { code: string; details?: ErrorDetails; cause?: Error }) {
    super(message, { ...opts, statusCode: 429 });
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Type guard: is the thrown value an AppError? */
export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError;
}

/** Safe error → JSON for API responses. */
export function errorResponse(err: unknown): { error: string; code: string; message: string; details?: ErrorDetails } {
  if (isAppError(err)) {
    return {
      error: err.name,
      code: err.code,
      message: err.message,
      ...(err.details ? { details: err.details } : {}),
    };
  }
  const message = err instanceof Error ? err.message : String(err);
  return { error: "InternalError", code: "INTERNAL", message };
}
