import { z } from "zod";
import { portalToken } from "@/lib/portal-session";
import { resolvePortalAccess } from "@/lib/portal-access";
import { createPublicHandler } from "@/lib/api-handler";
import { clientIp } from "@/lib/auth/rate-limit";
import { buildPortalCaseView } from "@/lib/portal-view";

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
    return Response.json({ page: buildPortalCaseView(access.page) });
  }
);
