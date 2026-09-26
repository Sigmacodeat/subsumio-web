// Scrubbing for everything the web app sends to Sentry (server, edge and
// browser). Error messages, transaction names, request URLs and breadcrumbs
// can carry matter slugs, client names in URLs, e-mail addresses, query
// strings and tokens; none of that belongs at an external processor.
//
//  - request cookies, headers (except a harmless allowlist), body and query
//    string are dropped; the user is reduced to its opaque id
//  - in every remaining string: e-mail addresses, bearer tokens and long
//    token-like values are masked, query strings are cut, and the path after
//    a matter/client/document route segment is replaced by "[redacted]"
//  - stack frames stay untouched (file names are code paths, not data)

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const BEARER_RE = /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/g;
const TOKEN_RE = /\b[A-Za-z0-9_-]{32,}\b/g;
const QUERY_RE = /(https?:\/\/[^\s?#"']*|\/[^\s?#"']*)\?[^\s#"']*/g;
const SENSITIVE_PATH_RE =
  /(\/(?:pages|cases|case|akten|clients|mandanten|contacts|kontakte|portal|documents|dokumente|invoices|rechnungen|matters|kyc|track|people|persons)\/)[^\s?#"')]+/gi;

// Code locations and Sentry's own identifiers (event/trace/span ids look
// like tokens but must survive for grouping and tracing).
const SKIP_KEYS = new Set([
  "stacktrace",
  "debug_meta",
  "sdk",
  "frames",
  "event_id",
  "trace_id",
  "span_id",
  "parent_span_id",
  "release",
  "dist",
  "sdkProcessingMetadata",
]);
const SAFE_HEADERS = new Set(["content-type", "user-agent", "accept", "x-request-id"]);

export function scrubString(value: string): string {
  return value
    .replace(BEARER_RE, "$1 [filtered]")
    .replace(EMAIL_RE, "[email]")
    .replace(QUERY_RE, "$1?[filtered]")
    .replace(SENSITIVE_PATH_RE, "$1[redacted]")
    .replace(TOKEN_RE, "[token]");
}

function scrubDeep(value: unknown, depth: number): unknown {
  if (typeof value === "string") return scrubString(value);
  if (depth > 8 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v) => scrubDeep(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = SKIP_KEYS.has(k) ? v : scrubDeep(v, depth + 1);
  }
  return out;
}

type ScrubbableEvent = {
  request?: {
    cookies?: unknown;
    data?: unknown;
    query_string?: unknown;
    headers?: Record<string, string>;
  } & Record<string, unknown>;
  user?: { id?: string | number } & Record<string, unknown>;
} & Record<string, unknown>;

/** beforeSend / beforeSendTransaction hook: returns a scrubbed copy of the event. */
export function scrubEvent<T>(event: T): T {
  const e = event as unknown as ScrubbableEvent;
  const copy: ScrubbableEvent = { ...e };
  if (e.request) {
    const { cookies: _c, data: _d, query_string: _q, headers, ...rest } = e.request;
    const safeHeaders: Record<string, string> = {};
    for (const [k, v] of Object.entries(headers ?? {})) {
      if (SAFE_HEADERS.has(k.toLowerCase())) safeHeaders[k] = v;
    }
    copy.request = { ...rest, headers: safeHeaders };
  }
  if (e.user) copy.user = e.user.id !== undefined ? { id: e.user.id } : undefined;
  return scrubDeep(copy, 0) as T;
}

/** beforeBreadcrumb hook. */
export function scrubBreadcrumb<T>(breadcrumb: T): T {
  return scrubDeep(breadcrumb, 0) as T;
}

/** Shared Sentry.init options for server, edge and browser. */
export const sentryPrivacyOptions = {
  sendDefaultPii: false,
  beforeSend: scrubEvent,
  beforeSendTransaction: scrubEvent,
  beforeBreadcrumb: scrubBreadcrumb,
};
