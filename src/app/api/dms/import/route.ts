import { z } from "zod";
import { getConnectorForBrain } from "@/lib/dms";
import { recordQuota } from "@/lib/engine";
import { createHandler, apiError } from "@/lib/api-handler";
import { caseAccessAllowed, caseAccessForUser } from "@/lib/email/case-link";

import { logger } from "@/lib/logger";
const log = logger("api/dms/import");

export const maxDuration = 60;

const dmsImportSchema = z.object({
  documentId: z.string().min(1, "document_id_required").max(500),
  /** Optional: link the imported document to a matter. */
  caseSlug: z.string().trim().min(1).max(300).optional(),
});

export const POST = createHandler(
  {
    action: "brain.write",
    rateTier: "heavy",
    quota: "uploads",
    body: dmsImportSchema,
    audit: (_ctx, body) => ({
      action: "document.upload" as const,
      entityType: "dms_document",
      details: { documentId: body.documentId, caseSlug: body.caseSlug ?? null },
    }),
  },
  async (ctx, body, _query, _req) => {
    const connector = await getConnectorForBrain(ctx.brainId);
    if (!connector || !connector.isConfigured()) {
      return apiError("dms_not_configured", "DMS nicht eingerichtet", 503);
    }

    // Linking to a matter needs access to that matter (scope + ethical wall).
    if (body.caseSlug) {
      const access = await caseAccessForUser(ctx.headers, body.caseSlug, ctx.user.id).catch(
        () => "not_found" as const
      );
      if (!caseAccessAllowed(access)) {
        return apiError("case_forbidden", "Kein Zugriff auf diese Akte", 403);
      }
    }

    try {
      const doc = await connector.getDocument(body.documentId);
      if (!doc) {
        return apiError("document_not_found", "Dokument nicht gefunden", 404);
      }

      const result = await connector.importToBrain(doc, ctx.brainId, ctx.headers, {
        caseSlug: body.caseSlug,
      });
      void recordQuota(ctx, "uploads");
      return Response.json(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error("[dms import] error:", msg);
      return apiError("import_failed", "Import fehlgeschlagen", 500);
    }
  }
);
