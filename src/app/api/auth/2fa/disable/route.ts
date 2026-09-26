import { createHandler } from "@/lib/api-handler";
import { getStore } from "@/lib/auth/store";
import { revokeAllSessions } from "@/lib/auth/session";
import { verifyPassword } from "@/lib/auth/password";
import { hit } from "@/lib/auth/rate-limit";
import { z } from "zod";
import { verifySecondFactor } from "@/lib/auth/second-factor";

export const dynamic = "force-dynamic";

const disableSchema = z.object({
  /** Required for accounts with a local password; SSO accounts have none. */
  password: z.string().max(1000).optional(),
  /** Current TOTP or backup code — the second factor itself must confirm. */
  code: z.string().min(1).max(20).optional(),
});

export const POST = createHandler(
  {
    action: "auth.2fa",
    body: disableSchema,
    audit: (ctx) => ({
      action: "settings.update",
      entityType: "user",
      entityId: ctx.user.id,
      details: { action: "2fa_disabled" },
    }),
  },
  async (ctx, body) => {
    const rl = await hit(`2fa:disable:${ctx.user.id}`, 5, 5 * 60 * 1000);
    if (!rl.ok) {
      return Response.json(
        { error: "rate_limited", message: "Zu viele Versuche. Bitte später versuchen." },
        { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } }
      );
    }

    const store = getStore();
    const user = await store.getById(ctx.user.id);
    if (!user) return Response.json({ error: "user_not_found" }, { status: 404 });

    if (!user.twoFactorEnabled) {
      return Response.json({ error: "2fa_not_enabled" }, { status: 400 });
    }

    // Same rule as re-running the setup: an account with a local password
    // proves it; an SSO account (no local password) proves itself with the
    // current code below — otherwise it could never switch 2FA off again.
    if (
      user.passwordHash &&
      !(body.password && (await verifyPassword(body.password, user.passwordHash)))
    ) {
      return Response.json({ error: "password_required" }, { status: 403 });
    }

    if (!body.code) {
      return Response.json({ error: "code_required" }, { status: 403 });
    }
    const factor = await verifySecondFactor(user, body.code);
    if (!factor.ok) {
      return Response.json(
        { error: factor.reason === "locked" ? "two_factor_locked" : "invalid_token" },
        { status: factor.reason === "locked" ? 429 : 403 }
      );
    }

    await store.update(ctx.user.id, {
      twoFactorEnabled: false,
      twoFactorSecret: null,
      twoFactorBackupCodes: null,
      pendingTwoFactorSecret: null,
      pendingTwoFactorExpiresAt: null,
    });

    await revokeAllSessions(ctx.user.id);

    return Response.json({ ok: true, disabled: true });
  }
);
