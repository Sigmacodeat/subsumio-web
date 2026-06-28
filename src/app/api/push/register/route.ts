import { createHandler } from "@/lib/api-handler";
import { z } from "zod";
import { registerPushToken, unregisterPushToken } from "@/lib/push-token-store";

const registerSchema = z.object({
  token: z.string().min(10),
  platform: z.enum(["ios", "android"]),
  deviceId: z.string().optional(),
});

export const POST = createHandler(
  {
    action: "push.register",
    rateTier: "standard",
    body: registerSchema,
    audit: (ctx, body) => ({
      action: "settings.update" as const,
      entityType: "device",
      entityId: body.deviceId || "unknown",
      details: { platform: body.platform },
    }),
  },
  async (ctx, body) => {
    const { token, platform, deviceId } = body;

    await registerPushToken(ctx.user.id, token, platform, deviceId);

    if (process.env.NODE_ENV !== "production") {
      console.debug(
        `[push-register] user=${ctx.user.id} platform=${platform} device=${deviceId ?? "n/a"} token=${token.slice(0, 8)}…`
      );
    }

    return Response.json({ ok: true, registered: true });
  }
);

export const DELETE = createHandler(
  {
    action: "push.unregister",
    rateTier: "standard",
    body: z.object({ token: z.string().min(10) }),
  },
  async (ctx, body) => {
    await unregisterPushToken(ctx.user.id, body.token);

    if (process.env.NODE_ENV !== "production") {
      console.debug(`[push-unregister] user=${ctx.user.id}`);
    }
    return Response.json({ ok: true, unregistered: true });
  }
);
