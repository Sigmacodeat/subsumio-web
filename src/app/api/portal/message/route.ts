
import { z } from "zod";
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

    try {
      const { api } = await import("@/lib/api");
      const slug = `portal-message/${payload.case_slug}/${Date.now()}`;
      await api.brain.createPage({
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
      });
      return Response.json({ ok: true });
    } catch (err) {
      console.error("[portal/message] failed:", err instanceof Error ? err.message : String(err));
      return apiError("save_failed", "Nachricht konnte nicht gespeichert werden", 500);
    }
  },
);
