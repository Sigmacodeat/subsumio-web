import { apiError, createPublicHandler } from "@/lib/api-handler";
import { getMinRevocationVersion } from "@/lib/auth/revocation-store";
import { listRevokedSids } from "@/lib/auth/session-registry";
import { clientIp } from "@/lib/auth/rate-limit";
import { z } from "zod";

import { logger } from "@/lib/logger";
const log = logger("api/internal/revocation-check");

const UID_PATTERN = /^[a-zA-Z0-9_-]{1,128}$/;

const revocationCheckSchema = z.object({
  uid: z.string().min(1).max(128).regex(UID_PATTERN),
});

/**
 * GET /api/internal/revocation-check?uid=<userId>
 *
 * Internal endpoint used by the edge-safe session verifier
 * (session-core.ts → fetchRevocationVersion) to check if a user's
 * sessions have been revoked. Returns the minimum accepted session version
 * plus the list of individually revoked registry sids ("Aktive Sitzungen").
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
      const [minVersion, revokedSids] = await Promise.all([
        getMinRevocationVersion(uid),
        listRevokedSids(uid),
      ]);
      return Response.json({ minVersion, revokedSids });
    } catch (err) {
      log.error("[revocation-check] error:", err instanceof Error ? err : { error: String(err) });
      // 503, never "nothing revoked": the edge verifier only updates its
      // cache on 2xx, so a stored revocation stays in force during an outage.
      return apiError("service_unavailable", "Sitzungsstatus vorübergehend nicht verfügbar", 503);
    }
  }
);
