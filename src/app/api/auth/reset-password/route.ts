import { NextRequest, NextResponse } from "next/server";
import { getStore } from "@/lib/auth/store";
import { hashPassword } from "@/lib/auth/password";
import { verifyActionToken, bindFragment } from "@/lib/auth/tokens";
import { passwordSchema } from "@/lib/api-validation";
import { revokeAllSessions } from "@/lib/auth/session";
import { clientIp } from "@/lib/auth/rate-limit";
import { createPublicHandler, apiError } from "@/lib/api-handler";
import { z } from "zod";

const resetPasswordSchema = z.object({
  token: z.string(),
  password: passwordSchema,
});

export const POST = createPublicHandler(
  {
    body: resetPasswordSchema,
    rateLimitKey: (req) => `reset-password:ip:${clientIp(req.headers)}`,
    rateLimitMax: 10,
    rateLimitWindowMs: 15 * 60_000,
  },
  async (_req, body) => {
    const { token, password } = body;

    const payload = await verifyActionToken(token, "reset");
    if (!payload) {
      return apiError("invalid_or_expired_token", "Invalid or expired token", 400);
    }

    const store = getStore();
    const user = await store.getById(payload.uid);
    if (!user) {
      return apiError("invalid_or_expired_token", "Invalid or expired token", 400);
    }

    const currentBind = await bindFragment(user.passwordHash);
    if (currentBind !== payload.bind) {
      return apiError("invalid_or_expired_token", "Invalid or expired token", 400);
    }

    await store.update(user.id, { passwordHash: await hashPassword(password) });
    await revokeAllSessions(user.id);
    return Response.json({ success: true });
  }
);
