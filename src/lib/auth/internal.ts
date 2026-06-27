import type { NextRequest } from "next/server";

/**
 * Constant-time comparison of the x-internal-secret header against the
 * configured SUBSUMIO_INTERNAL_SECRET. Used by server-to-server routes
 * (cron triggers, post-upload callbacks, etc.) to authenticate internal
 * callers without a user session.
 *
 * Timing-safe: iterates the full string even on early mismatch so an
 * attacker cannot learn the secret length from response timing.
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
