// Sliding-window rate limiter for auth endpoints.
//
// Backend: Upstash Redis (REST) when UPSTASH_REDIS_REST_URL +
// UPSTASH_REDIS_REST_TOKEN are set — instanzübergreifend korrekt auf
// Multi-Instanz-Serverless. Ohne Upstash: in-memory pro Instanz
// (self-hosted / single-node / dev). Upstash-Fehler fallen auf die
// in-memory-Schicht zurück (fail-open wäre für Brute-Force-Schutz falsch,
// komplett fail-closed würde Login bei Redis-Ausfall sperren — der
// per-Instanz-Fallback ist der Mittelweg).
//
// For production self-hosted without Upstash: a file-based fallback ensures
// rate limits persist across restarts. The in-memory map is still used for
// hot-path reads; the file is the source of truth for persistence.

import { promises as fs } from "node:fs";
import path from "node:path";

interface Window {
  count: number;
  resetAt: number; // epoch ms
}

declare global {
  // Next.js can instantiate the same dependency in separate route bundles and
  // during Fast Refresh. Keep the per-process fallback truly process-wide so
  // route-bundle reloads cannot reset brute-force counters.
  var __subsumioRateLimitWindows: Map<string, Window> | undefined;
}

const windows = (globalThis.__subsumioRateLimitWindows ??= new Map<string, Window>());
import { env } from "@/lib/env";

const DATA_DIR = env("SUBSUMIO_DATA_DIR") || path.join(process.cwd(), ".data");
const RATE_LIMIT_FILE = path.join(DATA_DIR, "rate-limits.json");

let fileCache: Record<string, { count: number; resetAt: number }> | null = null;
let writeQueue: Promise<void> = Promise.resolve();
let lastFileSync = 0;
const FILE_SYNC_INTERVAL = 10_000; // sync to file every 10s max

async function loadRateLimitFile(): Promise<Record<string, { count: number; resetAt: number }>> {
  if (fileCache) return fileCache;
  try {
    const raw = await fs.readFile(RATE_LIMIT_FILE, "utf8");
    fileCache = JSON.parse(raw) as Record<string, { count: number; resetAt: number }>;
  } catch {
    fileCache = {};
  }
  return fileCache!;
}

function persistRateLimitFile() {
  const now = Date.now();
  if (now - lastFileSync < FILE_SYNC_INTERVAL) return;
  lastFileSync = now;
  const snapshot: Record<string, { count: number; resetAt: number }> = {};
  for (const [key, w] of windows) {
    if (w.resetAt > now) snapshot[key] = { count: w.count, resetAt: w.resetAt };
  }
  writeQueue = writeQueue.then(async () => {
    try {
      await fs.mkdir(DATA_DIR, { recursive: true });
      const tmp = `${RATE_LIMIT_FILE}.tmp`;
      await fs.writeFile(tmp, JSON.stringify(snapshot), "utf8");
      await fs.rename(tmp, RATE_LIMIT_FILE);
    } catch {
      // non-fatal — in-memory still works
    }
  });
  return writeQueue;
}

/** Periodic sweep so abandoned keys don't accumulate forever. */
let lastSweep = Date.now();
function sweep(now: number) {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [key, w] of windows) {
    if (w.resetAt <= now) windows.delete(key);
  }
}

export interface RateLimitResult {
  ok: boolean;
  /** Seconds until the window resets (for Retry-After). */
  retryAfterSeconds: number;
}

function hitMemory(key: string, max: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  sweep(now);
  const w = windows.get(key);
  if (!w || w.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfterSeconds: 0 };
  }
  w.count++;
  if (w.count > max) {
    return { ok: false, retryAfterSeconds: Math.ceil((w.resetAt - now) / 1000) };
  }
  return { ok: true, retryAfterSeconds: 0 };
}

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

/**
 * Fixed-window counter via Upstash REST pipeline:
 *   INCR key — atomically count this hit
 *   PEXPIRE key windowMs NX — start the window on the FIRST hit only
 *   PTTL key — remaining window for Retry-After
 */
async function hitUpstash(key: string, max: number, windowMs: number): Promise<RateLimitResult> {
  const ns = `rl:${key}`;
  const res = await fetch(`${UPSTASH_URL}/pipeline`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${UPSTASH_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify([
      ["INCR", ns],
      ["PEXPIRE", ns, String(windowMs), "NX"],
      ["PTTL", ns],
    ]),
  });
  if (!res.ok) throw new Error(`upstash ${res.status}`);
  const data = (await res.json()) as Array<{ result?: unknown; error?: string }>;
  if (data.some((d) => d.error)) throw new Error(`upstash pipeline error`);
  const count = Number(data[0]?.result ?? 1);
  const ttlMs = Number(data[2]?.result ?? windowMs);
  if (count > max) {
    return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil(ttlMs / 1000)) };
  }
  return { ok: true, retryAfterSeconds: 0 };
}

/**
 * Record a hit for `key` and report whether it stays within `max` per
 * `windowMs`. Keys should combine route + client identity, e.g.
 * `login:1.2.3.4` or `login:email:user@example.com`.
 */
export async function hit(key: string, max: number, windowMs: number): Promise<RateLimitResult> {
  if (UPSTASH_URL && UPSTASH_TOKEN) {
    try {
      return await hitUpstash(key, max, windowMs);
    } catch (err) {
      console.error(
        `[rate-limit] upstash unreachable, per-instance fallback: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }
  // Production without Upstash: load persisted state from file on first call,
  // then use in-memory logic. This allows self-hosted single-node deployments
  // to maintain rate limits across restarts without external dependencies.
  if (process.env.NODE_ENV === "production" && !fileCache) {
    const persisted = await loadRateLimitFile();
    const now = Date.now();
    for (const [k, v] of Object.entries(persisted)) {
      if (v.resetAt > now && !windows.has(k)) {
        windows.set(k, { count: v.count, resetAt: v.resetAt });
      }
    }
  }
  const result = hitMemory(key, max, windowMs);
  // Best-effort persist for production self-hosted
  if (process.env.NODE_ENV === "production") {
    void persistRateLimitFile();
  }
  return result;
}

/** Best-effort client IP behind proxies; falls back to a shared bucket. */
export function clientIp(headers: Headers): string {
  const fwd = headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return headers.get("x-real-ip") ?? "unknown";
}
