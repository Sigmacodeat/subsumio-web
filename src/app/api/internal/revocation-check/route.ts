import { NextRequest, NextResponse } from "next/server";
import { getMinRevocationVersion } from "@/lib/auth/revocation-store";

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
 */
export async function GET(req: NextRequest) {
  const uid = req.nextUrl.searchParams.get("uid");
  if (!uid || uid.length > 200) {
    return NextResponse.json({ error: "invalid_uid" }, { status: 400 });
  }

  // Prevent self-amplification: the edge verifier calls this endpoint,
  // which itself might trigger session-core. But this route uses
  // revocation-store directly (Node runtime), not session-core, so
  // there's no circular dependency.

  try {
    const minVersion = await getMinRevocationVersion(uid);
    return NextResponse.json({ minVersion });
  } catch (err) {
    console.error("[revocation-check] error:", err instanceof Error ? err.message : String(err));
    // Fail-open: return 0 so sessions remain valid if the store is unreachable
    return NextResponse.json({ minVersion: 0 });
  }
}
