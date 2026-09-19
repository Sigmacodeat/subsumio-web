import { z } from "zod";
import { resolvePortalAccess } from "@/lib/portal-access";
import { listPortalMessages } from "@/lib/portal-messages";
import { createPublicHandler, apiError } from "@/lib/api-handler";
import { clientIp } from "@/lib/auth/rate-limit";

import { logger } from "@/lib/logger";
const log = logger("api/portal/messages");

const messagesSchema = z.object({
  token: z.string().min(1, "token_and_caseSlug_required"),
  caseSlug: z.string().min(1, "token_and_caseSlug_required"),
});

export const GET = createPublicHandler(
  {
    query: messagesSchema,
    cors: true,
    rateLimitKey: (req) => `portal-messages:${clientIp(req.headers)}`,
    rateLimitMax: 30,
    rateLimitWindowMs: 60_000,
  },
  async (_req, _body, query) => {
    const access = await resolvePortalAccess(query.token);
    if (access instanceof Response) return access;
    if (access.caseSlug !== query.caseSlug) {
      return apiError("invalid_or_expired_token", "Token ungültig oder abgelaufen", 403);
    }

    try {
      const messages = await listPortalMessages(access.headers, access.caseSlug);
      return Response.json({ messages });
    } catch (err) {
      log.error("[portal/messages] failed:", err instanceof Error ? err.message : String(err));
      return apiError("load_failed", "Nachrichten konnten nicht geladen werden", 500);
    }
  }
);
