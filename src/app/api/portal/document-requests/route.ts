import { z } from "zod";
import { ENGINE_URL, engineHeadersForBrain } from "@/lib/engine";
import { apiError, createPublicHandler } from "@/lib/api-handler";
import { verifyPortalToken } from "@/lib/portal-token";
import { clientIp } from "@/lib/auth/rate-limit";
import { documentRequestFromPage } from "@/lib/document-requests";
import type { BrainPage } from "@/lib/types";

const querySchema = z.object({
  token: z.string().min(1, "token_required"),
});

function pagesFrom(data: unknown): BrainPage[] {
  if (Array.isArray(data)) return data as BrainPage[];
  if (data && typeof data === "object" && Array.isArray((data as { pages?: unknown }).pages)) {
    return (data as { pages: BrainPage[] }).pages;
  }
  if (data && typeof data === "object" && Array.isArray((data as { items?: unknown }).items)) {
    return (data as { items: BrainPage[] }).items;
  }
  return [];
}

export const GET = createPublicHandler(
  {
    query: querySchema,
    cors: true,
    cacheMaxAge: 15,
    rateLimitKey: (req) => `portal-doc-req:${clientIp(req.headers)}`,
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

    const res = await fetch(`${ENGINE_URL}/api/pages?type=document_request&limit=200`, {
      headers: engineHeadersForBrain(payload.brain_id),
    });
    if (!res.ok) {
      return apiError(
        "document_requests_load_failed",
        "Dokumentenanfragen konnten nicht geladen werden",
        502
      );
    }

    const requests = pagesFrom(await res.json())
      .map(documentRequestFromPage)
      .filter(
        (request): request is NonNullable<ReturnType<typeof documentRequestFromPage>> =>
          request !== null
      )
      .filter((request) => request.frontmatter.case_slug === payload.case_slug)
      .filter((request) => request.frontmatter.status !== "expired")
      .sort(
        (a, b) =>
          new Date(b.frontmatter.created_at).getTime() -
          new Date(a.frontmatter.created_at).getTime()
      );

    return Response.json({ requests });
  }
);
