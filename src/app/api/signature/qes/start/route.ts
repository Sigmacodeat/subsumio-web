import { z } from "zod";
import { createHandler, apiError, apiSuccess } from "@/lib/api-handler";
import { ENGINE_URL } from "@/lib/engine";
import { buildSignUrl, signedFilename } from "@/lib/qes/pdf-as";
import { appBase, pdfAsBase } from "@/lib/qes/config";
import { createQesSession } from "@/lib/qes/sessions";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  document_slug: z.string().min(1).max(500),
  method: z.enum(["id_austria", "a_trust_card"]),
});

/**
 * Starts a qualified signature of a matter's PDF. Returns the PDF-AS-WEB
 * address the browser is sent to.
 */
export const POST = createHandler(
  {
    action: "brain.write",
    rateTier: "standard",
    body: bodySchema,
    audit: (_ctx, body) => ({
      action: "signature.qes_start" as const,
      entityType: "document",
      entityId: body.document_slug,
      details: { method: body.method },
    }),
  },
  async (ctx, body) => {
    const base = pdfAsBase();
    if (!base) {
      return apiError(
        "qes_not_configured",
        "Qualifizierte Signatur ist für diese Installation noch nicht eingerichtet.",
        503
      );
    }
    const res = await fetch(
      `${ENGINE_URL}/api/pages/${body.document_slug.split("/").map(encodeURIComponent).join("/")}`,
      { headers: ctx.headers, signal: AbortSignal.timeout(10_000) }
    );
    if (!res.ok) return apiError("document_not_found", "Dokument nicht gefunden", 404);
    const page = (await res.json()) as {
      slug: string;
      title?: string;
      frontmatter?: Record<string, unknown>;
    };
    const fm = page.frontmatter ?? {};
    const caseSlug = String(fm.case_slug ?? "");
    if (!caseSlug) {
      return apiError(
        "case_required",
        "Nur Dokumente einer Akte können qualifiziert signiert werden.",
        400
      );
    }
    const name = String(fm.original_filename ?? fm.filename ?? page.title ?? "");
    const mime = String(fm.mime_type ?? fm.content_type ?? "");
    const format = String(fm.source_format ?? "");
    if (!/pdf/i.test(mime) && !/^pdf$/i.test(format) && !/\.pdf$/i.test(name)) {
      return apiError("pdf_required", "Qualifiziert signieren lassen sich nur PDF-Dokumente.", 400);
    }

    const session = await createQesSession({
      brainId: ctx.brainId,
      userId: ctx.user.id,
      userEmail: ctx.user.email,
      documentSlug: page.slug,
      caseSlug,
      title: String(page.title ?? name ?? "Dokument"),
      method: body.method,
    });
    const app = appBase();
    const filename = signedFilename(String(page.title ?? name));
    const redirectUrl = buildSignUrl({
      base,
      method: body.method,
      pdfUrl: `${app}/api/signature/qes/pdf/${session.token}`,
      doneUrl: `${app}/api/signature/qes/done/${session.token}`,
      errorUrl: `${app}/api/signature/qes/error/${session.token}`,
      filename,
    });
    return apiSuccess({ redirectUrl, expiresAt: session.expiresAt });
  }
);
