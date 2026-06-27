import { z } from "zod";
import { createHandler, apiError, apiSuccess } from "@/lib/api-handler";
import { getConnector } from "@/lib/dms";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const pushSchema = z.object({
  filename: z.string().min(1).max(240),
  content_base64: z.string().min(1).max(10_000_000, "content_too_large"),
  folder_id: z.string().max(200).optional(),
  metadata: z.record(z.string(), z.string()).optional(),
});

/**
 * POST /api/dms/push — Push a document from Subsumio back to the configured DMS
 * (iManage Work or NetDocuments). Enables bi-directional sync: documents created
 * or annotated in Subsumio can be exported to the firm's DMS of record.
 */
export const POST = createHandler(
  {
    action: "brain.read",
    rateTier: "heavy",
    quota: "uploads",
    body: pushSchema,
    audit: (ctx, body) => ({
      action: "dms.push" as const,
      entityType: "document",
      entityId: body.filename,
      details: { userId: ctx.user.id, folderId: body.folder_id },
    }),
  },
  async (_ctx, body) => {
    const connector = await getConnector();
    if (!connector) {
      return apiError(
        "dms_not_configured",
        "Kein DMS konfiguriert. Setzen Sie DMS_PROVIDER und DMS_BASE_URL.",
        503
      );
    }

    const result = await connector.pushToDms(body.filename, body.content_base64, {
      folderId: body.folder_id,
      metadata: body.metadata,
    });

    if (!result.success) {
      return apiError("dms_push_failed", result.error ?? "DMS push failed", 502);
    }

    return apiSuccess({
      success: true,
      document_id: result.documentId,
      provider: connector.name,
    });
  }
);
