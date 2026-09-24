import { z } from "zod";
import { createPublicHandler } from "@/lib/api-handler";
import { clientIp } from "@/lib/auth/rate-limit";
import { resolvePortalAccess } from "@/lib/portal-access";
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
    // Full gate — a revoked/dead link must not mint a session cookie.
    const access = await resolvePortalAccess(body.token);
    if (access instanceof Response) return access;
    const exp = access.payload.exp;
    const res = Response.json({ ok: true, expires_at: new Date(exp * 1000).toISOString() });
    res.headers.append(
      "Set-Cookie",
      portalSessionCookie(body.token, exp - Math.floor(Date.now() / 1000))
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
