// Sliding-window rate limiter for auth endpoints.
//
// Backend: Upstash Redis (REST) when UPSTASH_REDIS_REST_URL +
// UPSTASH_REDIS_REST_TOKEN are set — instanzübergreifend korrekt auf
// Multi-Instanz-Serverless. Ohne Upstash: in-memory pro Instanz
// (self-hosted / single-node / dev). Upstash-Fehler fallen auf die
// in-memory-Schicht zurück (fail-open wäre für Brute-Force-Schutz falsch,
// komplett fail-closed würde Login bei Redis-Ausfall sperren — der
// per-Instanz-Fallback ist der Mittelweg).

interface Window {
  count: number;
  resetAt: number; // epoch ms
}

const windows = new Map<string, Window>();

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
      console.error(`[rate-limit] upstash unreachable, per-instance fallback: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return hitMemory(key, max, windowMs);
}

/** Best-effort client IP behind proxies; falls back to a shared bucket. */
export function clientIp(headers: Headers): string {
  const fwd = headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return headers.get("x-real-ip") ?? "unknown";
}
