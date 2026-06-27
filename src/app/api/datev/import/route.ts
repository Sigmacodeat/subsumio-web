import { z } from "zod";
import { createServerBrainClient } from "@/lib/server-brain";
import { createHandler, apiError, apiSuccess } from "@/lib/api-handler";
import { buildDatevImportBundle, parseDatevCsv } from "@/lib/datev-import";
import { broadcastSseEvent } from "@/lib/realtime-bus";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const datevImportSchema = z.object({
  filename: z.string().min(1).max(240).default("datev-import.csv"),
  content: z.string().min(1, "content_required"),
  source: z.enum(["upload", "watch_dir", "manual"]).default("upload"),
  dry_run: z.boolean().default(false),
});

export const POST = createHandler(
  {
    action: "brain.write",
    rateTier: "heavy",
    quota: "uploads",
    body: datevImportSchema,
    audit: (ctx, body) => ({
      action: "connector.sync" as const,
      entityType: "datev_import",
      entityId: body.filename,
      details: {
        brainId: ctx.brainId,
        source: body.source,
        dry_run: body.dry_run,
      },
    }),
  },
  async (ctx, body) => {
    const parsed = parseDatevCsv(body.content);
    const bundle = buildDatevImportBundle(parsed, {
      filename: body.filename,
      source: body.source,
      importedBy: ctx.user.email,
    });

    if (parsed.valid_count === 0) {
      return apiError("datev_no_valid_entries", "Keine gueltigen DATEV-Buchungen gefunden", 422, {
        errors: parsed.errors,
        warnings: bundle.warnings,
      });
    }

    if (body.dry_run) {
      return apiSuccess({
        dry_run: true,
        result: parsed,
        warnings: bundle.warnings,
        import_page: bundle.importPage,
        booking_pages: bundle.bookingPages,
      });
    }

    try {
      const brain = createServerBrainClient(ctx.headers);
      await brain.createPage(bundle.importPage);
      for (const page of bundle.bookingPages) {
        await brain.createPage(page);
      }

      broadcastSseEvent(ctx.brainId, "datev.import.created", {
        slug: bundle.importPage.slug,
        valid_count: parsed.valid_count,
        error_count: parsed.error_count,
        by: ctx.user.email,
      });

      return apiSuccess(
        {
          success: true,
          result: parsed,
          warnings: bundle.warnings,
          import_slug: bundle.importPage.slug,
          booking_slugs: bundle.bookingPages.map((page) => page.slug),
        },
        undefined,
        parsed.error_count > 0 ? 207 : 201
      );
    } catch (err) {
      console.error("[datev-import] failed:", err instanceof Error ? err.message : String(err));
      return apiError("datev_import_failed", "DATEV-Import konnte nicht gespeichert werden", 500);
    }
  }
);
