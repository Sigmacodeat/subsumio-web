import { z } from "zod";
import { ENGINE_URL } from "@/lib/engine";
import { resolvePortalAccess } from "@/lib/portal-access";
import { portalMessageSlugPrefix } from "@/lib/portal-messages";
import { createPublicHandler, apiError } from "@/lib/api-handler";
import { clientIp } from "@/lib/auth/rate-limit";

import { logger } from "@/lib/logger";
const log = logger("api/portal/message");

const messageSchema = z.object({
  token: z.string().min(1, "token_and_message_required"),
  message: z.string().min(1, "token_and_message_required").max(5_000, "message_too_long"),
});

export const POST = createPublicHandler(
  {
    body: messageSchema,
    cors: true,
    skipCsrf: true,
    rateLimitKey: (req) => `portal-msg:ip:${clientIp(req.headers)}`,
    rateLimitMax: 10,
    rateLimitWindowMs: 60_000,
  },
  async (_req, body, _query) => {
    const access = await resolvePortalAccess(body.token);
    if (access instanceof Response) return access;

    const text = body.message.trim();
    try {
      const res = await fetch(`${ENGINE_URL}/api/pages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...access.headers },
        body: JSON.stringify({
          slug: `${portalMessageSlugPrefix(access.caseSlug)}${Date.now()}`,
          title: `Nachricht vom Mandanten`,
          type: "portal_message",
          content: text,
          frontmatter: {
            type: "portal_message",
            case_slug: access.caseSlug,
            sender: "client",
            // Page listings carry no content; the inbox reads the text from here.
            message: text,
            created_at: new Date().toISOString(),
          },
        }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) return apiError("save_failed", "Nachricht konnte nicht gespeichert werden", 502);
      return Response.json({ ok: true });
    } catch (err) {
      log.error("[portal/message] failed:", err instanceof Error ? err.message : String(err));
      return apiError("save_failed", "Nachricht konnte nicht gespeichert werden", 500);
    }
  }
);
