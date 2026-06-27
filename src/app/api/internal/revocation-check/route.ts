import { NextRequest, NextResponse } from "next/server";
import { getMinRevocationVersion } from "@/lib/auth/revocation-store";
import { hit, clientIp } from "@/lib/auth/rate-limit";

const UID_PATTERN = /^[a-zA-Z0-9_-]{1,128}$/;

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
export async function GET(req: NextRequest) {
  const ip = clientIp(req.headers);
  const ipLimit = await hit(`revocation-check:ip:${ip}`, 120, 60_000);
  if (!ipLimit.ok) {
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(ipLimit.retryAfterSeconds) } }
    );
  }

  const uid = req.nextUrl.searchParams.get("uid");
  if (!uid || uid.length > 128 || !UID_PATTERN.test(uid)) {
    return NextResponse.json({ error: "invalid_uid" }, { status: 400 });
  }

  try {
    const minVersion = await getMinRevocationVersion(uid);
    return NextResponse.json({ minVersion });
  } catch (err) {
    console.error("[revocation-check] error:", err instanceof Error ? err.message : String(err));
    // Fail-open: return 0 so sessions remain valid if the store is unreachable
    return NextResponse.json({ minVersion: 0 });
  }
}
