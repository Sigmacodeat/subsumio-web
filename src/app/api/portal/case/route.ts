import { z } from "zod";
import { portalToken } from "@/lib/portal-session";
import { resolvePortalAccess } from "@/lib/portal-access";
import { createPublicHandler } from "@/lib/api-handler";
import { clientIp } from "@/lib/auth/rate-limit";
import { buildPortalCaseView } from "@/lib/portal-view";
import { portalAiModeForBrain } from "@/lib/portal-ai-mode-server";

const caseSchema = z.object({
  token: z.string().min(1, "token_required"),
});

export const GET = createPublicHandler(
  {
    query: caseSchema,
    cors: true,
    rateLimitKey: (req) => `portal-case:${clientIp(req.headers)}`,
    rateLimitMax: 30,
    rateLimitWindowMs: 60_000,
  },
  async (req, _body, query) => {
    const access = await resolvePortalAccess(portalToken(req, query.token));
    if (access instanceof Response) return access;

    // Never hand the raw page to the client: whitelisted fields + released documents only.
    // ai_mode tells the portal how to show its assistant (hidden, "message to
    // the firm" or labelled direct answers); /api/portal/chat enforces it.
    return Response.json({
      page: buildPortalCaseView(access.page),
      ai_mode: await portalAiModeForBrain(access.payload.brain_id),
    });
  }
);
