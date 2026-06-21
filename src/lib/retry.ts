/**
 * Shared retry utility for external API calls.
 * Exponential backoff with jitter, configurable max retries and delays.
 * Distinguishes retryable errors (429, 5xx, network) from permanent ones (4xx).
 */

/**
 * Default timeout for outbound calls to third-party APIs (DocuSign, WorkOS,
 * Resend, Slack, customer SCIM/mailbox endpoints, ...). A hung third-party
 * backend must not hang the request indefinitely.
 */
export const EXTERNAL_FETCH_TIMEOUT_MS = 10_000;

/** AbortSignal for a single external fetch call, using the shared default timeout. */
export function externalFetchTimeout(ms: number = EXTERNAL_FETCH_TIMEOUT_MS): AbortSignal {
  return AbortSignal.timeout(ms);
}

export interface RetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  /** HTTP status codes that should trigger a retry (default: 429, 500, 502, 503, 504). */
  retryableStatuses?: number[];
  /** Optional callback for logging retry attempts. */
  onRetry?: (attempt: number, error: Error, delayMs: number) => void;
}

const DEFAULT_OPTIONS: Required<Omit<RetryOptions, "onRetry">> = {
  maxRetries: 3,
  baseDelayMs: 500,
  maxDelayMs: 30_000,
  retryableStatuses: [429, 500, 502, 503, 504],
};

function isRetryableError(err: unknown, retryableStatuses: number[]): boolean {
  if (err instanceof RetryableError) return true;
  if (err instanceof PermanentError) return false;
  if (err instanceof Error) {
    const msg = err.message;
    if (msg.includes("ECONNRESET") || msg.includes("ETIMEDOUT") || msg.includes("ENOTFOUND"))
      return true;
    if (msg.includes("fetch failed") || msg.includes("network")) return true;
    const statusMatch = msg.match(/HTTP (\d{3})/);
    if (statusMatch && retryableStatuses.includes(Number(statusMatch[1]))) return true;
  }
  return false;
}

function computeDelay(attempt: number, baseDelayMs: number, maxDelayMs: number): number {
  const exponential = baseDelayMs * Math.pow(2, attempt);
  const jitter = Math.random() * 0.3 * exponential;
  return Math.min(exponential + jitter, maxDelayMs);
}

/** Tag an error as retryable to override heuristic detection. */
export class RetryableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RetryableError";
  }
}

/** Tag an error as permanent to prevent retry. */
export class PermanentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PermanentError";
  }
}

export async function withRetry<T>(fn: () => Promise<T>, options?: RetryOptions): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let lastErr: unknown;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt === opts.maxRetries || !isRetryableError(err, opts.retryableStatuses)) {
        throw err;
      }
      const delayMs = computeDelay(attempt, opts.baseDelayMs, opts.maxDelayMs);
      opts.onRetry?.(attempt + 1, err instanceof Error ? err : new Error(String(err)), delayMs);
      await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw lastErr;
}

/** Wrapper for fetch that applies retry logic based on HTTP status codes. */
export async function fetchWithRetry(
  input: string | URL,
  init?: RequestInit,
  options?: RetryOptions
): Promise<Response> {
  return withRetry(async () => {
    const res = await fetch(input, { ...init, signal: init?.signal ?? externalFetchTimeout() });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      const err = new Error(`HTTP ${res.status}: ${body.slice(0, 200)}`);
      const opts = { ...DEFAULT_OPTIONS, ...options };
      if (opts.retryableStatuses.includes(res.status)) {
        throw new RetryableError(err.message);
      }
      throw new PermanentError(err.message);
    }
    return res;
  }, options);
}
