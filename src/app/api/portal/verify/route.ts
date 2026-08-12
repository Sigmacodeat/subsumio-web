import { z } from "zod";
import { verifyPortalToken } from "@/lib/portal-token";
import { createPublicHandler, apiError } from "@/lib/api-handler";
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
    const payload = await verifyPortalToken(query.token);
    if (!payload) {
      return apiError("invalid_or_expired_token", "Token ungültig oder abgelaufen", 403);
    }

    // Broadcast portal visit to the firm (realtime SSE)
    if (payload.brain_id) {
      broadcastPortalVisit(payload.brain_id, {
        caseSlug: payload.case_slug,
        action: "view",
        visitedAt: new Date().toISOString(),
      });
    }

    return Response.json({
      valid: true,
      caseSlug: payload.case_slug,
      expiresAt: payload.exp,
    });
  }
);
