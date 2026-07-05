import { z } from "zod";
import { createHandler, apiError } from "@/lib/api-handler";
import { enginePatchPage } from "@/lib/engine";
import { actImportItemSlug, safeImportId } from "@/lib/act-import";
import { fetchActImportItems } from "@/lib/act-import-server";

const itemSchema = z.object({
  item_id: z.string().min(1),
  case_slug: z.string().min(1),
  relative_path: z.string().min(1).max(1000),
  filename: z.string().min(1).max(300),
  size: z.number().int().min(0),
  mime_type: z.string().optional(),
  sha256: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
  document_slug: z.string().optional(),
  part_slugs: z.array(z.string()).optional(),
  status: z.enum([
    "pending",
    "uploading",
    "processing",
    "ready",
    "partial",
    "review",
    "duplicate",
    "failed",
  ]),
  extraction_status: z.string().optional(),
  extraction_method: z.string().optional(),
  embedding_status: z.string().optional(),
  classification: z.string().optional(),
  jurisdiction: z.string().optional(),
  on_count: z.number().int().min(0).optional(),
  page_count: z.number().int().min(0).optional(),
  warning_count: z.number().int().min(0).optional(),
  error_code: z.string().optional(),
  error: z.string().max(1000).optional(),
  attempts: z.number().int().min(0).default(0),
});

function routeId(req: Request): Promise<string> {
  return (req as unknown as { params: Promise<{ id: string }> }).params.then((p) =>
    safeImportId(p.id)
  );
}

const querySchema = z.object({
  offset: z.coerce.number().int().min(0).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

export const GET = createHandler(
  { action: "brain.read", rateTier: "standard", query: querySchema },
  async (ctx, _body, query, req) => {
    const id = await routeId(req);
    const offset = Math.max(0, query?.offset ?? 0);
    const limit = Math.min(100, Math.max(1, query?.limit ?? 100));
    const items = await fetchActImportItems(ctx.headers, id, { offset, limit });
    return Response.json({ items, offset, limit, has_more: items.length === limit });
  }
);

export const POST = createHandler(
  { action: "brain.write", rateTier: "heavy", body: itemSchema },
  async (ctx, body, _query, req) => {
    const sessionId = await routeId(req);
    const itemId = safeImportId(body.item_id);
    const now = new Date().toISOString();
    const item = {
      id: itemId,
      sessionId,
      caseSlug: body.case_slug,
      relativePath: body.relative_path,
      filename: body.filename,
      size: body.size,
      mimeType: body.mime_type,
      sha256: body.sha256,
      documentSlug: body.document_slug,
      partSlugs: body.part_slugs ?? [],
      status: body.status,
      extractionStatus: body.extraction_status,
      extractionMethod: body.extraction_method,
      embeddingStatus: body.embedding_status,
      classification: body.classification,
      jurisdiction: body.jurisdiction,
      onCount: body.on_count ?? 0,
      pageCount: body.page_count ?? 0,
      warningCount: body.warning_count ?? 0,
      errorCode: body.error_code,
      error: body.error,
      attempts: body.attempts,
      updatedAt: now,
    };
    const response = await enginePatchPage(ctx.headers, {
      slug: actImportItemSlug(sessionId, itemId),
      title: body.filename,
      type: "act_import_item",
      content: `Import item for ${body.relative_path}`,
      frontmatter: item,
    });
    if (!response.ok) return apiError("item_write_failed", await response.text(), 502);
    return Response.json({ ok: true, item });
  }
);
