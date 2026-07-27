import { createPublicHandler } from "@/lib/api-handler";
import { getStore } from "@/lib/auth/store";
import { verifyActionToken, bindFragment } from "@/lib/auth/tokens";
import { clientIp } from "@/lib/auth/rate-limit";
import { env } from "@/lib/env";
import { z } from "zod";

const verifySchema = z.object({
  token: z.string(),
});

export const GET = createPublicHandler(
  {
    query: verifySchema,
    rateLimitKey: (req) => `auth-verify:ip:${clientIp(req.headers)}`,
    rateLimitMax: 20,
    rateLimitWindowMs: 60_000,
  },
  async (_req, _body, query) => {
    const { token } = query;
    const payload = await verifyActionToken(token, "verify");
    const appUrl = env("NEXT_PUBLIC_APP_URL") || "https://subsum.eu";
    if (!payload) {
      return Response.redirect(new URL("/login?verify=invalid", appUrl));
    }

    const store = getStore();
    const user = await store.getById(payload.uid);
    if (!user || (await bindFragment(user.email)) !== payload.bind) {
      return Response.redirect(new URL("/login?verify=invalid", appUrl));
    }

    if (!user.emailVerifiedAt) {
      await store.update(user.id, { emailVerifiedAt: new Date().toISOString() });
    }
    // Logged-in users land in the app; logged-out users hit the login redirect.
    return Response.redirect(new URL("/dashboard", appUrl));
  }
);
