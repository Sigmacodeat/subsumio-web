import { createHandler } from "@/lib/api-handler";
import { z } from "zod";
import { createHash } from "node:crypto";
import { registerPushToken, unregisterPushToken } from "@/lib/push-token-store";
import { parseWebPushSubscription, webPushPublicKey } from "@/lib/web-push-core";
import { logger } from "@/lib/logger";

const log = logger("push-register");

const registerSchema = z.object({
  /** Device token (ios/android) or the browser's push subscription as JSON (web). */
  token: z.string().min(10).max(4_000),
  platform: z.enum(["ios", "android", "web"]),
  deviceId: z.string().max(200).optional(),
});

/** Whether web push is available, and the key browsers subscribe with. */
export const GET = createHandler({ action: "push.register", rateTier: "standard" }, async () =>
  Response.json({ public_key: webPushPublicKey() })
);

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
    const { token, platform } = body;
    let deviceId = body.deviceId;
    if (platform === "web") {
      // Only real push services; one entry per browser (keyed by its endpoint).
      const sub = parseWebPushSubscription(token);
      if (!sub) {
        return Response.json({ error: "invalid_subscription" }, { status: 400 });
      }
      deviceId = `web:${createHash("sha256").update(sub.endpoint).digest("hex").slice(0, 32)}`;
    }

    await registerPushToken(ctx.user.id, token, platform, deviceId);

    log.debug("token registered", {
      userId: ctx.user.id,
      platform,
      deviceId: deviceId ?? "n/a",
      tokenPrefix: token.slice(0, 8),
    });

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

    log.debug("token unregistered", { userId: ctx.user.id });
    return Response.json({ ok: true, unregistered: true });
  }
);
