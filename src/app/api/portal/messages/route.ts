import { z } from "zod";
import { ENGINE_URL, engineHeadersForBrain } from "@/lib/engine";
import { verifyPortalToken } from "@/lib/portal-token";
import { createPublicHandler, apiError } from "@/lib/api-handler";
import { clientIp } from "@/lib/auth/rate-limit";
import type { BrainPage } from "@/lib/types";

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
  async (req, _body, query) => {
    const payload = await verifyPortalToken(query.token);
    if (!payload || payload.case_slug !== query.caseSlug) {
      return apiError("invalid_or_expired_token", "Token ungültig oder abgelaufen", 403);
    }
    if (!payload.brain_id) {
      return apiError(
        "new_portal_link_required",
        "Bitte fordern Sie einen neuen Portal-Link bei Ihrer Kanzlei an.",
        403
      );
    }

    try {
      const res = await fetch(`${ENGINE_URL}/api/pages?type=portal_message&limit=100`, {
        headers: engineHeadersForBrain(payload.brain_id),
      });
      if (!res.ok) return apiError("load_failed", "Nachrichten konnten nicht geladen werden", 502);
      const data = await res.json();
      const pages: BrainPage[] = Array.isArray(data)
        ? data
        : Array.isArray(data?.pages)
          ? data.pages
          : Array.isArray(data?.items)
            ? data.items
            : [];
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
  }
);
