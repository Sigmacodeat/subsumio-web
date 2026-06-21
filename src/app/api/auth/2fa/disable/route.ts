import { createHandler } from "@/lib/api-handler";
import { getStore } from "@/lib/auth/store";
import { revokeAllSessions } from "@/lib/auth/session";
import { verifyPassword } from "@/lib/auth/password";
import { z } from "zod";

export const dynamic = "force-dynamic";

const disableSchema = z.object({
  password: z.string().min(1),
});

export const POST = createHandler(
  {
    action: "settings.write",
    body: disableSchema,
    audit: (ctx) => ({
      action: "settings.update",
      entityType: "user",
      entityId: ctx.user.id,
      details: { action: "2fa_disabled" },
    }),
  },
  async (ctx, body) => {
    const store = getStore();
    const user = await store.getById(ctx.user.id);
    if (!user) return Response.json({ error: "user_not_found" }, { status: 404 });

    if (!user.twoFactorEnabled) {
      return Response.json({ error: "2fa_not_enabled" }, { status: 400 });
    }

    if (!user.passwordHash || !(await verifyPassword(body.password, user.passwordHash))) {
      return Response.json({ error: "password_required" }, { status: 403 });
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
