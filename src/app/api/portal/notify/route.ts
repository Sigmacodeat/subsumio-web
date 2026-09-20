import { z } from "zod";
import { portalToken } from "@/lib/portal-session";
import { createPublicHandler, apiError } from "@/lib/api-handler";
import { clientIp } from "@/lib/auth/rate-limit";
import { resolvePortalAccess } from "@/lib/portal-access";
import { removePortalNotify, requestPortalNotify } from "@/lib/portal-notify";

export const dynamic = "force-dynamic";

const postSchema = z.object({
  token: z.string().min(1),
  email: z.string().trim().email().max(200),
});
const deleteSchema = postSchema;

/** Ask for e-mail notifications; a confirmation link goes to the address (lib/portal-notify.ts). */
export const POST = createPublicHandler(
  {
    body: postSchema,
    cors: true,
    skipCsrf: true,
    rateLimitKey: (req) => `portal-notify:${clientIp(req.headers)}`,
    rateLimitMax: 5,
    rateLimitWindowMs: 60 * 60_000,
  },
  async (req, body) => {
    const token = portalToken(req, body.token);
    const access = await resolvePortalAccess(token);
    if (access instanceof Response) return access;
    const ok = await requestPortalNotify({
      headers: access.headers,
      caseSlug: access.caseSlug,
      token,
      email: body.email,
    });
    if (!ok) return apiError("save_failed", "Das hat leider nicht geklappt.", 502);
    return Response.json({ ok: true, pending: true });
  }
);

/** Stop e-mail notifications for this address. */
export const DELETE = createPublicHandler(
  {
    body: deleteSchema,
    cors: true,
    skipCsrf: true,
    rateLimitKey: (req) => `portal-notify:${clientIp(req.headers)}`,
    rateLimitMax: 10,
    rateLimitWindowMs: 60 * 60_000,
  },
  async (req, body) => {
    const access = await resolvePortalAccess(portalToken(req, body.token));
    if (access instanceof Response) return access;
    await removePortalNotify(access.headers, access.caseSlug, body.email);
    return Response.json({ ok: true });
  }
);
