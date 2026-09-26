import { z } from "zod";
import { createHandler, apiError, apiSuccess } from "@/lib/api-handler";
import { ENGINE_URL } from "@/lib/engine";
import { readCurrentPage } from "@/lib/page-write-guards";
import { CaseArchivedError, detachCaseDocument } from "@/lib/case-documents";
import { broadcastSseEvent } from "@/lib/realtime-bus";

import { logger } from "@/lib/logger";
const log = logger("api/cases/documents/detach");

export const dynamic = "force-dynamic";

const slugSchema = z
  .string()
  .trim()
  .min(1)
  .max(1000)
  .refine((s) => !s.includes("..") && !s.includes("//"), "invalid_slug");

const bodySchema = z.object({
  case_slug: slugSchema,
  doc_slug: slugSchema,
});

/**
 * POST /api/cases/documents/detach — „Aus Akte entfernen".
 *
 * Removes the document from the matter's document list (matter view, matter
 * export) and turns it into an unassigned inbox item. Nothing is deleted.
 */
export const POST = createHandler(
  {
    action: "brain.write",
    rateTier: "standard",
    body: bodySchema,
    audit: (_ctx, body) => ({
      action: "case.update" as const,
      entityType: "legal_case",
      entityId: body.case_slug,
      details: { action: "document_detached", doc_slug: body.doc_slug },
    }),
  },
  async (ctx, body) => {
    const read = await readCurrentPage(ENGINE_URL, ctx.headers, body.case_slug);
    if (read.kind === "error") {
      return apiError("engine_unreachable", "Die Akte konnte nicht geprüft werden", 503);
    }
    if (read.kind === "missing") return apiError("not_found", "Akte nicht gefunden", 404);
    if ((read.page.type ?? read.page.frontmatter?.type) !== "legal_case") {
      return apiError("not_a_case", "Die Seite ist keine Akte", 400);
    }

    try {
      const result = await detachCaseDocument(ctx.headers, body.case_slug, body.doc_slug);
      broadcastSseEvent(ctx.brainId, "case.updated", {
        slug: body.case_slug,
        by: ctx.user.email,
        at: new Date().toISOString(),
      });
      return apiSuccess({ ok: true, ...result });
    } catch (err) {
      if (err instanceof CaseArchivedError) {
        return apiError(
          "case_archived",
          "Die Akte ist archiviert — zuerst wiederherstellen, um Dokumente zu entfernen.",
          409
        );
      }
      log.error("[cases/documents/detach] failed:", err instanceof Error ? err.message : err);
      return apiError(
        "detach_failed",
        "Das Dokument konnte nicht aus der Akte entfernt werden. Bitte erneut versuchen.",
        502
      );
    }
  }
);
