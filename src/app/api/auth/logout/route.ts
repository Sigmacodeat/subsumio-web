import { NextResponse } from "next/server";
import { SESSION_COOKIE, revokeAllSessions } from "@/lib/auth/session";
import { revokeSession } from "@/lib/auth/session-registry";
import { logAudit } from "@/lib/audit";
import { createHandler } from "@/lib/api-handler";
import { unregisterPushEndpoint } from "@/lib/push-token-store";
import { z } from "zod";

const logoutSchema = z
  .object({
    /** This browser's web-push endpoint — its registration ends with the session. */
    pushEndpoint: z.string().url().max(2000).optional(),
  })
  .optional();

export const POST = createHandler(
  {
    action: "auth.logout",
    rateTier: "standard",
    // No body schema: a plain logout without body must keep working.
    audit: (ctx) => ({
      action: "user.logout",
      entityType: "user",
      entityId: ctx.user.id,
      details: { allDevices: !ctx.sessionId },
    }),
  },
  async (ctx, rawBody) => {
    const parsed = logoutSchema.safeParse(rawBody ?? undefined);
    const body = parsed.success ? parsed.data : undefined;
    // Registry-backed sessions revoke only this device — the other devices
    // stay signed in, matching what every modern SaaS does on "Abmelden".
    // Sessions issued before the registry existed carry no sid and can only
    // be killed via the version floor, so they still fall back to revoke-all.
    if (ctx.sessionId) {
      await revokeSession(ctx.user.id, ctx.sessionId);
      // This device stops receiving the user's push notifications (the next
      // person on a shared device must not see matter or deadline titles).
      if (body?.pushEndpoint) {
        await unregisterPushEndpoint(ctx.user.id, body.pushEndpoint).catch(() => 0);
      }
    } else {
      // Revoke-all also removes every push registration (revocation-store).
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
