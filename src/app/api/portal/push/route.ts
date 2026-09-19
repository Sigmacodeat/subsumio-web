import { z } from "zod";
import { portalToken } from "@/lib/portal-session";
import { createPublicHandler, apiError } from "@/lib/api-handler";
import { clientIp } from "@/lib/auth/rate-limit";
import { resolvePortalAccess } from "@/lib/portal-access";
import {
  isPushServiceEndpoint,
  portalPushPublicKey,
  removePortalSubscription,
  savePortalSubscription,
} from "@/lib/portal-push";

export const dynamic = "force-dynamic";

const subscriptionSchema = z.object({
  endpoint: z.string().url().max(2_000),
  keys: z.object({ p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(100) }),
});

const postSchema = z.object({ token: z.string().min(1), subscription: subscriptionSchema });
const deleteSchema = z.object({ token: z.string().min(1), endpoint: z.string().url().max(2_000) });

/** Whether notifications are available, and the key the browser subscribes with. */
export const GET = createPublicHandler({ cors: true }, async () =>
  Response.json({ public_key: portalPushPublicKey() })
);

/** Subscribe this device to the portal link's matter. */
export const POST = createPublicHandler(
  {
    body: postSchema,
    cors: true,
    skipCsrf: true,
    rateLimitKey: (req) => `portal-push:${clientIp(req.headers)}`,
    rateLimitMax: 10,
    rateLimitWindowMs: 60_000,
  },
  async (req, body) => {
    if (!portalPushPublicKey()) {
      return apiError("push_unavailable", "Benachrichtigungen sind nicht eingerichtet.", 503);
    }
    if (!isPushServiceEndpoint(body.subscription.endpoint)) {
      return apiError("invalid_endpoint", "Unbekannter Benachrichtigungsdienst.", 400);
    }
    const token = portalToken(req, body.token);
    const access = await resolvePortalAccess(token);
    if (access instanceof Response) return access;
    await savePortalSubscription({
      ...body.subscription,
      brainId: access.payload.brain_id,
      caseSlug: access.caseSlug,
      portalPath: `/portal/${encodeURIComponent(token)}`,
    });
    return Response.json({ ok: true });
  }
);

/** Unsubscribe this device. */
export const DELETE = createPublicHandler(
  {
    body: deleteSchema,
    cors: true,
    skipCsrf: true,
    rateLimitKey: (req) => `portal-push:${clientIp(req.headers)}`,
    rateLimitMax: 10,
    rateLimitWindowMs: 60_000,
  },
  async (req, body) => {
    const access = await resolvePortalAccess(portalToken(req, body.token));
    if (access instanceof Response) return access;
    await removePortalSubscription(body.endpoint);
    return Response.json({ ok: true });
  }
);
