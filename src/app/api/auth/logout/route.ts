import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/server";
import { SESSION_COOKIE, revokeAllSessions } from "@/lib/auth/session";
import { logAudit } from "@/lib/audit";
import { createHandler } from "@/lib/api-handler";

export const POST = createHandler(
  {
    action: "auth.logout",
    rateTier: "standard",
    audit: (ctx) => ({
      action: "user.logout",
      entityType: "user",
      entityId: ctx.user.id,
      details: { allDevices: true },
    }),
  },
  async (ctx) => {
    // Always revoke all sessions on logout — this invalidates any stolen JWT
    // immediately, not just when "logout all devices" is requested.
    // The version-based revocation system doesn't support single-session
    // revocation, so we revoke all for security.
    await revokeAllSessions(ctx.user.id);
    void logAudit("user.logout", "user", { entityId: ctx.user.id, details: { allDevices: true } });

    const res = NextResponse.json({ ok: true });
    res.cookies.delete(SESSION_COOKIE);
    return res;
  }
);
