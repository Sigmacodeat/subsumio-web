import { createHandler, apiError } from "@/lib/api-handler";
import {
  actImportItemSlug,
  actImportSessionSlug,
  computeActImportMetrics,
  safeImportId,
} from "@/lib/act-import";
import { enginePatchPage } from "@/lib/engine";
import { fetchAllActImportItems, fetchEnginePage } from "@/lib/act-import-server";

export const POST = createHandler(
  { action: "brain.write", rateTier: "heavy" },
  async (ctx, _body, _query, req) => {
    const { id: rawId } = await (req as unknown as { params: Promise<{ id: string }> }).params;
    const id = safeImportId(rawId);
    const session = await fetchEnginePage(ctx.headers, actImportSessionSlug(id));
    if (!session) return apiError("import_not_found", "Aktenimport nicht gefunden", 404);
    const items = await fetchAllActImportItems(ctx.headers, id);
    let changed = 0;
    for (const item of items) {
      if (!item.documentSlug || ["duplicate", "failed"].includes(item.status)) continue;
      const page = await fetchEnginePage(ctx.headers, item.documentSlug);
      if (!page) continue;
      const fm = (page.frontmatter ?? {}) as Record<string, unknown>;
      const extraction = String(fm.extraction_status ?? item.extractionStatus ?? "processing");
      const embedding = String(fm.embedding_status ?? item.embeddingStatus ?? "unknown");
      const failed = ["failed", "error", "ocr_failed"].includes(extraction);
      const partial = extraction === "partial" || fm.extraction_unverified === true;
      const ready = ["ready", "text_layer", "ocr_complete"].includes(extraction);
      const status = failed ? "failed" : partial ? "partial" : ready ? "ready" : "processing";
      const warnings = Array.isArray(fm.extraction_warnings)
        ? fm.extraction_warnings.length
        : fm.extraction_warnings
          ? 1
          : 0;
      const next = {
        ...item,
        status,
        extractionStatus: extraction,
        extractionMethod: String(fm.extraction_method ?? ""),
        embeddingStatus: embedding,
        classification: String(fm.doc_type ?? fm.document_type ?? ""),
        jurisdiction: String(fm.jurisdiction ?? ""),
        pageCount: Number(fm.page_count ?? item.pageCount ?? 0),
        warningCount: warnings,
        errorCode: failed ? String(fm.extraction_error_code ?? "extraction_failed") : undefined,
        error: failed ? String(fm.extraction_error ?? "Extraktion fehlgeschlagen") : undefined,
        updatedAt: new Date().toISOString(),
      };
      await enginePatchPage(ctx.headers, {
        slug: actImportItemSlug(id, item.id),
        type: "act_import_item",
        frontmatter: next,
      });
      changed++;
    }
    const refreshed = await fetchAllActImportItems(ctx.headers, id);
    const metrics = computeActImportMetrics(refreshed);
    await enginePatchPage(ctx.headers, {
      slug: actImportSessionSlug(id),
      frontmatter: {
        metrics,
        status: metrics.canFinalize ? "ready_for_analysis" : "ingesting",
        updated_at: new Date().toISOString(),
      },
    });
    return Response.json({ ok: true, changed, metrics });
  }
);
