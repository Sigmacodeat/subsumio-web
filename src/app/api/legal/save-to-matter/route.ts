import { z } from "zod";
import { ENGINE_URL } from "@/lib/engine";
import { createHandler, apiError, apiSuccess } from "@/lib/api-handler";
import { reconcileCaseDocuments } from "@/lib/case-documents";
import {
  savedDocumentContent,
  savedDocumentFrontmatter,
  savedDocumentSlug,
  SOURCE_LABELS,
} from "@/lib/save-to-matter";
import { logger } from "@/lib/logger";

const log = logger("api/legal/save-to-matter");

export const dynamic = "force-dynamic";

const citationSchema = z
  .object({
    code: z.string().max(200),
    paragraph: z.string().max(200),
    verified: z.boolean(),
    support: z.enum(["supported", "partial", "unsupported", "unchecked"]).optional(),
    source_url: z.string().max(1000).optional(),
  })
  .passthrough();

const bodySchema = z.object({
  case_slug: z.string().min(1).max(300),
  title: z.string().trim().min(1).max(200),
  content: z.string().trim().min(1).max(200_000),
  source: z.enum(["chat", "deep_analysis", "dictation", "analysis", "research"]),
  citations: z.array(citationSchema).max(200).optional(),
});

function encodeSlug(slug: string): string {
  return slug.split("/").map(encodeURIComponent).join("/");
}

/**
 * POST /api/legal/save-to-matter — file an AI result (chat answer, analysis,
 * dictation) in a matter as a document. It lands unreviewed, with its
 * grounding verdict, and appears in the matter's document list.
 */
export const POST = createHandler(
  {
    action: "brain.write",
    rateTier: "standard",
    body: bodySchema,
    audit: (_ctx, body) => ({
      action: "case.update" as const,
      entityType: "legal_document",
      entityId: body.case_slug,
      details: { saved_ai_result: body.source, title: body.title },
    }),
  },
  async (ctx, body) => {
    // The matter must exist and be visible to the caller (engine enforces access).
    const caseRes = await fetch(`${ENGINE_URL}/api/pages/${encodeSlug(body.case_slug)}`, {
      headers: ctx.headers,
      signal: AbortSignal.timeout(10_000),
    }).catch(() => null);
    if (!caseRes?.ok) {
      return apiError("case_not_found", "Die Akte wurde nicht gefunden.", 404);
    }

    const now = new Date();
    const slug = savedDocumentSlug(body.case_slug, body.title, now);
    const title = `${body.title} (${SOURCE_LABELS[body.source]})`;
    const content = savedDocumentContent(body);
    const res = await fetch(`${ENGINE_URL}/api/pages`, {
      method: "POST",
      headers: { ...ctx.headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        slug,
        title,
        type: "legal_document",
        content,
        frontmatter: savedDocumentFrontmatter(body, ctx.user.email, now),
      }),
      signal: AbortSignal.timeout(15_000),
    }).catch(() => null);
    if (!res?.ok) {
      log.error("[save-to-matter] page write failed", { status: res?.status });
      return apiError("save_failed", "Das Ergebnis konnte nicht gespeichert werden.", 502);
    }

    try {
      await reconcileCaseDocuments(ctx.headers, body.case_slug, {
        id: slug,
        slug,
        name: title,
        url: "",
        uploadedAt: now.toISOString(),
        size: new TextEncoder().encode(content).byteLength,
        kind: "ki_ergebnis",
        mime_type: "text/markdown",
      });
    } catch (err) {
      // The document exists (and links to the matter via case_slug); only the
      // matter's list entry is missing. Report it instead of pretending.
      log.error("[save-to-matter] matter list update failed", {
        error: err instanceof Error ? err.message : String(err),
      });
      return apiSuccess({ slug, listed: false });
    }
    return apiSuccess({ slug, listed: true });
  }
);
