import { createHandler } from "@/lib/api-handler";
import { ENGINE_URL, engineHeadersForBrain } from "@/lib/engine";
import { buildMatterContext } from "@/lib/matter-context";

export const maxDuration = 30;

export const GET = createHandler(
  {
    action: "brain.read",
    rateTier: "standard",
    cacheMaxAge: 30,
  },
  async (ctx, _body, _query, req) => {
    const { caseSlug } = await ((req as unknown as { params: Promise<{ caseSlug: string }> }).params);
    if (!caseSlug) {
      return Response.json(
        { error: "missing_slug", message: "Case slug is required." },
        { status: 400 },
      );
    }

    const bundle = await buildMatterContext(
      caseSlug,
      ENGINE_URL,
      engineHeadersForBrain(ctx.brainId),
    );

    return Response.json({
      case_slug: bundle.case_slug,
      documents: bundle.documents,
      document_count: bundle.documents.length,
      ocr_pending: bundle.documents.filter((d) => d.ocr_status === "ocr_needed" || d.ocr_status === "unknown").length,
      extraction_pending: bundle.documents.filter((d) =>
        d.extraction_status === "ocr_needed" ||
        d.extraction_status === "ocr_failed" ||
        d.extraction_status === "processing" ||
        d.extraction_status === "ocr_processing"
      ).length,
      generated_at: bundle.generated_at,
    });
  },
);
