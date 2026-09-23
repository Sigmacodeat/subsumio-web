import { z } from "zod";
import { getConnector } from "@/lib/dms";
import { createHandler, apiError } from "@/lib/api-handler";
import { logAudit } from "@/lib/audit";

import { logger } from "@/lib/logger";
const log = logger("api/dms/content");

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const dmsContentSchema = z.object({
  id: z.string().min(1).max(500),
  /** "1" erzwingt Content-Disposition: attachment (Download statt Vorschau). */
  download: z.enum(["0", "1"]).optional(),
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
  async (ctx, _body, query, req) => {
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

      // Zugriff auditieren — Mandantengeheimnis/Revisions­sicherheit verlangt
      // nachvollziehbar, wer welches DMS-Dokument geöffnet hat.
      await logAudit("dms.content_download", "dms_document", {
        brainId: ctx.brainId,
        entityId: query.id,
        details: { name: doc.name, user: ctx.user?.email ?? null },
      });

      const filename = encodeURIComponent(doc.name).replace(/'/g, "%27");
      // Inline nur für MIME-Typen ohne aktiven Content — ein als HTML/SVG
      // abgelegtes DMS-Dokument würde sonst mit App-Origin-Session
      // rendern (Stored-XSS-Vektor). Alles andere geht als Attachment.
      const mime = content.mimeType.split(";")[0].trim().toLowerCase();
      const safeInline =
        mime === "application/pdf" ||
        mime === "text/plain" ||
        /^image\/(png|jpe?g|gif|webp|avif|bmp)$/.test(mime);
      const total = content.data.byteLength;
      const baseHeaders: Record<string, string> = {
        "Content-Type": content.mimeType,
        "Content-Disposition": `${safeInline && query.download !== "1" ? "inline" : "attachment"}; filename*=UTF-8''${filename}`,
        "X-Content-Type-Options": "nosniff",
        "Accept-Ranges": "bytes",
        "Cache-Control": "private, no-store",
      };

      // Byte-Range-Support (RFC 9110 §14.1.2): Browser-PDF-Viewer laden
      // große Dokumente in Häppchen — ohne 206-Antworten buffern sie das
      // ganze File, bevor die erste Seite rendert. Multi-Ranges werden
      // nicht unterstützt und fallen auf die volle Antwort zurück.
      const rangeHeader = req.headers.get("range");
      if (rangeHeader) {
        const m = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
        if (m && (m[1] !== "" || m[2] !== "")) {
          let start: number;
          let end: number;
          if (m[1] === "") {
            // Suffix-Range „bytes=-N": die letzten N Bytes.
            const suffix = parseInt(m[2], 10);
            start = Math.max(0, total - suffix);
            end = total - 1;
          } else {
            start = parseInt(m[1], 10);
            end = m[2] === "" ? total - 1 : Math.min(parseInt(m[2], 10), total - 1);
          }
          if (start > end || start >= total) {
            return new Response(null, {
              status: 416,
              headers: { ...baseHeaders, "Content-Range": `bytes */${total}` },
            });
          }
          return new Response(content.data.slice(start, end + 1), {
            status: 206,
            headers: {
              ...baseHeaders,
              "Content-Length": String(end - start + 1),
              "Content-Range": `bytes ${start}-${end}/${total}`,
            },
          });
        }
        // Unparsbarer/Multi-Range-Header → Server darf Range ignorieren (200).
      }

      return new Response(content.data, {
        headers: { ...baseHeaders, "Content-Length": String(total) },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error("[dms content] error:", msg);
      return apiError("content_failed", "Download fehlgeschlagen", 500);
    }
  }
);
