import { z } from "zod";
import { portalToken } from "@/lib/portal-session";
import { resolvePortalAccess } from "@/lib/portal-access";
import { createPublicHandler } from "@/lib/api-handler";
import { clientIp } from "@/lib/auth/rate-limit";
import { broadcastPortalVisit } from "@/lib/realtime-bus";

const verifySchema = z.object({
  token: z.string().min(1, "token_required"),
});

export const GET = createPublicHandler(
  {
    query: verifySchema,
    cors: true,
    rateLimitKey: (req) => `portal-verify:${clientIp(req.headers)}`,
    rateLimitMax: 30,
    rateLimitWindowMs: 60_000,
  },
  async (req, _body, query) => {
    // Full gate — a link is only "valid" when the matter's portal is
    // actually reachable (enabled, not archived, link not revoked).
    const access = await resolvePortalAccess(portalToken(req, query.token));
    if (access instanceof Response) return access;

    // Broadcast portal visit to the firm (realtime SSE)
    broadcastPortalVisit(access.payload.brain_id, {
      caseSlug: access.caseSlug,
      action: "view",
      visitedAt: new Date().toISOString(),
    });

    return Response.json({
      valid: true,
      caseSlug: access.caseSlug,
      expiresAt: access.payload.exp,
    });
  }
);
