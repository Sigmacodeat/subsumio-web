import { createPublicHandler } from "@/lib/api-handler";
import { getMinRevocationVersion } from "@/lib/auth/revocation-store";
import { clientIp } from "@/lib/auth/rate-limit";
import { z } from "zod";

const UID_PATTERN = /^[a-zA-Z0-9_-]{1,128}$/;

const revocationCheckSchema = z.object({
  uid: z.string().min(1).max(128).regex(UID_PATTERN),
});

/**
 * GET /api/internal/revocation-check?uid=<userId>
 *
 * Internal endpoint used by the edge-safe session verifier
 * (session-core.ts → fetchRevocationVersion) to check if a user's
 * sessions have been revoked. Returns the minimum accepted session version.
 *
 * This endpoint is intentionally unauthenticated — it only reveals a
 * numeric version counter, not any user data. The edge middleware
 * calls this on a 60-second cache to limit revocation latency.
 *
 * Rate-limited to prevent abuse and user-enumeration oracles.
 */
export const GET = createPublicHandler(
  {
    query: revocationCheckSchema,
    rateLimitKey: (req) => `revocation-check:ip:${clientIp(req.headers)}`,
    rateLimitMax: 120,
    rateLimitWindowMs: 60_000,
  },
  async (_req, _body, query) => {
    const { uid } = query;

    try {
      const minVersion = await getMinRevocationVersion(uid);
      return Response.json({ minVersion });
    } catch (err) {
      console.error("[revocation-check] error:", err instanceof Error ? err.message : String(err));
      // Fail-open: return 0 so sessions remain valid if the store is unreachable
      return Response.json({ minVersion: 0 });
    }
  }
);
