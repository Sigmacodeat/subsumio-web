import { NextResponse } from "next/server";
import { SESSION_COOKIE, revokeAllSessions } from "@/lib/auth/session";
import { revokeSession } from "@/lib/auth/session-registry";
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
      details: { allDevices: !ctx.sessionId },
    }),
  },
  async (ctx) => {
    // Registry-backed sessions revoke only this device — the other devices
    // stay signed in, matching what every modern SaaS does on "Abmelden".
    // Sessions issued before the registry existed carry no sid and can only
    // be killed via the version floor, so they still fall back to revoke-all.
    if (ctx.sessionId) {
      await revokeSession(ctx.user.id, ctx.sessionId);
    } else {
      await revokeAllSessions(ctx.user.id);
    }
    void logAudit("user.logout", "user", {
      entityId: ctx.user.id,
      details: { allDevices: !ctx.sessionId },
    });

    const res = NextResponse.json({ ok: true });
    res.cookies.delete(SESSION_COOKIE);
    return res;
  }
);
