import { z } from "zod";
import { createHandler, apiError, apiSuccess } from "@/lib/api-handler";
import { safeCorpusPath, parseDoc } from "@/lib/corpus-steward";
import { getCorpusIndex } from "@/lib/corpus-index";
import { readFileSync, existsSync } from "fs";
import { basename } from "path";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const querySchema = z.object({
  path: z.string().optional(),
  corpus: z.string().optional(),
  format: z.enum(["json", "csv"]).default("json"),
});

/**
 * GET /api/admin/corpus-files/export?path=... (einzelne Datei)
 * GET /api/admin/corpus-files/export?corpus=at-normen&format=json (ganzes Korpus)
 *
 * Exportiert Dateien als JSON oder CSV.
 */
export const GET = createHandler(
  {
    action: "admin.*",
    query: querySchema,
  },
  async (ctx, _body, query) => {
    // Single file export
    if (query.path) {
      const absPath = safeCorpusPath(query.path);
      if (!absPath || !existsSync(absPath)) {
        return apiError("not_found", "File not found", 404);
      }
      const content = readFileSync(absPath, "utf-8");
      const parsed = parseDoc(content);
      return apiSuccess({
        path: query.path,
        frontmatter: parsed.frontmatter,
        body: parsed.body,
        size: content.length,
      });
    }

    // Corpus export (metadata only — full body would be too large)
    if (query.corpus) {
      if (!query.corpus.startsWith("at-") && query.corpus !== "at") {
        return apiError("validation_failed", "Invalid corpus", 400);
      }
      const entries = getCorpusIndex(query.corpus);

      if (query.format === "csv") {
        // CSV format: path,size,mtime
        const csvLines = ["path,size_kb,mtime_iso"];
        for (const e of entries) {
          csvLines.push(`${e.path},${(e.size / 1024).toFixed(1)},${new Date(e.mtime * 1000).toISOString()}`);
        }
        return new Response(csvLines.join("\n"), {
          headers: {
            "Content-Type": "text/csv",
            "Content-Disposition": `attachment; filename="${query.corpus}-index.csv"`,
          },
        });
      }

      // JSON format
      return apiSuccess({
        corpus: query.corpus,
        fileCount: entries.length,
        files: entries,
      });
    }

    return apiError("validation_failed", "Either 'path' or 'corpus' is required", 400);
  },
);
