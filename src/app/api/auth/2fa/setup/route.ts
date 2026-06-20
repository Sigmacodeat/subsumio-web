import { createHandler } from "@/lib/api-handler";
import { getStore } from "@/lib/auth/store";
import { generateSecret, otpAuthURL } from "@/lib/totp";

export const dynamic = "force-dynamic";

const PENDING_TTL_MS = 10 * 60 * 1000; // 10 minutes

export const POST = createHandler(
  {
    action: "settings.write",
    audit: (ctx) => ({
      action: "settings.update",
      entityType: "user",
      entityId: ctx.user.id,
      details: { action: "2fa_setup_initiated" },
    }),
  },
  async (ctx) => {
    const secret = generateSecret();
    const url = otpAuthURL(secret, ctx.user.email);

    const store = getStore();
    await store.update(ctx.user.id, {
      pendingTwoFactorSecret: secret,
      pendingTwoFactorExpiresAt: new Date(Date.now() + PENDING_TTL_MS).toISOString(),
    });

    return Response.json({ url, qrData: url });
  },
);
