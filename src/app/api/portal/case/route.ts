import { z } from "zod";
import { ENGINE_URL, engineHeadersForBrain } from "@/lib/engine";
import { verifyPortalToken } from "@/lib/portal-token";
import { createPublicHandler, apiError } from "@/lib/api-handler";
import { clientIp } from "@/lib/auth/rate-limit";
import { caseFrontmatter } from "@/lib/legal-types";

const caseSchema = z.object({
  token: z.string().min(1, "token_required"),
});

export const GET = createPublicHandler(
  {
    query: caseSchema,
    cors: true,
    cacheMaxAge: 15,
    rateLimitKey: (req) => `portal-case:${clientIp(req.headers)}`,
    rateLimitMax: 30,
    rateLimitWindowMs: 60_000,
  },
  async (_req, _body, query) => {
    const payload = await verifyPortalToken(query.token);
    if (!payload) {
      return apiError("invalid_or_expired_token", "Token ungueltig oder abgelaufen", 403);
    }
    if (!payload.brain_id) {
      return apiError(
        "new_portal_link_required",
        "Bitte fordern Sie einen neuen Portal-Link bei Ihrer Kanzlei an.",
        403
      );
    }

    const res = await fetch(`${ENGINE_URL}/api/pages/${encodeURIComponent(payload.case_slug)}`, {
      headers: engineHeadersForBrain(payload.brain_id),
    });
    if (!res.ok) {
      return apiError(
        "case_not_found",
        "Akte konnte nicht geladen werden",
        res.status === 404 ? 404 : 502
      );
    }

    const page = await res.json();
    const fm = caseFrontmatter(page);
    if (!fm.portal_enabled) {
      return apiError(
        "portal_disabled",
        "Diese Akte ist derzeit nicht fuer das Mandantenportal freigegeben.",
        403
      );
    }

    return Response.json({ page });
  }
);
