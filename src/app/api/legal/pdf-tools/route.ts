import { z } from "zod";
import { createHandler, apiError } from "@/lib/api-handler";
import { mergePdfs, mergeStampedAttachments, PdfToolError } from "@/lib/pdf-tools";
import type { AuditAction } from "@/lib/audit";

export const maxDuration = 120;

const querySchema = z.object({
  op: z.enum(["merge", "stamp-merge"]),
  label: z.string().max(60).optional(),
  aktenzeichen: z.string().max(60).optional(),
});

/**
 * PDF-Werkzeuge: Zusammenführen und Anlagenstempel.
 * Schwärzung läuft bewusst clientseitig (pdfjs-Rasterung) — das Dokument
 * verlässt für eine echte, irreversible Schwärzung nie die Kanzlei.
 */
export const POST = createHandler(
  {
    action: "brain.write",
    rateTier: "heavy",
    query: querySchema,
    audit: (ctx, _body, query) => ({
      action: "legal.pdf_tools" as unknown as AuditAction,
      entityType: "document",
      details: { op: query?.op },
    }),
  },
  async (ctx, _body, query, req) => {
    if (!query) return apiError("validation_failed", "op fehlt", 400);
    const form = await req.formData().catch(() => null);
    if (!form) return apiError("invalid_form", "Multipart-Formular erwartet", 400);
    const files = form.getAll("files").filter((f): f is File => f instanceof File);
    if (files.length === 0) return apiError("no_files", "Keine PDF-Dateien übermittelt", 400);
    if (files.some((f) => f.type !== "application/pdf" && !f.name.toLowerCase().endsWith(".pdf"))) {
      return apiError("not_pdf", "Nur PDF-Dateien sind erlaubt", 400);
    }
    const buffers = await Promise.all(files.map((f) => f.arrayBuffer()));

    try {
      const out =
        query.op === "merge"
          ? await mergePdfs(buffers)
          : await mergeStampedAttachments(buffers, {
              label: query.label,
              aktenzeichen: query.aktenzeichen,
            });
      return new Response(Buffer.from(out), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${query.op === "merge" ? "zusammengefuehrt" : "anlagen"}.pdf"`,
        },
      });
    } catch (err) {
      if (err instanceof PdfToolError) {
        return apiError("pdf_error", err.message, 400);
      }
      throw err;
    }
  }
);
