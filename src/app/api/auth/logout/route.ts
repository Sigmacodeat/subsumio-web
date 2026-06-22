import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/server";
import { SESSION_COOKIE, revokeAllSessions } from "@/lib/auth/session";
import { logAudit } from "@/lib/audit";

export async function POST(_req: NextRequest) {
  // Try to get the user for audit and session revocation
  const user = await getSession();

  if (user) {
    // Always revoke all sessions on logout — this invalidates any stolen JWT
    // immediately, not just when "logout all devices" is requested.
    // The version-based revocation system doesn't support single-session
    // revocation, so we revoke all for security.
    await revokeAllSessions(user.uid);
    void logAudit("user.logout", "user", { entityId: user.uid, details: { allDevices: true } });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
