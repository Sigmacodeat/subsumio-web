import { z } from "zod";
import { createHandler, apiError, apiSuccess } from "@/lib/api-handler";
import { getCorpusIndex, hasIndex, isIndexStale } from "@/lib/corpus-index";
import { getFlagsBulk } from "@/lib/corpus-steward";
import { basename } from "path";

export const dynamic = "force-dynamic";
export const maxDuration = 10;

const querySchema = z.object({
  corpus: z.string().min(1).max(100),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
  sort: z.enum(["name", "date", "size"]).default("name"),
  flag: z
    .enum(["verified", "needs_review", "defective", "unreviewed", "archived", "all"])
    .default("all"),
  hideArchived: z.coerce.boolean().default(true),
});

interface FileEntry {
  path: string;
  name: string;
  size: number;
  modified: string;
  flag: string | null;
}

/**
 * GET /api/admin/corpus-files/list?corpus=at-judikatur-vwgh&page=1&pageSize=50
 *
 * Paginierte Datei-Liste aus Memory-Index (kein glob+stat).
 */
export const GET = createHandler(
  {
    action: "admin.*",
    query: querySchema,
  },
  async (ctx, _body, query) => {
    const { corpus, page, pageSize, sort, flag: flagFilter, hideArchived } = query;

    // BUG 36: vorher nur at-*/at — de/ch/eu wurden abgewiesen.
    if (
      !corpus.startsWith("at-") &&
      !corpus.startsWith("de") &&
      !corpus.startsWith("ch") &&
      !corpus.startsWith("eu") &&
      corpus !== "at"
    ) {
      return apiError("validation_failed", "Invalid corpus name", 400);
    }

    // Auto-Build-Hint wenn Index fehlt oder veraltet ist
    const indexMissing = !hasIndex(corpus);
    const indexStale = !indexMissing && isIndexStale(corpus);

    const entries = getCorpusIndex(corpus);
    if (entries.length === 0) {
      return apiSuccess({
        corpus,
        page,
        pageSize,
        total: 0,
        totalPages: 0,
        files: [],
        indexMissing,
        indexStale,
      });
    }

    // Bulk load flags
    const relPaths = entries.map((e) => e.path);
    const flags = getFlagsBulk(relPaths);

    // Build entries
    let fileEntries: FileEntry[] = entries.map((e) => ({
      path: e.path,
      name: basename(e.path),
      size: e.size,
      modified: new Date(e.mtime * 1000).toISOString(),
      flag: flags[e.path]?.flag ?? null,
    }));

    // Filter by flag
    if (flagFilter !== "all") {
      fileEntries = fileEntries.filter((e) => {
        if (flagFilter === "unreviewed") return e.flag === null;
        return e.flag === flagFilter;
      });
    }

    // Hide archived by default — finished laws disappear from the working list
    if (hideArchived && flagFilter !== "archived") {
      fileEntries = fileEntries.filter((e) => e.flag !== "archived");
    }

    // Sort (Index ist schon nach Pfad sortiert, aber andere Sortierungen möglich)
    if (sort !== "name") {
      fileEntries.sort((a, b) => {
        if (sort === "date") return b.modified.localeCompare(a.modified);
        if (sort === "size") return b.size - a.size;
        return 0;
      });
    }

    // Paginate
    const total = fileEntries.length;
    const totalPages = Math.ceil(total / pageSize);
    const start = (page - 1) * pageSize;
    const pageEntries = fileEntries.slice(start, start + pageSize);

    return apiSuccess({
      corpus,
      page,
      pageSize,
      total,
      totalPages,
      files: pageEntries,
      indexMissing,
      indexStale,
    });
  }
);
