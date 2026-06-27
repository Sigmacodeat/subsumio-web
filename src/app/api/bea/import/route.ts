import { z } from "zod";
import { createServerBrainClient } from "@/lib/server-brain";
import { createHandler, apiError, apiSuccess } from "@/lib/api-handler";
import { buildBeaImportBundle, parseBeaXmlBatch } from "@/lib/bea-import";
import { broadcastSseEvent } from "@/lib/realtime-bus";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const beaFileSchema = z.object({
  filename: z.string().min(1).max(240),
  content: z.string().min(1, "content_required").max(10_000_000, "content_too_large"),
});

const beaImportSchema = z.object({
  filename: z.string().max(240).optional(),
  files: z.array(beaFileSchema).min(1, "files_required").max(50),
  source: z.enum(["upload", "watch_dir", "manual"]).default("upload"),
  dry_run: z.boolean().default(false),
});

export const POST = createHandler(
  {
    action: "brain.write",
    rateTier: "heavy",
    quota: "uploads",
    body: beaImportSchema,
    audit: (ctx, body) => ({
      action: "connector.sync" as const,
      entityType: "bea_import",
      entityId: body.filename || "bea-import",
      details: {
        brainId: ctx.brainId,
        files: body.files.length,
        source: body.source,
        dry_run: body.dry_run,
      },
    }),
  },
  async (ctx, body) => {
    const parsed = parseBeaXmlBatch(body.files);
    const bundle = buildBeaImportBundle(parsed, {
      filename: body.filename || body.files[0]?.filename,
      source: body.source,
      importedBy: ctx.user.email,
    });

    if (parsed.valid_count === 0) {
      return apiError("bea_no_valid_messages", "Keine gueltigen beA-Nachrichten gefunden", 422, {
        errors: parsed.errors,
      });
    }

    if (body.dry_run) {
      return apiSuccess({
        dry_run: true,
        result: parsed,
        import_page: bundle.importPage,
        message_pages: bundle.messagePages,
      });
    }

    try {
      const brain = createServerBrainClient(ctx.headers);
      await brain.createPage(bundle.importPage);
      for (const page of bundle.messagePages) {
        await brain.createPage(page);
      }

      broadcastSseEvent(ctx.brainId, "bea.import.created", {
        slug: bundle.importPage.slug,
        valid_count: parsed.valid_count,
        error_count: parsed.error_count,
        by: ctx.user.email,
      });

      return apiSuccess(
        {
          success: true,
          result: parsed,
          import_slug: bundle.importPage.slug,
          message_slugs: bundle.messagePages.map((page) => page.slug),
        },
        undefined,
        parsed.error_count > 0 ? 207 : 201
      );
    } catch (err) {
      console.error("[bea-import] failed:", err instanceof Error ? err.message : String(err));
      return apiError("bea_import_failed", "beA-Import konnte nicht gespeichert werden", 500);
    }
  }
);
