/**
 * Structured JSON logger with request-ID correlation.
 *
 * Usage:
 *   const log = logger("legal-deadlines");
 *   log.info("Deadline computed", { rule: "zpo-berufung", dueDate: "2026-07-19" });
 *   log.error("Holiday lookup failed", { year: 2026, state: "BY", error: err.message });
 *
 * In API routes, set a request ID via `setRequestId()` (from middleware or handler).
 */

type LogLevel = "debug" | "info" | "warn" | "error";

interface LogEntry {
  ts: string;
  level: LogLevel;
  module: string;
  msg: string;
  requestId?: string;
  [key: string]: unknown;
}

// Request ids come from a provider (server: AsyncLocalStorage in
// src/lib/request-context.ts, installed by createHandler). A module-level
// variable is NOT safe on a concurrent server — requests would overwrite
// each other's id. `setRequestId` remains as an explicit override for
// scripts and tests.
let explicitRequestId: string | undefined;
let requestIdProvider: (() => string | undefined) | undefined;

export function setRequestIdProvider(provider: () => string | undefined): void {
  requestIdProvider = provider;
}

export function setRequestId(id: string | undefined): void {
  explicitRequestId = id;
}

export function getRequestId(): string | undefined {
  return requestIdProvider?.() ?? explicitRequestId;
}

function shouldLog(level: LogLevel): boolean {
  const envLevel = (process.env.LOG_LEVEL || "info").toLowerCase() as LogLevel;
  const order: LogLevel[] = ["debug", "info", "warn", "error"];
  return order.indexOf(level) >= order.indexOf(envLevel);
}

type Meta = Record<string, unknown>;

function isPlainObject(v: unknown): v is Meta {
  return (
    !!v &&
    typeof v === "object" &&
    !Array.isArray(v) &&
    !(v instanceof Error) &&
    !(v instanceof Date)
  );
}

function describeValue(v: unknown): unknown {
  if (v instanceof Error) {
    return { name: v.name, message: v.message, ...(v.stack ? { stack: v.stack } : {}) };
  }
  if (typeof v === "bigint") return v.toString();
  if (typeof v === "function") return `[function ${v.name || "anonymous"}]`;
  return v;
}

/**
 * Accept console-style arguments and turn them into (msg, meta):
 *   log.error("failed", err)            → msg "failed", meta.error = {name, message, stack}
 *   log.error("failed", { caseSlug })   → msg "failed", meta = { caseSlug }
 *   log.error(err)                      → msg err.message, meta.error = …
 *   log.info("x", 1, "y")               → msg "x", meta.details = [1, "y"]
 * This keeps migrated console.* call sites type-safe while every line stays
 * structured JSON with module + requestId.
 */
export function normalizeLogArgs(msg: unknown, rest: unknown[]): { msg: string; meta?: Meta } {
  const text =
    typeof msg === "string"
      ? msg
      : msg instanceof Error
        ? msg.message
        : (() => {
            try {
              return typeof msg === "object" ? JSON.stringify(msg) : String(msg);
            } catch {
              return String(msg);
            }
          })();
  const meta: Meta = {};
  if (msg instanceof Error) meta.error = describeValue(msg);
  if (rest.length === 1 && isPlainObject(rest[0])) {
    Object.assign(meta, rest[0]);
  } else if (rest.length === 1 && rest[0] instanceof Error) {
    meta.error = describeValue(rest[0]);
  } else if (rest.length > 0) {
    meta.details = rest.map(describeValue);
  }
  return Object.keys(meta).length ? { msg: text, meta } : { msg: text };
}

// ── Redaction ─────────────────────────────────────────────────────────
// Logs leave the app (container logs, log shipping) and must carry neither
// secrets nor more personal data than needed. Applied to every line:
//  - string values under secret-looking keys (password, token, api key,
//    authorization, cookie, …) become "[redacted]" — numbers such as token
//    counts stay;
//  - e-mail addresses are shortened to their first letter + domain;
//  - bearer/basic credentials inside any string are masked.
const SECRET_KEY_RE =
  /pass(word|phrase)?|secret|token|api[-_]?key|authorization|cookie|credential|private[-_]?key/i;
const EMAIL_RE = /([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]*@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;
const AUTH_RE = /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/g;

export function redactLogString(value: string): string {
  return value.replace(AUTH_RE, "$1 [redacted]").replace(EMAIL_RE, "$1***@$2");
}

export function redactLogValue(value: unknown, key = "", depth = 0): unknown {
  if (typeof value === "string") {
    return key && SECRET_KEY_RE.test(key) ? "[redacted]" : redactLogString(value);
  }
  if (depth > 6 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v) => redactLogValue(v, key, depth + 1));
  const out: Meta = {};
  for (const [k, v] of Object.entries(value as Meta)) {
    // Stack traces are code locations; keep them readable.
    out[k] = k === "stack" ? v : redactLogValue(v, k, depth + 1);
  }
  return out;
}

function emit(level: LogLevel, module: string, rawMsg: unknown, rest: unknown[]): void {
  if (!shouldLog(level)) return;
  const normalized = normalizeLogArgs(rawMsg, rest);
  const msg = redactLogString(normalized.msg);
  const meta = normalized.meta ? (redactLogValue(normalized.meta) as Meta) : undefined;
  const entry: LogEntry = {
    ts: new Date().toISOString(),
    level,
    module,
    msg,
    ...(getRequestId() ? { requestId: getRequestId() } : {}),
    ...(meta ?? {}),
  };
  let line: string;
  try {
    line = JSON.stringify(entry);
  } catch {
    line = JSON.stringify({ ts: entry.ts, level, module, msg, unserializable: true });
  }
  // Node writes to the real streams; Edge middleware and browser bundles have
  // none, so they fall back to the console. The streams are reached through
  // globalThis so the Edge bundler does not flag a Node API in shared code.
  const streams = nodeStreams();
  if (streams) {
    (level === "error" ? streams.stderr : streams.stdout).write(line + "\n");
  } else if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.log(line);
  }
}

type WritableLike = { write: (chunk: string) => unknown };
type NodeProcessLike = {
  versions?: { node?: string };
  stdout?: WritableLike;
  stderr?: WritableLike;
};

function nodeStreams(): { stdout: WritableLike; stderr: WritableLike } | null {
  const proc = (globalThis as { process?: NodeProcessLike }).process;
  if (!proc?.versions?.node || !proc.stdout || !proc.stderr) return null;
  return { stdout: proc.stdout, stderr: proc.stderr };
}

export function logger(module: string) {
  return {
    debug: (msg: unknown, ...rest: unknown[]) => emit("debug", module, msg, rest),
    info: (msg: unknown, ...rest: unknown[]) => emit("info", module, msg, rest),
    warn: (msg: unknown, ...rest: unknown[]) => emit("warn", module, msg, rest),
    error: (msg: unknown, ...rest: unknown[]) => emit("error", module, msg, rest),
  };
}

export type Logger = ReturnType<typeof logger>;
