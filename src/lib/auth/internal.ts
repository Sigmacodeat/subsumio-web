import type { NextRequest } from "next/server";

/**
 * NOTE: this module is imported by `middleware.ts`, which Next compiles for the
 * Edge runtime. It must stay free of Node-only imports (`node:fs` and friends)
 * — `@/lib/auth/rate-limit` pulls `node:fs` for its file-backed fallback, so
 * importing it here breaks the middleware build and 404s every route. The
 * rate-limited guard lives in `internal-guard.ts` for exactly that reason.
 */

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
