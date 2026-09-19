/**
 * Engine error reporting to Sentry — dependency-free.
 *
 * Active only when SENTRY_DSN (or SUBSUMIO_ENGINE_SENTRY_DSN) is set; a no-op
 * otherwise, so local runs, tests and self-hosted installs are unaffected.
 * Events are sent to Sentry's envelope endpoint with a short timeout and are
 * fire-and-forget: reporting must never block or break request handling.
 *
 * Privacy: only the error type, message, stack and a small allow-listed tag
 * set are sent. Never pass request bodies, prompts or document text as tags —
 * those contain client (Mandanten) data.
 */

import { randomUUID } from "node:crypto";

interface ParsedDsn {
  endpoint: string;
  publicKey: string;
}

let parsed: ParsedDsn | null | undefined;

function dsn(): ParsedDsn | null {
  if (parsed !== undefined) return parsed;
  const raw = process.env.SUBSUMIO_ENGINE_SENTRY_DSN || process.env.SENTRY_DSN || "";
  parsed = parseDsn(raw);
  return parsed;
}

export function parseDsn(raw: string): ParsedDsn | null {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    const projectId = u.pathname.replace(/^\//, "").split("/").pop();
    if (!u.username || !projectId) return null;
    const basePath = u.pathname.slice(0, u.pathname.lastIndexOf("/"));
    return {
      endpoint: `${u.protocol}//${u.host}${basePath}/api/${projectId}/envelope/`,
      publicKey: u.username,
    };
  } catch {
    return null;
  }
}

/** For tests: forget the cached DSN. */
export function _resetErrorReportForTests(): void {
  parsed = undefined;
}

export type ErrorTags = Record<string, string | number | boolean | undefined>;

export function buildEnvelope(err: unknown, tags: ErrorTags = {}, now = new Date()): string {
  const e = err instanceof Error ? err : new Error(String(err));
  const eventId = randomUUID().replace(/-/g, "");
  const cleanTags: Record<string, string> = {};
  for (const [k, v] of Object.entries(tags)) {
    if (v !== undefined) cleanTags[k] = String(v).slice(0, 200);
  }
  const frames = (e.stack ?? "")
    .split("\n")
    .slice(1, 40)
    .map((line) => ({ function: line.trim().slice(0, 300) }))
    .reverse();
  const event = {
    event_id: eventId,
    timestamp: now.toISOString(),
    platform: "node",
    level: "error",
    server_name: process.env.HOSTNAME || "subsumio-engine",
    environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || "production",
    release: process.env.SUBSUMIO_RELEASE || undefined,
    tags: { component: "engine", ...cleanTags },
    exception: {
      values: [
        {
          type: e.name || "Error",
          value: e.message.slice(0, 2_000),
          stacktrace: frames.length > 0 ? { frames } : undefined,
        },
      ],
    },
  };
  return [
    JSON.stringify({ event_id: eventId, sent_at: now.toISOString() }),
    JSON.stringify({ type: "event" }),
    JSON.stringify(event),
  ].join("\n");
}

/** Report an error. Never throws, never awaits the network in the caller. */
export function reportError(err: unknown, tags: ErrorTags = {}): void {
  const target = dsn();
  if (!target) return;
  try {
    const body = buildEnvelope(err, tags);
    void fetch(target.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-sentry-envelope",
        "X-Sentry-Auth": `Sentry sentry_version=7, sentry_key=${target.publicKey}, sentry_client=subsumio-engine/1.0`,
      },
      body,
      signal: AbortSignal.timeout(5_000),
    }).catch(() => {});
  } catch {
    // reporting must never break the caller
  }
}

let processHooksInstalled = false;

/** Report uncaught exceptions and unhandled rejections (once per process). */
export function installProcessErrorReporting(): void {
  if (processHooksInstalled || !dsn()) return;
  processHooksInstalled = true;
  process.on("unhandledRejection", (reason) => reportError(reason, { kind: "unhandledRejection" }));
  process.on("uncaughtExceptionMonitor", (err) => reportError(err, { kind: "uncaughtException" }));
}
