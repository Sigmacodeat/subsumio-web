import { z } from "zod";
import { createPublicHandler, apiError } from "@/lib/api-handler";
import { clientIp } from "@/lib/auth/rate-limit";
import { verifyPortalToken } from "@/lib/portal-token";
import { clearPortalSessionCookie, portalSessionCookie } from "@/lib/portal-session";

export const dynamic = "force-dynamic";

const postSchema = z.object({ token: z.string().min(1).max(2_000) });

/** Exchange the portal link's token for a session cookie (lib/portal-session.ts). */
export const POST = createPublicHandler(
  {
    body: postSchema,
    skipCsrf: true,
    rateLimitKey: (req) => `portal-session:${clientIp(req.headers)}`,
    rateLimitMax: 20,
    rateLimitWindowMs: 60_000,
  },
  async (_req, body) => {
    const payload = await verifyPortalToken(body.token);
    if (!payload) {
      return apiError("invalid_or_expired_token", "Token ungültig oder abgelaufen", 403);
    }
    const res = Response.json({ ok: true, expires_at: new Date(payload.exp * 1000).toISOString() });
    res.headers.append(
      "Set-Cookie",
      portalSessionCookie(body.token, payload.exp - Math.floor(Date.now() / 1000))
    );
    return res;
  }
);

/** Sign this device out of the portal. */
export const DELETE = createPublicHandler({ skipCsrf: true }, async () => {
  const res = Response.json({ ok: true });
  res.headers.append("Set-Cookie", clearPortalSessionCookie());
  return res;
});
