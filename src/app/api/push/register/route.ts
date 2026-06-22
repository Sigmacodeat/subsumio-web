import { createHandler } from "@/lib/api-handler";
import { z } from "zod";

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
      entityId: (body as { deviceId?: string }).deviceId || "unknown",
      details: { platform: (body as { platform: string }).platform },
    }),
  },
  async (ctx, body) => {
    const { token, platform, deviceId } = body;

    // Store push token in user metadata for later use.
    // In production, this would write to a dedicated push_tokens table.
    console.log(
      `[push-register] user=${ctx.user.id} platform=${platform} device=${deviceId ?? "n/a"} token=${token.slice(0, 12)}…`
    );

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
    console.log(`[push-unregister] user=${ctx.user.id} token=${body.token.slice(0, 12)}…`);
    return Response.json({ ok: true, unregistered: true });
  }
);
