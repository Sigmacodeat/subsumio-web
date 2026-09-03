import { createHandler, apiError } from "@/lib/api-handler";
import { getBackupFile, deleteBackup } from "@/lib/backup";
import { z } from "zod";

export const maxDuration = 120;

export const GET = createHandler(
  {
    action: "admin.*",
    rateTier: "standard",
    query: z.object({
      action: z.enum(["download", "preview"]).optional(),
    }),
  },
  async (ctx, _body, query, req) => {
    const { id } = await (req as unknown as { params: Promise<{ id: string }> }).params;
    if (!id) return apiError("missing_id", "Backup ID required", 400);

    const result = await getBackupFile(id);
    if (!result) return apiError("not_found", "Backup not found", 404);

    if (query.action === "preview") {
      const parsed = JSON.parse(result.content);
      const pages = parsed.pages ?? parsed.data ?? [];
      const preview = (pages as Array<Record<string, unknown>>).slice(0, 20).map((p) => ({
        slug: p.slug,
        title: p.title,
        type: p.type,
      }));
      return Response.json({
        metadata: result.metadata,
        preview,
        totalPages: (pages as unknown[]).length,
      });
    }

    return new Response(result.content, {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="${result.metadata.filename}"`,
        "Cache-Control": "no-store",
      },
    });
  }
);

const restoreSchema = z.object({
  confirm: z.boolean().refine((v) => v === true, "confirmation_required"),
  pageTypes: z.array(z.string()).optional(),
});

export const POST = createHandler(
  {
    action: "admin.*",
    rateTier: "heavy",
    body: restoreSchema,
    audit: (ctx, body) => ({
      action: "backup.restore" as const,
      entityType: "backup",
      details: {
        pageTypes: body.pageTypes ?? null,
        user: ctx.user.email,
      },
    }),
  },
  async (ctx, body, _query, req) => {
    const { id } = await (req as unknown as { params: Promise<{ id: string }> }).params;
    if (!id) return apiError("missing_id", "Backup ID required", 400);

    const result = await getBackupFile(id);
    if (!result) return apiError("not_found", "Backup not found", 404);

    const parsed = JSON.parse(result.content);
    const pages: Array<Record<string, unknown>> = parsed.pages ?? parsed.data ?? [];

    const ENGINE_URL = process.env.SUBSUMIO_API_URL || "http://localhost:3001";
    let restored = 0;
    let skipped = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const page of pages) {
      if (body.pageTypes && body.pageTypes.length > 0) {
        const pageType = (page.type as string) || "unknown";
        if (!body.pageTypes.includes(pageType)) {
          skipped++;
          continue;
        }
      }

      try {
        const slug = page.slug as string;
        const title = page.title as string;
        if (!slug || !title) {
          skipped++;
          continue;
        }

        const res = await fetch(`${ENGINE_URL}/api/pages/${encodeURIComponent(slug)}`, {
          method: "PUT",
          headers: { ...ctx.headers, "Content-Type": "application/json" },
          body: JSON.stringify({
            slug,
            title,
            type: page.type,
            content: page.content,
            frontmatter: page.frontmatter,
          }),
          signal: AbortSignal.timeout(10_000),
        });

        if (!res.ok) {
          // Try POST if PUT fails (page doesn't exist yet)
          const createRes = await fetch(`${ENGINE_URL}/api/pages`, {
            method: "POST",
            headers: { ...ctx.headers, "Content-Type": "application/json" },
            body: JSON.stringify({
              slug,
              title,
              type: page.type,
              content: page.content,
              frontmatter: page.frontmatter,
            }),
            signal: AbortSignal.timeout(10_000),
          });
          if (!createRes.ok) {
            failed++;
            errors.push(`${slug}: ${createRes.status}`);
            continue;
          }
        }
        restored++;
      } catch (err) {
        failed++;
        errors.push(`${page.slug}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    return Response.json({
      ok: true,
      restored,
      skipped,
      failed,
      errors: errors.slice(0, 10),
    });
  }
);

export const DELETE = createHandler(
  {
    action: "admin.*",
    rateTier: "standard",
    audit: (ctx, _body, _query, _req) => ({
      action: "backup.delete" as const,
      entityType: "backup",
      details: { user: ctx.user.email },
    }),
  },
  async (ctx, _body, _query, req) => {
    const { id } = await (req as unknown as { params: Promise<{ id: string }> }).params;
    if (!id) return apiError("missing_id", "Backup ID required", 400);

    const deleted = await deleteBackup(id);
    if (!deleted) return apiError("not_found", "Backup not found", 404);
    return Response.json({ ok: true });
  }
);
