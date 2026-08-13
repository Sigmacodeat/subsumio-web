import { z } from "zod";
import { createHandler, apiError, apiSuccess } from "@/lib/api-handler";
import { restoreVersion, safeCorpusPath } from "@/lib/corpus-steward";
import { updateIndexEntry } from "@/lib/corpus-index";
import { markiereZumImport } from "@/lib/corpus-import-queue";
import { statSync } from "fs";

export const dynamic = "force-dynamic";
export const maxDuration = 10;

const bodySchema = z.object({
  path: z.string().min(3).max(500),
  version: z.coerce.number().int().min(1),
});

/**
 * POST /api/admin/corpus-files/restore
 *
 * Stellt eine spezifische Version einer Datei wieder her.
 * restoreVersion ruft intern syncToRawCorpus auf (BUG 28).
 */
export const POST = createHandler(
  {
    action: "admin.*",
    body: bodySchema,
  },
  async (ctx, body) => {
    const success = restoreVersion(body.path, body.version, ctx.user.email);
    if (!success) {
      return apiError("not_found", "Version oder Datei nicht gefunden", 404);
    }

    // Index aktualisieren (Disk + Memory)
    const corpus = body.path.split("/")[0];
    const absPath = safeCorpusPath(body.path);
    if (absPath) {
      try {
        const stat = statSync(absPath);
        updateIndexEntry(corpus, {
          path: body.path,
          size: stat.size,
          mtime: Math.floor(stat.mtimeMs / 1000),
        });
      } catch {
        // Datei möglicherweise nicht mehr da — Index-Build beim nächsten Refresh korrigiert
      }
    }

    // Wiederherstellen ändert die Datei — ohne Vormerkung bliebe die
    // Datenbank auf der verworfenen Fassung stehen.
    markiereZumImport(body.path, ctx.user.email, "edit");

    return apiSuccess({
      restored: true,
      path: body.path,
      version: body.version,
      importAusstehend: true,
    });
  }
);
