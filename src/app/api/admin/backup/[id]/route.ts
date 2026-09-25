import { createHandler, apiError } from "@/lib/api-handler";
import { getBackupFile, deleteBackup, backupOriginBrainId } from "@/lib/backup";
import { z } from "zod";

export const maxDuration = 120;

export const GET = createHandler(
  {
    action: "platform.operator",
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
  /** Why the firm's data is overwritten — goes into the audit log. */
  reason: z.string().trim().min(10, "reason_required").max(500),
  pageTypes: z.array(z.string()).optional(),
});

function backupIdFrom(req: Request | undefined): string {
  if (!req) return "";
  const last = new URL(req.url).pathname.split("/").filter(Boolean).pop() ?? "";
  return decodeURIComponent(last);
}

export const POST = createHandler(
  {
    action: "platform.operator",
    rateTier: "heavy",
    body: restoreSchema,
    audit: (ctx, body, _query, req) => ({
      action: "backup.restore" as const,
      entityType: "backup",
      entityId: backupIdFrom(req),
      details: {
        pageTypes: body.pageTypes ?? null,
        user: ctx.user.email,
        brainId: ctx.brainId,
        orgName: ctx.supportSession?.orgName ?? null,
        reason: body.reason,
      },
    }),
  },
  async (ctx, body, _query, req) => {
    const { id } = await (req as unknown as { params: Promise<{ id: string }> }).params;
    if (!id) return apiError("missing_id", "Backup ID required", 400);

    const result = await getBackupFile(id);
    if (!result) return apiError("not_found", "Backup not found", 404);

    // A restore writes into the firm of the active support session. It is
    // only allowed back into the firm the backup was taken from.
    if (!ctx.supportSession) {
      return apiError(
        "support_session_required",
        "Wiederherstellung nur innerhalb einer Support-Sitzung für die Kanzlei des Backups",
        409
      );
    }
    const parsed = JSON.parse(result.content);
    const origin = backupOriginBrainId(parsed);
    if (!origin || (result.metadata.brainId && result.metadata.brainId !== origin)) {
      return apiError(
        "backup_origin_unknown",
        "Herkunfts-Kanzlei des Backups ist nicht eindeutig — keine Wiederherstellung",
        409
      );
    }
    if (origin !== ctx.brainId) {
      return apiError(
        "backup_tenant_mismatch",
        "Backup gehört zu einer anderen Kanzlei als die aktive Support-Sitzung",
        409
      );
    }
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

        // Restore replaces the stored page with the backed-up state (the
        // engine has no PUT for pages; a create without merge replaces).
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
    action: "platform.operator",
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
