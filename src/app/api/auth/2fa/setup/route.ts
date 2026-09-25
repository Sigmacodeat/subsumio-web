import { z } from "zod";
import { createHandler } from "@/lib/api-handler";
import { getStore } from "@/lib/auth/store";
import { verifyPassword } from "@/lib/auth/password";
import { hit } from "@/lib/auth/rate-limit";
import { verifySecondFactor } from "@/lib/auth/second-factor";
import { generateSecret, otpAuthURL } from "@/lib/totp";

export const dynamic = "force-dynamic";

const PENDING_TTL_MS = 10 * 60 * 1000; // 10 minutes

/** Re-enrolment while 2FA is active: proof of password AND current factor. */
const reauthSchema = z.object({
  password: z.string().max(1000).optional(),
  code: z.string().min(1).max(20),
});

export const POST = createHandler(
  {
    action: "auth.2fa",
    audit: (ctx) => ({
      action: "settings.update",
      entityType: "user",
      entityId: ctx.user.id,
      details: { action: "2fa_setup_initiated" },
    }),
  },
  async (ctx, body) => {
    const store = getStore();
    const user = await store.getById(ctx.user.id);
    if (!user) return Response.json({ error: "user_not_found" }, { status: 404 });

    // An active second factor may only be replaced by someone who can prove
    // BOTH factors — a session alone must not be able to swap the secret.
    if (user.twoFactorEnabled) {
      const rl = await hit(`2fa:reenrol:${user.id}`, 5, 5 * 60 * 1000);
      if (!rl.ok) {
        return Response.json(
          { error: "rate_limited", message: "Zu viele Versuche. Bitte später versuchen." },
          { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } }
        );
      }
      // The handler already parsed the (schema-less) JSON body.
      const parsed = reauthSchema.safeParse(body ?? null);
      if (!parsed.success) {
        return Response.json(
          {
            error: "reauth_required",
            message:
              "Zwei-Faktor-Anmeldung ist bereits aktiv. Zum Neu-Einrichten bitte Passwort und aktuellen Code angeben.",
          },
          { status: 403 }
        );
      }
      // SSO accounts have no local password — for them the current code is the proof.
      if (
        user.passwordHash &&
        !(parsed.data.password && (await verifyPassword(parsed.data.password, user.passwordHash)))
      ) {
        return Response.json({ error: "password_required" }, { status: 403 });
      }
      const factor = await verifySecondFactor(user, parsed.data.code);
      if (!factor.ok) {
        return Response.json(
          { error: factor.reason === "locked" ? "two_factor_locked" : "invalid_token" },
          { status: factor.reason === "locked" ? 429 : 403 }
        );
      }
    }

    const secret = generateSecret();
    const url = otpAuthURL(secret, ctx.user.email);

    await store.update(ctx.user.id, {
      pendingTwoFactorSecret: secret,
      pendingTwoFactorExpiresAt: new Date(Date.now() + PENDING_TTL_MS).toISOString(),
    });

    return Response.json({ url, qrData: url });
  }
);
