
import { z } from "zod";
import { verifyPortalToken } from "@/lib/portal-token";
import { createPublicHandler, apiError } from "@/lib/api-handler";

const messagesSchema = z.object({
  token: z.string().min(1, "token_and_caseSlug_required"),
  caseSlug: z.string().min(1, "token_and_caseSlug_required"),
});

export const GET = createPublicHandler(
  {
    query: messagesSchema,
    cors: true,
  },
  async (req, _body, query) => {
    const payload = await verifyPortalToken(query.token);
    if (!payload || payload.case_slug !== query.caseSlug) {
      return apiError("invalid_or_expired_token", "Token ungültig oder abgelaufen", 403);
    }

    try {
      const { api } = await import("@/lib/api");
      const pages = await api.brain.listPages({ type: "portal_message", limit: 100 });
      const messages = pages
        .filter((p) => (p.frontmatter as Record<string, unknown>).case_slug === query.caseSlug)
        .map((p) => {
          const fm = p.frontmatter as Record<string, unknown>;
          return {
            id: p.slug,
            text: p.content || "",
            sender: String(fm.sender ?? "client"),
            createdAt: String(fm.created_at ?? p.created_at),
          };
        })
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

      return Response.json({ messages });
    } catch (err) {
      console.error("[portal/messages] failed:", err instanceof Error ? err.message : String(err));
      return apiError("load_failed", "Nachrichten konnten nicht geladen werden", 500);
    }
  },
);
