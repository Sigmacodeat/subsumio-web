
import { z } from "zod";
import { ENGINE_URL, engineHeadersForBrain } from "@/lib/engine";
import { verifyPortalToken } from "@/lib/portal-token";
import { createPublicHandler, apiError } from "@/lib/api-handler";
import { clientIp } from "@/lib/auth/rate-limit";

const messageSchema = z.object({
  token: z.string().min(1, "token_and_message_required"),
  message: z.string().min(1, "token_and_message_required").max(5_000, "message_too_long"),
});

export const POST = createPublicHandler(
  {
    body: messageSchema,
    cors: true,
    rateLimitKey: (req) => `portal-msg:ip:${clientIp(req.headers)}`,
    rateLimitMax: 10,
    rateLimitWindowMs: 60_000,
  },
  async (req, body, _query) => {
    const payload = await verifyPortalToken(body.token);
    if (!payload) {
      return apiError("invalid_or_expired_token", "Token ungültig oder abgelaufen", 403);
    }
    if (!payload.brain_id) {
      return apiError("new_portal_link_required", "Bitte fordern Sie einen neuen Portal-Link bei Ihrer Kanzlei an.", 403);
    }

    try {
      const slug = `portal-message/${payload.case_slug}/${Date.now()}`;
      const res = await fetch(`${ENGINE_URL}/api/pages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...engineHeadersForBrain(payload.brain_id) },
        body: JSON.stringify({
          slug,
          title: `Nachricht vom Mandanten`,
          type: "portal_message",
          content: body.message.trim(),
          frontmatter: {
            type: "portal_message",
            case_slug: payload.case_slug,
            sender: "client",
            created_at: new Date().toISOString(),
          },
        }),
      });
      if (!res.ok) return apiError("save_failed", "Nachricht konnte nicht gespeichert werden", 502);
      return Response.json({ ok: true });
    } catch (err) {
      console.error("[portal/message] failed:", err instanceof Error ? err.message : String(err));
      return apiError("save_failed", "Nachricht konnte nicht gespeichert werden", 500);
    }
  },
);
