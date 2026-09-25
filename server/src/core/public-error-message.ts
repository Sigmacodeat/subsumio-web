/**
 * Internal exception messages (provider names, billing URLs, model ids,
 * stack-adjacent detail) must never reach a lawyer's screen — the same
 * invariant `src/lib/engine-degraded.ts` enforces for LLM answer stubs, here
 * for the generic REST error path. Callers already log the raw `Error` via
 * `console.error`/Sentry before calling this; only the HTTP response body is
 * redacted.
 */
const TECHNICAL_PATTERNS = [
  /\bopenrouter\b/i,
  /\banthropic\b/i,
  /\binsufficient credits\b/i,
  /\bapi[_ -]?key\b/i,
  /\[embed\(/i,
  /\[chat\(/i,
  /https?:\/\/\S*(?:openrouter|anthropic|openai)\S*/i,
];

export const GENERIC_WRITE_FAILURE_MESSAGE =
  "Die Aktion konnte gerade nicht abgeschlossen werden. Bitte versuchen Sie es erneut; besteht das Problem weiter, wenden Sie sich an den Support.";

export function publicErrorMessage(
  message: string,
  fallback = GENERIC_WRITE_FAILURE_MESSAGE
): string {
  return TECHNICAL_PATTERNS.some((re) => re.test(message)) ? fallback : message;
}

/**
 * Error body of an API response, redacted for the client (audit ENG-5).
 * Any JSON error body with a string `message` gets `publicErrorMessage`
 * applied; for 5xx answers the raw message is returned as `cause` so the
 * caller can log it — a 500 must leave a trace in the engine log, not only
 * on the lawyer's screen.
 */
export function redactErrorResponseBody(
  status: number,
  body: unknown
): { body: unknown; cause?: string } {
  if (status < 400 || !body || typeof body !== "object" || Array.isArray(body)) {
    return { body };
  }
  const message = (body as { message?: unknown }).message;
  if (typeof message !== "string") return { body };
  return {
    body: { ...(body as Record<string, unknown>), message: publicErrorMessage(message) },
    ...(status >= 500 ? { cause: message } : {}),
  };
}
