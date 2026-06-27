/**
 * Engine error hierarchy — structured error types for the BrainEngine layer.
 *
 * Agency-Level Standard: engine methods throw typed errors from this hierarchy
 * instead of bare `Error`. Callers (CLI, MCP, operations.ts) can catch by type
 * to apply appropriate recovery: retry on ConnectionError, abort on ConfigError,
 * surface "not found" as a 404-style result rather than a crash.
 *
 * Hierarchy:
 *
 *   EngineError (base)
 *     ├── QueryError       — SQL execution failure (syntax, constraint, timeout)
 *     ├── SchemaError      — schema mismatch, missing column/index, migration drift
 *     ├── ConfigError      — bad configuration (invalid dims, missing URL, bad pool size)
 *     ├── ConnectionError  — connection-level failure (pool exhausted, socket reaped, auth)
 *     └── NotFoundError    — entity not found (page, tag, file, version)
 *
 * Relationship to existing error types:
 *   - `GBrainError` (types.ts) — user-facing error with problem/cause/fix. EngineError
 *     is the engine-internal counterpart; operations.ts wraps EngineError into
 *     OperationError for the external API surface.
 *   - `OperationError` (operations.ts) — MCP/CLI operation error with ErrorCode.
 *   - `AIServiceError` (ai/errors.ts) — AI gateway errors, separate hierarchy.
 *
 * The `retryable` field signals whether `withRetry` should attempt a retry.
 * ConnectionError is retryable; ConfigError and NotFoundError are not.
 */

export type EngineErrorKind = "query" | "schema" | "config" | "connection" | "not_found";

export class EngineError extends Error {
  readonly kind: EngineErrorKind;
  /** Whether this error is retryable by `withRetry`. */
  readonly retryable: boolean;
  /** Optional fix hint for operators. */
  readonly fix?: string;

  constructor(
    kind: EngineErrorKind,
    message: string,
    opts: { retryable?: boolean; fix?: string; cause?: unknown } = {}
  ) {
    super(message);
    this.name = "EngineError";
    this.kind = kind;
    this.retryable = opts.retryable ?? false;
    if (opts.fix) this.fix = opts.fix;
    if (opts.cause !== undefined) {
      (this as { cause?: unknown }).cause = opts.cause;
    }
  }
}

/** SQL execution failure: syntax error, constraint violation, statement timeout. */
export class QueryError extends EngineError {
  constructor(message: string, opts: { fix?: string; cause?: unknown } = {}) {
    super("query", message, { retryable: false, ...opts });
    this.name = "QueryError";
  }
}

/** Schema mismatch: missing column, index, or migration drift. */
export class SchemaError extends EngineError {
  constructor(message: string, opts: { fix?: string; cause?: unknown } = {}) {
    super("schema", message, { retryable: false, ...opts });
    this.name = "SchemaError";
  }
}

/** Bad configuration: invalid dimensions, missing URL, bad pool size. */
export class ConfigError extends EngineError {
  constructor(message: string, opts: { fix?: string; cause?: unknown } = {}) {
    super("config", message, { retryable: false, ...opts });
    this.name = "ConfigError";
  }
}

/** Connection-level failure: pool exhausted, socket reaped, auth failure. */
export class ConnectionError extends EngineError {
  constructor(message: string, opts: { fix?: string; cause?: unknown } = {}) {
    super("connection", message, { retryable: true, ...opts });
    this.name = "ConnectionError";
  }
}

/** Entity not found: page, tag, file, version, etc. */
export class NotFoundError extends EngineError {
  constructor(message: string, opts: { fix?: string; cause?: unknown } = {}) {
    super("not_found", message, { retryable: false, ...opts });
    this.name = "NotFoundError";
  }
}

/**
 * Type guard: is the thrown error an EngineError (or subclass)?
 */
export function isEngineError(err: unknown): err is EngineError {
  return err instanceof EngineError;
}

/**
 * Type guard: is the error retryable per the EngineError hierarchy?
 * Falls back to `isRetryableConnError` from retry-matcher.ts for non-EngineError.
 */
export function isEngineRetryable(err: unknown): boolean {
  if (err instanceof EngineError) return err.retryable;
  return false;
}
