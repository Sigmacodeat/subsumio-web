import { z } from "zod";
import { NextResponse } from "next/server";
import { createHandler } from "@/lib/api-handler";
import { getStore } from "@/lib/auth/store";
import { verifyTOTP } from "@/lib/totp";
import { hit } from "@/lib/auth/rate-limit";
import { generateBackupCodes, hashBackupCodes } from "@/lib/auth/backup-codes";
import { createSession, SESSION_COOKIE } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

const verify2faSchema = z.object({
  token: z.string().min(1).max(10),
});

export const POST = createHandler(
  {
    action: "auth.2fa",
    body: verify2faSchema,
    audit: (ctx) => ({
      action: "settings.update",
      entityType: "user",
      entityId: ctx.user.id,
      details: { action: "2fa_enabled" },
    }),
  },
  async (ctx, body) => {
    const rl = await hit(`2fa:verify:${ctx.user.id}`, 5, 5 * 60 * 1000);
    if (!rl.ok) {
      return Response.json(
        { error: "rate_limited", message: "Zu viele Versuche. Bitte später versuchen." },
        { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } }
      );
    }

    const store = getStore();
    const user = await store.getById(ctx.user.id);
    if (!user) return Response.json({ error: "user_not_found" }, { status: 404 });

    const pendingSecret = user.pendingTwoFactorSecret;
    const pendingExpires = user.pendingTwoFactorExpiresAt;

    if (!pendingSecret) return Response.json({ error: "setup_required" }, { status: 400 });

    if (pendingExpires && new Date(pendingExpires) < new Date()) {
      await store.update(ctx.user.id, {
        pendingTwoFactorSecret: null,
        pendingTwoFactorExpiresAt: null,
      });
      return Response.json({ error: "setup_expired" }, { status: 410 });
    }

    const valid = await verifyTOTP(body.token, pendingSecret);
    if (!valid) return Response.json({ error: "invalid_token" }, { status: 400 });

    const backupCodes = generateBackupCodes();
    const hashedCodes = await hashBackupCodes(backupCodes);

    await store.update(ctx.user.id, {
      twoFactorSecret: pendingSecret,
      twoFactorEnabled: true,
      pendingTwoFactorSecret: null,
      pendingTwoFactorExpiresAt: null,
      twoFactorBackupCodes: hashedCodes,
    });

    // Re-issue the session without must2fa: the login-time session was
    // stateless (JWT-signed) and, if the org requires 2FA, was minted with
    // must2fa: true confining the user to this settings page (see
    // middleware.ts). Without re-issuing here, that flag would otherwise
    // stick around for the rest of the session's 30-day lifetime even
    // though 2FA is now set up.
    const session = await createSession(ctx.user.id, ctx.user.email, ctx.user.role);
    const res = NextResponse.json({ ok: true, enabled: true, backupCodes });
    res.cookies.set(SESSION_COOKIE, session.token, session.cookieOptions);
    return res;
  }
);
