import { cookies } from "next/headers";
import { getStore, buildNewUser, toPublic, type PublicUser } from "@/lib/auth/store";
import { hashPassword } from "@/lib/auth/password";
import { createSession, SESSION_COOKIE } from "@/lib/auth/session";
import { provisionBrainAsync } from "@/lib/provision";
import { registerSchema } from "@/lib/api-validation";
import { clientIp } from "@/lib/auth/rate-limit";
import { createPublicHandler, apiError } from "@/lib/api-handler";
import { z } from "zod";

import { logger } from "@/lib/logger";
const log = logger("api/auth/register");

// Extended schema with trimmed email and name for internal validation
const registerSchemaInternal = registerSchema.extend({
  email: z
    .string()
    .max(320)
    .transform((val) => val.trim().toLowerCase()),
  name: z
    .string()
    .max(200)
    .transform((val) => val.trim()),
});

export const POST = createPublicHandler(
  {
    body: registerSchemaInternal,
    rateLimitKey: (req) => `register:ip:${clientIp(req.headers)}`,
    rateLimitMax: 5,
    rateLimitWindowMs: 60 * 60_000,
  },
  async (req, body) => {
    const { email, password, name, referredBy } = body;
    const industry = "legal";

    try {
      const store = getStore();
      const existing = await store.getByEmail(email);
      if (existing) {
        return apiError("email_exists", "Email already exists", 409);
      }

      const draft = await buildNewUser({
        email,
        name,
        passwordHash: await hashPassword(password),
        locale: "de",
        referredBy: referredBy || null,
        industry,
        startTrial: true,
      });

      const user = await store.create(draft);

      provisionBrainAsync(user.brainId, { industry });

      const session = await createSession(user.id, user.email, user.role);
      const jar = await cookies();
      jar.set(SESSION_COOKIE, session.token, session.cookieOptions);

      return Response.json({ user: toPublic(user) as PublicUser, success: true });
    } catch (err: unknown) {
      log.error("[auth/register]", err instanceof Error ? err.message : String(err));
      return apiError("server_error", "Server error", 500);
    }
  }
);
