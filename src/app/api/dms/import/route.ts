import { z } from "zod";
import { getConnector } from "@/lib/dms";
import { recordQuota } from "@/lib/engine";
import { createHandler, apiError } from "@/lib/api-handler";

const dmsImportSchema = z.object({
  documentId: z.string().min(1, "document_id_required"),
});

export const POST = createHandler(
  {
    action: "brain.write",
    rateTier: "heavy",
    quota: "uploads",
    body: dmsImportSchema,
  },
  async (ctx, body, _query, _req) => {
    const connector = await getConnector();
    if (!connector || !connector.isConfigured()) {
      return apiError("dms_not_configured", "DMS nicht konfiguriert", 503);
    }

    try {
      const doc = await connector.getDocument(body.documentId);
      if (!doc) {
        return apiError("document_not_found", "Dokument nicht gefunden", 404);
      }

      const result = await connector.importToBrain(doc, ctx.brainId, ctx.headers);
      void recordQuota(ctx, "uploads");
      return Response.json(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[dms import] error:", msg);
      return apiError("import_failed", "Import fehlgeschlagen", 500);
    }
  }
);
