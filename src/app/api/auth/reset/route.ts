import { NextResponse } from "next/server";
import { hashPassword } from "@/lib/auth/password";
import { getStore } from "@/lib/auth/store";
import { verifyActionToken, bindFragment } from "@/lib/auth/tokens";
import { clientIp } from "@/lib/auth/rate-limit";
import { revokeAllSessions } from "@/lib/auth/session";
import { logAudit } from "@/lib/audit";
import { passwordSchema } from "@/lib/api-validation";
import { createPublicHandler, apiError } from "@/lib/api-handler";
import { z } from "zod";

const resetSchema = z.object({
  token: z.string(),
  password: passwordSchema,
});

export const POST = createPublicHandler(
  {
    body: resetSchema,
    rateLimitKey: (req) => `reset:ip:${clientIp(req.headers)}`,
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

    // Binding check: the token was issued against the CURRENT password hash.
    // Once the password changes (by this or any other reset), the token dies.
    if ((await bindFragment(user.passwordHash)) !== payload.bind) {
      return apiError("invalid_or_expired_token", "Invalid or expired token", 400);
    }

    await store.update(user.id, { passwordHash: await hashPassword(password) });
    await revokeAllSessions(user.id);
    void logAudit("settings.update", "password_reset", { entityId: user.id });
    return NextResponse.json({ ok: true });
  }
);
