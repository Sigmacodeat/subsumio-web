import type { NextRequest } from "next/server";
import { hit, clientIp } from "@/lib/auth/rate-limit";
import { hasValidInternalSecret } from "@/lib/auth/internal";

/**
 * Rate-limited internal-secret guard for standalone routes that skip
 * createHandler entirely (no session, no RBAC, no built-in rate limit).
 * Returns a 429/401 Response to short-circuit the caller, or null when
 * the request may proceed.
 *
 * Lives in its own module, NOT in `internal.ts`, on purpose:
 * `@/lib/auth/rate-limit` reaches for `node:fs` for its file-backed fallback,
 * and `internal.ts` is imported by `middleware.ts`, which Next compiles for the
 * Edge runtime. Edge has no `node:fs`, so pulling the rate limiter into
 * `internal.ts` fails the middleware build outright ("UnhandledSchemeError:
 * Reading from node:fs") and every route 404s. Keep `internal.ts` free of
 * Node-only imports; anything needing the limiter belongs here.
 */
export async function requireInternalSecret(req: NextRequest): Promise<Response | null> {
  const ip = clientIp(req.headers);
  const rate = await hit(`internal-secret:${ip}`, 30, 60_000);
  if (!rate.ok) {
    return Response.json(
      { error: "rate_limited", message: "Too many requests." },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } }
    );
  }
  if (!hasValidInternalSecret(req)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  return null;
}
