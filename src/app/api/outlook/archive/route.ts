import { z } from "zod";
import { createHandler, apiSuccess, apiError } from "@/lib/api-handler";
import { ENGINE_URL } from "@/lib/engine";
import { matchEmailToCases, type EmailHeaders } from "@/lib/email-threading";
import { broadcastSseEvent } from "@/lib/realtime-bus";
import type { BrainPage } from "@/lib/types";

export const dynamic = "force-dynamic";

const archiveSchema = z.object({
  messageId: z.string().min(1).max(200),
  subject: z.string().min(1).max(500),
  from: z.string().min(1).max(300),
  to: z.string().max(500).optional(),
  receivedAt: z.string().min(1),
  bodyPreview: z.string().max(2000).optional(),
  webLink: z.string().max(500).optional(),
  caseSlug: z.string().min(1).max(300).optional(),
});

function pagesFrom(data: unknown): BrainPage[] {
  if (Array.isArray(data)) return data as BrainPage[];
  if (data && typeof data === "object" && Array.isArray((data as { pages?: unknown }).pages))
    return (data as { pages: BrainPage[] }).pages;
  if (data && typeof data === "object" && Array.isArray((data as { items?: unknown }).items))
    return (data as { items: BrainPage[] }).items;
  return [];
}

export const POST = createHandler(
  {
    action: "brain.write",
    rateTier: "standard",
    body: archiveSchema,
    audit: (ctx, body) => ({
      action: "connector.sync" as const,
      entityType: "email_archive",
      entityId: body.messageId,
      details: {
        subject: body.subject,
        from: body.from,
        caseSlug: body.caseSlug,
        brainId: ctx.brainId,
      },
    }),
  },
  async (ctx, body) => {
    let caseSlug = body.caseSlug;

    // Auto-match if no caseSlug provided
    if (!caseSlug) {
      try {
        const res = await fetch(`${ENGINE_URL}/api/pages?type=legal_case&limit=500`, {
          headers: ctx.headers,
          signal: AbortSignal.timeout(10_000),
        });
        if (res.ok) {
          const cases = pagesFrom(await res.json()).map((p) => {
            const fm = p.frontmatter as Record<string, unknown>;
            return {
              slug: p.slug,
              title: p.title,
              case_number: String(fm.case_number ?? ""),
              client_name: String(fm.client_name ?? ""),
              client_slug: String(fm.client_slug ?? ""),
              opponent_name: String(fm.opponent_name ?? ""),
            };
          });

          const headers: EmailHeaders = {
            from: body.from,
            subject: body.subject,
            body: body.bodyPreview ?? "",
          };
          const { candidates } = matchEmailToCases(headers, cases);
          if (candidates.length > 0 && candidates[0].matchScore >= 60) {
            caseSlug = candidates[0].slug;
          }
        }
      } catch {
        // Continue without auto-match
      }
    }

    if (!caseSlug) {
      return apiError(
        "no_case_match",
        "Keine passende Akte gefunden. Bitte caseSlug manuell angeben.",
        404
      );
    }

    // Create archived email page
    const slug = `email/archived/${caseSlug}/${Date.now()}-${body.messageId.slice(0, 12)}`;
    const page = {
      slug,
      title: `E-Mail: ${body.subject}`,
      type: "archived_email",
      content: body.bodyPreview ?? "",
      frontmatter: {
        type: "archived_email",
        case_slug: caseSlug,
        message_id: body.messageId,
        subject: body.subject,
        from: body.from,
        to: body.to,
        received_at: body.receivedAt,
        web_link: body.webLink,
        archived_at: new Date().toISOString(),
        archived_by: ctx.user.email,
      },
    };

    const res = await fetch(`${ENGINE_URL}/api/pages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...ctx.headers },
      body: JSON.stringify(page),
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      return apiError("archive_failed", "E-Mail konnte nicht archiviert werden", 502);
    }

    // Add communication entry to case
    try {
      const casePageRes = await fetch(`${ENGINE_URL}/api/pages/${encodeURIComponent(caseSlug)}`, {
        headers: ctx.headers,
        signal: AbortSignal.timeout(10_000),
      });
      if (casePageRes.ok) {
        const casePage = (await casePageRes.json()) as BrainPage;
        const fm = (casePage.frontmatter ?? {}) as Record<string, unknown>;
        const communications = Array.isArray(fm.communications)
          ? (fm.communications as Array<Record<string, unknown>>)
          : [];
        communications.push({
          type: "email",
          date: body.receivedAt,
          subject: body.subject,
          from: body.from,
          archived_slug: slug,
        });
        await fetch(`${ENGINE_URL}/api/pages`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...ctx.headers },
          body: JSON.stringify({
            slug: caseSlug,
            merge: true,
            frontmatter: { communications },
          }),
          signal: AbortSignal.timeout(10_000),
        });
      }
    } catch {
      // Non-critical: email is archived even if case update fails
    }

    broadcastSseEvent(ctx.brainId, "email.archived", {
      caseSlug,
      slug,
      subject: body.subject,
    });

    return apiSuccess({
      ok: true,
      archived_slug: slug,
      case_slug: caseSlug,
      auto_matched: !body.caseSlug,
    });
  }
);
