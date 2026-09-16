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

let currentRequestId: string | undefined;

export function setRequestId(id: string | undefined): void {
  currentRequestId = id;
}

export function getRequestId(): string | undefined {
  return currentRequestId;
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

function emit(level: LogLevel, module: string, rawMsg: unknown, rest: unknown[]): void {
  if (!shouldLog(level)) return;
  const { msg, meta } = normalizeLogArgs(rawMsg, rest);
  const entry: LogEntry = {
    ts: new Date().toISOString(),
    level,
    module,
    msg,
    ...(currentRequestId ? { requestId: currentRequestId } : {}),
    ...(meta ?? {}),
  };
  let line: string;
  try {
    line = JSON.stringify(entry);
  } catch {
    line = JSON.stringify({ ts: entry.ts, level, module, msg, unserializable: true });
  }
  // Browser bundles have no process streams; fall back to the console so a
  // shared module never crashes on the client.
  const stream =
    typeof process !== "undefined" && process.stdout && process.stderr
      ? level === "error"
        ? process.stderr
        : process.stdout
      : null;
  if (stream) {
    stream.write(line + "\n");
  } else if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.log(line);
  }
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
