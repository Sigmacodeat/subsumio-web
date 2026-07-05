import { createHandler, apiError } from "@/lib/api-handler";
import { actImportSessionSlug, computeActImportMetrics, safeImportId } from "@/lib/act-import";
import { fetchAllActImportItems, fetchEnginePage } from "@/lib/act-import-server";

function jsonContent(page: Awaited<ReturnType<typeof fetchEnginePage>>): unknown {
  if (!page?.content) return null;
  try {
    return JSON.parse(page.content);
  } catch {
    return page.content;
  }
}

export const GET = createHandler(
  { action: "brain.read", rateTier: "standard" },
  async (ctx, _body, _query, req) => {
    const { id: rawId } = await (req as unknown as { params: Promise<{ id: string }> }).params;
    const id = safeImportId(rawId);
    const session = await fetchEnginePage(ctx.headers, actImportSessionSlug(id));
    if (!session) return apiError("import_not_found", "Aktenimport nicht gefunden", 404);
    const fm = (session.frontmatter ?? {}) as Record<string, unknown>;
    const caseSlug = String(fm.case_slug ?? "");
    const items = await fetchAllActImportItems(ctx.headers, id);
    const [state, onIndex, damage, deadlines] = await Promise.all([
      fetchEnginePage(ctx.headers, `pipeline/state-${caseSlug}`),
      fetchEnginePage(ctx.headers, `on-index/${caseSlug}`),
      fetchEnginePage(ctx.headers, `damage-tables/${caseSlug}`),
      fetchEnginePage(ctx.headers, `deadline-calendars/${caseSlug}`),
    ]);
    return Response.json({
      import_session: session,
      metrics: computeActImportMetrics(items),
      classifications: Object.entries(
        items.reduce<Record<string, number>>((acc, item) => {
          const key = item.classification || "unclassified";
          acc[key] = (acc[key] ?? 0) + 1;
          return acc;
        }, {})
      ).map(([classification, count]) => ({ classification, count })),
      problem_items: items.filter((i) => ["failed", "partial", "review"].includes(i.status)),
      pipeline_state: jsonContent(state),
      on_index: jsonContent(onIndex),
      damage_table: jsonContent(damage),
      deadline_calendar: jsonContent(deadlines),
    });
  }
);
