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

function emit(level: LogLevel, module: string, msg: string, meta?: Record<string, unknown>): void {
  if (!shouldLog(level)) return;
  const entry: LogEntry = {
    ts: new Date().toISOString(),
    level,
    module,
    msg,
    ...(currentRequestId ? { requestId: currentRequestId } : {}),
    ...(meta ?? {}),
  };
  const line = JSON.stringify(entry);
  if (level === "error") {
    process.stderr.write(line + "\n");
  } else {
    process.stdout.write(line + "\n");
  }
}

export function logger(module: string) {
  return {
    debug: (msg: string, meta?: Record<string, unknown>) => emit("debug", module, msg, meta),
    info: (msg: string, meta?: Record<string, unknown>) => emit("info", module, msg, meta),
    warn: (msg: string, meta?: Record<string, unknown>) => emit("warn", module, msg, meta),
    error: (msg: string, meta?: Record<string, unknown>) => emit("error", module, msg, meta),
  };
}

export type Logger = ReturnType<typeof logger>;
