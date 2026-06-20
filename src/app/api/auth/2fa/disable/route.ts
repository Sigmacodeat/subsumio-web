import { createHandler } from "@/lib/api-handler";
import { getStore } from "@/lib/auth/store";
import { revokeAllSessions } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export const POST = createHandler(
  {
    action: "settings.write",
    audit: (ctx) => ({
      action: "settings.update",
      entityType: "user",
      entityId: ctx.user.id,
      details: { action: "2fa_disabled" },
    }),
  },
  async (ctx) => {
    const store = getStore();
    const user = await store.getById(ctx.user.id);
    if (!user) return Response.json({ error: "user_not_found" }, { status: 404 });

    if (!user.twoFactorEnabled) {
      return Response.json({ error: "2fa_not_enabled" }, { status: 400 });
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
  },
);
