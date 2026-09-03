import { z } from "zod";
import { createHandler, apiError, apiSuccess } from "@/lib/api-handler";
import { safeCorpusPath, deleteFile, deleteFilesBulk } from "@/lib/corpus-steward";
import { removeIndexEntry } from "@/lib/corpus-index";
import { markiereZumImport } from "@/lib/corpus-import-queue";
import { existsSync } from "fs";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const bodySchema = z.object({
  path: z.string().optional(),
  paths: z.array(z.string()).optional(),
});

/**
 * POST /api/admin/corpus-files/delete
 *
 * Löscht eine oder mehrere Dateien (mit Version-Snapshot vor Löschung).
 * deleteFile/deleteFilesBulk rufen intern removeFromRawCorpus auf (BUG 23).
 */
export const POST = createHandler(
  {
    action: "admin.*",
    body: bodySchema,
    audit: (ctx, body) => ({
      action: "corpus.file_delete" as const,
      entityType: "corpus_file",
      details: {
        path: body.path,
        paths: body.paths,
        deleted_by: ctx.user.email,
      },
    }),
  },
  async (ctx, body) => {
    // Single delete
    if (body.path) {
      const absPath = safeCorpusPath(body.path);
      if (!absPath) return apiError("validation_failed", "Invalid path", 400);
      if (!existsSync(absPath)) return apiError("not_found", "File not found", 404);

      try {
        deleteFile(body.path, ctx.user.email);

        // Update Index (Disk + Memory — entfernt den gelöschten Pfad)
        const corpus = body.path.split("/")[0];
        removeIndexEntry(corpus, body.path);

        // Die Datei ist weg, die DB-Seite noch da. Ohne Vormerkung bliebe ein
        // gelöschtes Dokument im KI-Gehirn abrufbar und zitierfähig.
        markiereZumImport(body.path, ctx.user.email, "delete");

        return apiSuccess({ deleted: true, path: body.path, importAusstehend: true });
      } catch (err) {
        return apiError("delete_failed", (err as Error).message, 500);
      }
    }

    // Bulk delete
    if (body.paths && body.paths.length > 0) {
      if (body.paths.length > 100) {
        return apiError("validation_failed", "Max 100 files per bulk delete", 400);
      }
      const result = deleteFilesBulk(body.paths, ctx.user.email);

      // Update indices for all affected corpora
      const corpora = new Set(body.paths.map((p) => p.split("/")[0]));
      for (const c of corpora) {
        for (const p of body.paths) {
          if (p.split("/")[0] === c) removeIndexEntry(c, p);
        }
      }

      for (const p of body.paths) {
        markiereZumImport(p, ctx.user.email, "delete");
      }

      return apiSuccess(result);
    }

    return apiError("validation_failed", "Either 'path' or 'paths' is required", 400);
  }
);
