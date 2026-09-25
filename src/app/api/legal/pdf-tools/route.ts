import { z } from "zod";
import { createHandler, apiError } from "@/lib/api-handler";
import { mergePdfs, mergeStampedAttachments, PdfToolError } from "@/lib/pdf-tools";

export const maxDuration = 120;

const opSchema = z.enum(["merge", "stamp-merge"]);

/**
 * PDF-Werkzeuge: Zusammenführen und Anlagenstempel.
 * Schwärzung läuft bewusst clientseitig (pdfjs-Rasterung) — das Dokument
 * verlässt für eine echte, irreversible Schwärzung nie die Kanzlei.
 */
export const POST = createHandler(
  {
    action: "brain.write",
    rateTier: "heavy",
    audit: (_ctx, _body, _query, req) => ({
      action: "legal.pdf_tools" as const,
      entityType: "document",
      details: { op: req ? new URL(req.url).searchParams.get("op") : null },
    }),
  },
  async (ctx, _body, _query, req) => {
    const sp = req ? new URL(req.url).searchParams : new URLSearchParams();
    const op = opSchema.safeParse(sp.get("op"));
    if (!op.success) return apiError("validation_failed", "op=merge|stamp-merge erwartet", 400);
    const label = sp.get("label")?.slice(0, 60) || undefined;
    const aktenzeichen = sp.get("aktenzeichen")?.slice(0, 60) || undefined;
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
        op.data === "merge"
          ? await mergePdfs(buffers)
          : await mergeStampedAttachments(buffers, { label, aktenzeichen });
      return new Response(Buffer.from(out), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${op.data === "merge" ? "zusammengefuehrt" : "anlagen"}.pdf"`,
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
