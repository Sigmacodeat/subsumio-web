import { createHandler, apiError } from "@/lib/api-handler";
import { actImportSessionSlug, computeActImportMetrics, safeImportId } from "@/lib/act-import";
import { fetchAllActImportItems, fetchEnginePage } from "@/lib/act-import-server";

export const GET = createHandler(
  { action: "brain.read", rateTier: "standard" },
  async (ctx, _body, _query, req) => {
    const { id: rawId } = await (req as unknown as { params: Promise<{ id: string }> }).params;
    const id = safeImportId(rawId);
    const session = await fetchEnginePage(ctx.headers, actImportSessionSlug(id));
    if (!session) return apiError("import_not_found", "Aktenimport nicht gefunden", 404);
    const items = await fetchAllActImportItems(ctx.headers, id);
    return Response.json({
      session,
      metrics: computeActImportMetrics(items),
      item_count: items.length,
    });
  }
);
