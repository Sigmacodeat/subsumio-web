import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/server";
import { SESSION_COOKIE, revokeAllSessions } from "@/lib/auth/session";
import { logAudit } from "@/lib/audit";

export async function POST(req: NextRequest) {
  // Try to get the user for audit and optional global revocation
  const user = await getSession();
  const allDevices = req.headers.get("x-logout-all-devices") === "true";

  if (user) {
    if (allDevices) {
      await revokeAllSessions(user.uid);
    }
    void logAudit("user.logout", "user", { entityId: user.uid, details: { allDevices } });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
