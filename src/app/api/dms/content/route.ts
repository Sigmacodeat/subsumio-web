import { z } from "zod";
import { getConnector } from "@/lib/dms";
import { createHandler, apiError } from "@/lib/api-handler";

import { logger } from "@/lib/logger";
const log = logger("api/dms/content");

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const dmsContentSchema = z.object({
  id: z.string().min(1).max(500),
});

/**
 * GET /api/dms/content?id=<dmsDocId>
 *
 * Streamt den Binär-Content eines DMS-Dokuments on-demand aus dem
 * konfigurierten DMS. Use-Case: importierte Dokumente mit
 * `document_oversized: true` liegen nicht inline in der Page —
 * dieser Endpoint lädt sie bei Bedarf direkt aus dem DMS nach.
 */
export const GET = createHandler(
  {
    action: "brain.read",
    rateTier: "standard",
    query: dmsContentSchema,
  },
  async (_ctx, _body, query) => {
    const connector = await getConnector();
    if (!connector || !connector.isConfigured()) {
      return apiError("dms_not_configured", "DMS nicht konfiguriert", 503);
    }

    try {
      const [doc, content] = await Promise.all([
        connector.getDocument(query.id),
        connector.getDocumentContent(query.id),
      ]);
      if (!doc) return apiError("not_found", "Dokument nicht gefunden", 404);
      if (!content) {
        return apiError("content_unavailable", "Dokumentinhalt nicht abrufbar", 502);
      }

      const filename = encodeURIComponent(doc.name).replace(/'/g, "%27");
      // Inline nur für MIME-Typen ohne aktiven Content — ein als HTML/SVG
      // abgelegtes DMS-Dokument würde sonst mit App-Origin-Session
      // rendern (Stored-XSS-Vektor). Alles andere geht als Attachment.
      const mime = content.mimeType.split(";")[0].trim().toLowerCase();
      const safeInline =
        mime === "application/pdf" ||
        mime === "text/plain" ||
        /^image\/(png|jpe?g|gif|webp|avif|bmp)$/.test(mime);
      return new Response(content.data, {
        headers: {
          "Content-Type": content.mimeType,
          "Content-Length": String(content.data.byteLength),
          "Content-Disposition": `${safeInline ? "inline" : "attachment"}; filename*=UTF-8''${filename}`,
          "X-Content-Type-Options": "nosniff",
          "Cache-Control": "private, no-store",
        },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error("[dms content] error:", msg);
      return apiError("content_failed", "Download fehlgeschlagen", 500);
    }
  }
);
