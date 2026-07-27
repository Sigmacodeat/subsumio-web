import type { NextRequest } from "next/server";
import { hit, clientIp } from "@/lib/auth/rate-limit";

/**
 * Constant-time comparison of the x-internal-secret header against the
 * configured SUBSUMIO_INTERNAL_SECRET. Used by server-to-server routes
 * (cron triggers, post-upload callbacks, etc.) to authenticate internal
 * callers without a user session.
 *
 * Timing-safe: iterates the full string even on early mismatch so an
 * attacker cannot learn the secret length from response timing.
 *
 * Note: this is also used as a plain boolean check outside the auth-guard
 * role (middleware.ts's CSRF exemption, audit/route.ts's internal-caller
 * branch inside an already rate-limited createHandler route) — it must
 * stay side-effect free. Routes that use it as their ONLY guard (no
 * createHandler, no session) should call `requireInternalSecret` below
 * instead, which adds the rate limit those routes are otherwise missing.
 */
export function hasValidInternalSecret(req: NextRequest): boolean {
  const presented = req.headers.get("x-internal-secret");
  const expected = process.env.SUBSUMIO_INTERNAL_SECRET;
  if (!expected || !presented || presented.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < presented.length; i++) {
    diff |= presented.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Rate-limited internal-secret guard for standalone routes that skip
 * createHandler entirely (no session, no RBAC, no built-in rate limit).
 * Returns a 429/401 Response to short-circuit the caller, or null when
 * the request may proceed.
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
